#!/usr/bin/env node
// Met le launcher japonais d'Azur Promilia (Yostar, AZUPRO_JP_Gamelauncher) dans une autre langue,
// le français par défaut.
//
//   node launcher-fr.mjs apply     [--lang fr] [dossier]   force une langue (à refaire après chaque mise à jour du launcher)
//   node launcher-fr.mjs restore   [dossier]               remet le launcher d'origine
//   node launcher-fr.mjs status    [dossier]               langue forcée, et textes manquants de chaque langue de locales/
//   node launcher-fr.mjs languages [dossier]               langues possibles pour --lang
//   node launcher-fr.mjs choose    [dossier]               demande la langue, puis applique
//
// La langue est soit une langue ajoutée par ce dépôt (un fichier de locales/), soit une langue
// que le launcher contient déjà (en, ja, ko, zh_cn, zh_tw) : celle-là est seulement forcée.
// Sans dossier, le launcher est cherché aux emplacements habituels de chaque disque.
// Le fichier d'origine est gardé à côté, sous le nom app.asar.original.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { listFiles, readAsar, readEntry, writeAsar } from './lib/asar.mjs';
import { MARKER, extractMain, extractRenderer, forcedLocale, isMain, isRenderer, patchMain, patchRenderer } from './lib/messages.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXE_NAME = 'AZUPRO_JP_Gamelauncher.exe';
const LOCALES_DIR = join(ROOT, 'locales');
const SOURCE_DIR = join(ROOT, 'source');
const DEFAULT_LANG = 'fr';

// Noms affichés par status et languages ; une langue absente de la liste s'affiche par son code.
const LANGUAGE_NAMES = {
  de: 'allemand',
  en: 'anglais',
  es: 'espagnol',
  fr: 'français',
  it: 'italien',
  ja: 'japonais',
  ko: 'coréen',
  pt: 'portugais',
  pt_br: 'portugais du Brésil',
  zh_cn: 'chinois simplifié',
  zh_tw: 'chinois traditionnel',
};

// --- emplacement du launcher -------------------------------------------------------------

function findLauncher(given) {
  if (given) {
    const dir = resolve(given);
    if (existsSync(join(dir, EXE_NAME))) return dir;
    throw new Error(`Pas de ${EXE_NAME} dans ${dir}`);
  }
  const relative = [
    'YostarGames/AZUPRO_JP_Gamelauncher',
    'Program Files/YostarGames/AZUPRO_JP_Gamelauncher',
    'Program Files (x86)/YostarGames/AZUPRO_JP_Gamelauncher',
  ];
  for (const drive of 'CDEFGHIJ') {
    for (const path of relative) {
      const dir = `${drive}:/${path}`;
      if (existsSync(join(dir, EXE_NAME))) return dir;
    }
  }
  const local = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'AZUPRO_JP_Gamelauncher');
  if (existsSync(join(local, EXE_NAME))) return local;
  throw new Error(`Launcher introuvable. Donne son dossier : node launcher-fr.mjs apply "D:\\YostarGames\\AZUPRO_JP_Gamelauncher"`);
}

/**
 * Vrai si le launcher de ce dossier est ouvert : Windows verrouille alors app.asar.
 * Le launcher tourne en administrateur, et Windows cache alors le chemin de son programme :
 * un launcher ouvert dont le chemin est illisible compte comme ouvert, par prudence.
 */
function launcherIsRunning(dir) {
  // Réservé aux essais sur une copie du launcher, pendant que le vrai est ouvert.
  if (process.env.LAUNCHER_FR_SKIP_PROCESS_CHECK === '1') return false;
  const target = resolve(dir, EXE_NAME).toLowerCase();
  const name = EXE_NAME.replace('.exe', '');
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      // « exit 0 » : sans processus trouvé, PowerShell sortirait en erreur.
      `Get-Process '${name}' -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Path) { $_.Path } else { '?' } }; exit 0`,
    ],
    { encoding: 'utf8' },
  );
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((path) => path === '?' || resolve(path).toLowerCase() === target);
}

// --- lecture du launcher -----------------------------------------------------------------

