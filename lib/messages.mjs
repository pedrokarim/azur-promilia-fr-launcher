// Repère les textes du launcher dans son code, les extrait et y injecte le français.
//
// Deux endroits portent du texte :
//   - la fenêtre (renderer) : `const messages = { "en": {…}, "ja": {…}, … }`, des fonctions
//     vue-i18n compilées de la forme `(ctx) => { …; return _normalize(["texte"]); }` ;
//   - le menu de la zone de notification (main) : `const translation$N = { tray: { show, exit } }`.
// Les noms de fichiers changent à chaque version (empreinte dans le nom) : on cherche donc le
// fichier par son contenu, jamais par son nom.

import vm from 'node:vm';

export const MARKER = '/* azur-promilia-fr */';

// La ligne qui choisit la langue, identique dans les deux fichiers.
const LOCALE_LINE = 'const locale = Object.keys(resources).includes(systemLocale) ? systemLocale : langConfig || "en";';

/** Fin du bloc `{ … }` qui commence à `start`, en sautant les chaînes et les commentaires. */
function matchingBrace(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '/' && source[i + 1] === '/') i = source.indexOf('\n', i);
    else if (c === '/' && source[i + 1] === '*') i = source.indexOf('*/', i + 2) + 1;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('Accolade fermante introuvable');
}

/** Aplati un objet de messages : { "install.change-path": "texte", … }. */
function flatten(node, prefix, out, render) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) flatten(value, path, out, render);
    else out[path] = render(value);
  }
  return out;
}

// Contexte minimal pour exécuter les fonctions compilées : elles ne font que recoller du texte.
const fakeContext = { normalize: (parts) => parts.join('') };

// --- fenêtre du launcher ----------------------------------------------------------------

export function isRenderer(source) {
  return source.includes('const messages = {') && source.includes('createI18n({') && source.includes(LOCALE_LINE);
}

function rendererMessagesSource(source) {
  const start = source.indexOf('const messages = {') + 'const messages = '.length;
  const end = matchingBrace(source, start);
  return { start, end, text: source.slice(start, end + 1) };
}

/** Les textes de la fenêtre, par langue : { en: {clé: texte}, ja: {…}, … }. */
export function extractRenderer(source) {
  const { text } = rendererMessagesSource(source);
  // Le bloc ne contient que des fonctions qui renvoient du texte : on l'évalue dans un
  // contexte vide, sans accès à rien d'autre.
  const messages = vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 2000 });
  const tables = {};
  for (const [lang, tree] of Object.entries(messages)) {
    tables[lang] = flatten(tree, '', {}, (fn) => (typeof fn === 'function' ? fn(fakeContext) : String(fn)));
  }
  return tables;
}

/** Code d'un bloc de messages vue-i18n compilés, avec la même arborescence que `model`. */
function compiledBlock(model, translate, prefix = '', indent = '    ') {
  const lines = ['{'];
  const entries = Object.entries(model);
  entries.forEach(([key, value], index) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const comma = index < entries.length - 1 ? ',' : '';
    if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}${JSON.stringify(key)}: ${compiledBlock(value, translate, path, indent + '  ')}${comma}`);
    } else {
      const text = JSON.stringify(translate(path));
      lines.push(`${indent}${JSON.stringify(key)}: (ctx) => { const { normalize: _normalize } = ctx; return _normalize([${text}]); }${comma}`);
    }
  });
  lines.push(`${indent.slice(2)}}`);
  return lines.join('\n');
}

function nest(flat) {
  const tree = {};
  for (const [path, text] of Object.entries(flat)) {
    const keys = path.split('.');
    let node = tree;
    keys.slice(0, -1).forEach((key) => (node = node[key] ??= {}));
    node[keys.at(-1)] = text;
  }
  return tree;
}

/** Ajoute le bloc "fr" et force la langue française dans la fenêtre. */
export function patchRenderer(source, french, english) {
  const { start } = rendererMessagesSource(source);
  const translate = (path) => french[path] || english[path];
  const block = `\n  ${MARKER}\n  "fr": ${compiledBlock(nest(english), translate)},`;
  let patched = source.slice(0, start + 1) + block + source.slice(start + 1);
  patched = patched.replace(LOCALE_LINE, `resources["fr"] = messages["fr"]; const locale = "fr"; ${MARKER}`);
  return patched;
}

// --- menu de la zone de notification ---------------------------------------------------

export function isMain(source) {
  return source.includes('const locales = async') && source.includes('tray: {') && source.includes(LOCALE_LINE);
}

/** Les deux textes du menu, par langue, d'après les objets `const xx = { translation: … }`. */
export function extractMain(source) {
  const tables = {};
  const pattern = /const (translation(?:\$\d+)?) = \{\s*tray: \{\s*show: ("(?:[^"\\]|\\.)*"),\s*exit: ("(?:[^"\\]|\\.)*")\s*\}\s*\};/g;
  const byVariable = {};
  for (const match of source.matchAll(pattern)) {
    byVariable[match[1]] = { 'tray.show': JSON.parse(match[2]), 'tray.exit': JSON.parse(match[3]) };
  }
  const langPattern = /const (en|ja|ko|zh_cn|zh_tw) = \{\s*translation(?:: (translation(?:\$\d+)?))?\s*\};/g;
  for (const match of source.matchAll(langPattern)) {
    tables[match[1]] = byVariable[match[2] ?? 'translation'];
  }
  return tables;
}

export function patchMain(source, french, english) {
  const text = (key) => JSON.stringify(french[key] || english[key]);
  const block = `${MARKER}\nconst fr = { translation: { tray: { show: ${text('tray.show')}, exit: ${text('tray.exit')} } } };\n`;
  let patched = source.replace('const locales = async', `${block}const locales = async`);
  patched = patched.replace(LOCALE_LINE, `resources["fr"] = fr; const locale = "fr"; ${MARKER}`);
  return patched;
}
