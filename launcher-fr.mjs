#!/usr/bin/env node
// Met le launcher japonais d'Azur Promilia (Yostar, AZUPRO_JP_Gamelauncher) en français.
//
//   node launcher-fr.mjs apply   [dossier du launcher]   traduit (à refaire après chaque mise à jour du launcher)
//   node launcher-fr.mjs restore [dossier du launcher]   remet le launcher d'origine
//   node launcher-fr.mjs status  [dossier du launcher]   dit si le launcher est traduit et ce qui manque
//
// Sans dossier, le launcher est cherché aux emplacements habituels de chaque disque.
// Le fichier d'origine est gardé à côté, sous le nom app.asar.original.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, readAsar, readEntry, writeAsar } from './lib/asar.mjs';
import { MARKER, extractMain, extractRenderer, isMain, isRenderer, patchMain, patchRenderer } from './lib/messages.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXE_NAME = 'AZUPRO_JP_Gamelauncher.exe';
const FRENCH_FILE = join(ROOT, 'fr.json');
const SOURCE_DIR = join(ROOT, 'source');

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
  throw new Error(`Launcher introuvable. Donne son dossier : node launcher-fr.mjs apply "D:\\YostarGames\\AZUPRO_JP_Gamelauncher"`);
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
      'Les textes du launcher sont introuvables : sa structure a changé. ' +
        `Fenêtre : ${renderer ? 'trouvée' : 'introuvable'}, menu : ${main ? 'trouvé' : 'introuvable'}.`,
    );
  }
  return { renderer, main };
}

function isPatched(archive) {
  return listFiles(archive.header).some(([path, entry]) => {
    if (path.startsWith('node_modules/') || !path.endsWith('.js')) return false;
    return readEntry(archive, entry)?.includes(MARKER);
  });
}

function loadFrench() {
  return JSON.parse(readFileSync(FRENCH_FILE, 'utf8'));
}

/** Vérifie que le code modifié se lit encore, avec Node lui-même. */
function assertSyntax(source, extension) {
  const dir = mkdtempSync(join(tmpdir(), 'launcher-fr-'));
  const file = join(dir, `check${extension}`);
  writeFileSync(file, source);
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

// --- commandes ---------------------------------------------------------------------------

function apply(dirArg) {
  const dir = findLauncher(dirArg);
  const asarPath = join(dir, 'resources', 'app.asar');
  const backupPath = `${asarPath}.original`;
  console.log(`Launcher : ${dir}`);
  if (launcherIsRunning(dir)) {
    throw new Error('Le launcher est ouvert. Ferme-le (y compris l\'icône près de l\'horloge), puis relance.');
  }

  let archive = readAsar(asarPath);
  if (isPatched(archive)) {
    if (!existsSync(backupPath)) throw new Error('Launcher déjà modifié, mais app.asar.original est introuvable.');
    console.log('Déjà traduit : on repart de l\'original sauvegardé pour appliquer la dernière traduction.');
    archive = readAsar(backupPath);
  } else {
    // Launcher d'origine, éventuellement tout juste mis à jour : c'est lui qu'on sauvegarde.
    copyFileSync(asarPath, backupPath);
    console.log('Original sauvegardé : app.asar.original');
  }

  const { renderer, main } = locateTextFiles(archive);
  const window = extractRenderer(renderer.source);
  const tray = extractMain(main.source);
  const english = { ...window.en, ...tray.en };
  const japanese = { ...window.ja, ...tray.ja };
  // source/ n'est pas versionné (textes de Yostar) : absent d'un dépôt fraîchement téléchargé.
  mkdirSync(SOURCE_DIR, { recursive: true });
  writeFileSync(join(SOURCE_DIR, 'en.json'), JSON.stringify(english, null, 2) + '\n');
  writeFileSync(join(SOURCE_DIR, 'ja.json'), JSON.stringify(japanese, null, 2) + '\n');

  const french = loadFrench();
  const missing = Object.keys(english).filter((key) => !french[key]);
  const patchedRenderer = patchRenderer(renderer.source, french, window.en);
  const patchedMain = patchMain(main.source, french, tray.en);
  assertSyntax(patchedRenderer, '.mjs');
  assertSyntax(patchedMain, '.cjs');

  const temporary = `${asarPath}.tmp`;
  writeAsar(
    archive,
    new Map([
      [renderer.path, Buffer.from(patchedRenderer, 'utf8')],
      [main.path, Buffer.from(patchedMain, 'utf8')],
    ]),
    temporary,
  );
  try {
    if (!isPatched(readAsar(temporary))) throw new Error('Vérification échouée : l\'archive écrite ne contient pas la traduction.');
    renameSync(temporary, asarPath);
  } catch (error) {
    // Le fichier temporaire est le nôtre : on ne le laisse pas traîner dans le dossier du launcher.
    unlinkSync(temporary);
    throw error;
  }

  console.log(`Traduit : ${Object.keys(english).length - missing.length} textes sur ${Object.keys(english).length}.`);
  if (missing.length) {
    console.log(`${missing.length} texte(s) nouveau(x), affiché(s) en anglais en attendant leur traduction dans fr.json :`);
    for (const key of missing) console.log(`  ${key} = ${english[key]}`);
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
  if (!existsSync(backupPath)) throw new Error('app.asar.original est introuvable : répare le launcher depuis le site de Yostar.');
  copyFileSync(backupPath, asarPath);
  console.log('Launcher d\'origine remis en place.');
}

function status(dirArg) {
  const dir = findLauncher(dirArg);
  const asarPath = join(dir, 'resources', 'app.asar');
  const archive = readAsar(asarPath);
  const patched = isPatched(archive);
  console.log(`Launcher : ${dir}`);
  console.log(`État : ${patched ? 'traduit en français' : 'd\'origine (japonais)'}`);
  const source = patched && existsSync(`${asarPath}.original`) ? readAsar(`${asarPath}.original`) : archive;
  const { renderer, main } = locateTextFiles(source);
  const english = { ...extractRenderer(renderer.source).en, ...extractMain(main.source).en };
  const french = loadFrench();
  const missing = Object.keys(english).filter((key) => !french[key]);
  console.log(`Textes : ${Object.keys(english).length}, traduits : ${Object.keys(english).length - missing.length}`);
  for (const key of missing) console.log(`  à traduire : ${key} = ${english[key]}`);
}

const COMMANDS = { apply, restore, status };
const [command = 'apply', dirArg] = process.argv.slice(2);
try {
  if (!COMMANDS[command]) throw new Error('Commandes : apply | restore | status');
  COMMANDS[command](dirArg);
} catch (error) {
  console.error(`Erreur : ${error.message}`);
  process.exitCode = 1;
}