/** Les deux fichiers qui portent du texte, trouvés par leur contenu. */
function locateTextFiles(archive) {
  let renderer = null;
  let main = null;
  for (const [path, entry] of listFiles(archive.header)) {
    if (path.startsWith('node_modules/') || !path.endsWith('.js')) continue;
    const source = readEntry(archive, entry)?.toString('utf8');
    if (!source) continue;
    if (!renderer && isRenderer(source)) renderer = { path, source };
    if (!main && isMain(source)) main = { path, source };
  }
  if (!renderer || !main) {
    throw new Error(
      'Les textes du launcher sont introuvables : sa structure a changé. ' +
        `Fenêtre : ${renderer ? 'trouvée' : 'introuvable'}, menu : ${main ? 'trouvé' : 'introuvable'}.`,
    );
  }
  return { renderer, main };
}

/** Le premier fichier modifié par ce script, ou null si l'archive est d'origine. */
function patchedSource(archive) {
  for (const [path, entry] of listFiles(archive.header)) {
    if (path.startsWith('node_modules/') || !path.endsWith('.js')) continue;
    const data = readEntry(archive, entry);
    if (data?.includes(MARKER)) return data.toString('utf8');
  }
  return null;
}

function isPatched(archive) {
  return patchedSource(archive) !== null;
}

/**
 * Le launcher d'un dossier : l'archive en place et l'archive d'origine, sur laquelle on lit les
 * textes (la sauvegarde si le launcher est déjà modifié). Rien n'est écrit ici.
 */
function readLauncher(dir) {
  const asarPath = join(dir, 'resources', 'app.asar');
  const backupPath = `${asarPath}.original`;
  const current = readAsar(asarPath);
  const patched = isPatched(current);
  if (patched && !existsSync(backupPath)) throw new Error('Launcher déjà modifié, mais app.asar.original est introuvable.');
  const original = patched ? readAsar(backupPath) : current;
  const { renderer, main } = locateTextFiles(original);
  const window = extractRenderer(renderer.source);
  const tray = extractMain(main.source);
  // Une langue du launcher doit exister dans la fenêtre et dans le menu pour être forcée.
  const builtIn = Object.keys(window).filter((lang) => tray[lang]);
  return { asarPath, backupPath, current, patched, original, renderer, main, window, tray, builtIn };
}

// --- langues -----------------------------------------------------------------------------

/** « zh-CN » et « zh_cn » désignent la même langue : le launcher écrit ses codes en zh_cn. */
function normalizeCode(code) {
  return code.trim().toLowerCase().replace(/-/g, '_');
}

function languageLabel(code) {
  return LANGUAGE_NAMES[code] ? `${code} (${LANGUAGE_NAMES[code]})` : code;
}

/** Les langues ajoutées par ce dépôt : code → chemin de locales/<code>.json. */
function addedLanguages() {
  const languages = new Map();
  if (!existsSync(LOCALES_DIR)) return languages;
  for (const name of readdirSync(LOCALES_DIR).sort()) {
    if (!name.endsWith('.json')) continue;
    const code = normalizeCode(basename(name, '.json'));
    // Un code sert de clé dans le code du launcher : on n'accepte que des lettres, chiffres et « _ ».
    if (!/^[a-z]{2,3}(_[a-z0-9]{2,8})*$/.test(code)) {
      console.warn(`Ignoré : locales/${name}, ce nom n'est pas un code de langue (fr, de, pt-BR…).`);
      continue;
    }
    languages.set(code, join(LOCALES_DIR, name));
  }
  return languages;
}

function loadTexts(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`locales/${basename(path)} n'est pas un JSON valide : ${error.message}`);
  }
}

/**
 * Les langues que --lang accepte. Une langue que le launcher a déjà l'emporte sur un fichier
 * de locales/ du même code : on la force telle quelle.
 */
function availableLanguages(launcher) {
  const files = [...addedLanguages()];
  const added = new Map(files.filter(([code]) => !launcher.builtIn.includes(code)));
  const shadowed = files.filter(([code]) => launcher.builtIn.includes(code)).map(([code]) => code);
  return { added, builtIn: launcher.builtIn, shadowed };
}

function describeLanguages({ added, builtIn }) {
  const lines = [];
  lines.push(`  ajoutées par ce dépôt (locales/) : ${[...added.keys()].map(languageLabel).join(', ') || 'aucune'}`);
  lines.push(`  déjà dans le launcher : ${builtIn.map(languageLabel).join(', ')}`);
  return lines.join('\n');
}

/** La langue demandée : { code, texts } pour une langue ajoutée, { code, texts: null } sinon. */
function resolveLanguage(requested, launcher) {
  const code = normalizeCode(requested);
  const languages = availableLanguages(launcher);
  if (languages.builtIn.includes(code)) {
    if (languages.shadowed.includes(code)) console.log(`locales/${code}.json est ignoré : le launcher a déjà cette langue.`);
    return { code, texts: null };
  }
  if (languages.added.has(code)) return { code, texts: loadTexts(languages.added.get(code)) };
  throw new Error(`Langue inconnue : « ${requested} ». Langues possibles :\n${describeLanguages(languages)}`);
}

/** Vérifie que le code modifié se lit encore, avec Node lui-même. */
function assertSyntax(source, extension) {
  const dir = mkdtempSync(join(tmpdir(), 'launcher-fr-'));
  const file = join(dir, `check${extension}`);
  writeFileSync(file, source);
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

// --- commandes ---------------------------------------------------------------------------

function apply(dirArg, { lang = DEFAULT_LANG }) {
  const dir = findLauncher(dirArg);
  console.log(`Launcher : ${dir}`);
  if (launcherIsRunning(dir)) {
    throw new Error('Le launcher est ouvert. Ferme-le (y compris l\'icône près de l\'horloge), puis relance.');
  }

  const launcher = readLauncher(dir);
  const { asarPath, backupPath, renderer, main, window, tray } = launcher;
  // Langue vérifiée avant toute écriture : une faute de frappe ne touche à rien.
  const { code, texts } = resolveLanguage(lang, launcher);

  if (launcher.patched) {
    console.log('Déjà modifié : on repart de l\'original sauvegardé.');
  } else {
    // Launcher d'origine, éventuellement tout juste mis à jour : c'est lui qu'on sauvegarde.
    copyFileSync(asarPath, backupPath);
    console.log('Original sauvegardé : app.asar.original');
  }

  const english = { ...window.en, ...tray.en };
  const japanese = { ...window.ja, ...tray.ja };
  // source/ n'est pas versionné (textes de Yostar) : absent d'un dépôt fraîchement téléchargé.
  mkdirSync(SOURCE_DIR, { recursive: true });
  writeFileSync(join(SOURCE_DIR, 'en.json'), JSON.stringify(english, null, 2) + '\n');
  writeFileSync(join(SOURCE_DIR, 'ja.json'), JSON.stringify(japanese, null, 2) + '\n');

  const patchedRenderer = patchRenderer(renderer.source, code, texts, window.en);
  const patchedMain = patchMain(main.source, code, texts, tray.en);
  assertSyntax(patchedRenderer, '.mjs');
  assertSyntax(patchedMain, '.cjs');

  const temporary = `${asarPath}.tmp`;
  writeAsar(
    launcher.original,
    new Map([
      [renderer.path, Buffer.from(patchedRenderer, 'utf8')],
      [main.path, Buffer.from(patchedMain, 'utf8')],
    ]),
    temporary,
  );
  try {
    const written = patchedSource(readAsar(temporary));
    if (!written || forcedLocale(written) !== code) {
      throw new Error(`Vérification échouée : l'archive écrite ne force pas la langue ${code}.`);
    }
    renameSync(temporary, asarPath);
  } catch (error) {
    // Le fichier temporaire est le nôtre : on ne le laisse pas traîner dans le dossier du launcher.
    unlinkSync(temporary);
    throw error;
  }

  if (texts) {
    const missing = Object.keys(english).filter((key) => !texts[key]);
    console.log(`Langue forcée : ${languageLabel(code)}, ${Object.keys(english).length - missing.length} textes traduits sur ${Object.keys(english).length}.`);
    if (missing.length) {
      console.log(`${missing.length} texte(s) affiché(s) en anglais en attendant leur traduction dans locales/${code}.json :`);
      for (const key of missing) console.log(`  ${key} = ${english[key]}`);
    }
  } else {
    console.log(`Langue forcée : ${languageLabel(code)}, déjà présente dans le launcher (rien n'a été ajouté).`);
  }
  console.log('Tu peux lancer le launcher.');
}

function restore(dirArg) {
  const dir = findLauncher(dirArg);
  const asarPath = join(dir, 'resources', 'app.asar');
  const backupPath = `${asarPath}.original`;
  if (launcherIsRunning(dir)) throw new Error('Le launcher est ouvert. Ferme-le, puis relance.');
  if (!isPatched(readAsar(asarPath))) {
    console.log('Le launcher est déjà d\'origine.');
    return;
  }
  if (!existsSync(backupPath)) throw new Error('app.asar.original est introuvable : répare le launcher depuis le site de Yostar.');
  copyFileSync(backupPath, asarPath);
  console.log('Launcher d\'origine remis en place.');
}

function status(dirArg) {
  const dir = findLauncher(dirArg);
  const launcher = readLauncher(dir);
  console.log(`Launcher : ${dir}`);
  if (launcher.patched) {
    const forced = forcedLocale(patchedSource(launcher.current));
    console.log(`Langue forcée : ${forced ? languageLabel(forced) : 'illisible (launcher modifié par une autre version de ce script)'}`);
  } else {
    console.log('Langue forcée : aucune, launcher d\'origine (langue de Windows s\'il la connaît, sinon japonais)');
  }

  const english = { ...launcher.window.en, ...launcher.tray.en };
  const total = Object.keys(english).length;
  const { added, builtIn } = availableLanguages(launcher);
  console.log(`Langues déjà dans le launcher : ${builtIn.map(languageLabel).join(', ')}`);
  console.log(`Langues de locales/ (${total} textes chacune) :`);
  if (!added.size) console.log('  aucune');
  for (const [code, path] of added) {
    let texts;
    try {
      texts = loadTexts(path);
    } catch (error) {
      // Un fichier cassé ne doit pas cacher l'état des autres langues.
      console.log(`  ${languageLabel(code)} : ${error.message}`);
      continue;
    }
    const missing = Object.keys(english).filter((key) => !texts[key]);
    console.log(`  ${languageLabel(code)} : ${total - missing.length} traduits${missing.length ? `, ${missing.length} à traduire` : ''}`);
    for (const key of missing) console.log(`    à traduire : ${key} = ${english[key]}`);
  }
}

function languages(dirArg) {
  const launcher = readLauncher(findLauncher(dirArg));
  console.log(`Langues possibles :\n${describeLanguages(availableLanguages(launcher))}`);
}

/**
 * Liste les langues, demande laquelle forcer, puis applique : c'est la commande de
 * « Choisir la langue du launcher.cmd ». La question est posée ici plutôt que par `set /p` :
 * après `chcp 65001`, cmd lit mal un .cmd qui contient des caractères accentués.
 */
async function choose(dirArg) {
  const dir = findLauncher(dirArg);
  languages(dir);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  // Entrée fermée sans réponse (fenêtre fermée, Ctrl+C) : la question resterait en attente.
  const closed = new Promise((done) => prompt.once('close', () => done(null)));
  const answer = await Promise.race([prompt.question(`Code de la langue (Entrée pour ${DEFAULT_LANG}) : `), closed]);
  prompt.close();
  console.log('');
  if (answer === null) throw new Error('Pas de réponse : le launcher n\'a pas été modifié.');
  apply(dir, { lang: answer.trim() || DEFAULT_LANG });
}

// --- ligne de commande -------------------------------------------------------------------

/** `apply --lang en "D:\…"`, `apply "D:\…" --lang=en` : l'ordre est libre. */
function parseArgs(argv) {
  const args = [...argv];
  // Sans commande, on applique : `node launcher-fr.mjs --lang en`.
  const command = args.length && !args[0].startsWith('--') ? args.shift() : 'apply';
  const options = {};
  let dir;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--lang' || arg.startsWith('--lang=')) {
      const value = arg === '--lang' ? args[++i] : arg.slice('--lang='.length);
      if (!value) throw new Error('--lang attend un code de langue, par exemple --lang en.');
      options.lang = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`Option inconnue : ${arg}`);
    } else if (dir !== undefined) {
      throw new Error(`Un seul dossier de launcher à la fois (reçu : ${dir} et ${arg}).`);
    } else {
      dir = arg;
    }
  }
  if (options.lang !== undefined && command !== 'apply') throw new Error('--lang ne sert qu\'avec apply.');
  return { command, dir, options };
}

const COMMANDS = { apply, restore, status, languages, choose };
try {
  const { command, dir, options } = parseArgs(process.argv.slice(2));
  if (!COMMANDS[command]) throw new Error('Commandes : apply [--lang fr] | restore | status | languages | choose');
  await COMMANDS[command](dir, options);
} catch (error) {
  console.error(`Erreur : ${error.message}`);
  process.exitCode = 1;
}
