// Lecture et écriture d'une archive asar (le format des applications Electron), sans dépendance.
//
// Disposition du fichier :
//   [uint32 4][uint32 taille du bloc d'en-tête]            (pickle de taille)
//   [uint32 taille utile][uint32 longueur JSON][JSON][bourrage à 4 octets]   (pickle d'en-tête)
//   [contenu des fichiers, à partir de la fin de l'en-tête, aux décalages notés dans le JSON]
// Les fichiers marqués « unpacked » vivent à côté, dans app.asar.unpacked : on n'y touche pas.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const INTEGRITY_BLOCK_SIZE = 4 * 1024 * 1024;

export function readAsar(path) {
  const raw = readFileSync(path);
  const headerPickleSize = raw.readUInt32LE(4);
  const jsonLength = raw.readUInt32LE(12);
  const headerString = raw.subarray(16, 16 + jsonLength).toString('utf8');
  const header = JSON.parse(headerString);
  const dataStart = 8 + headerPickleSize;
  return { raw, header, headerString, dataStart };
}

/** Parcourt les fichiers de l'archive : [chemin, entrée du JSON]. */
export function listFiles(header) {
  const files = [];
  (function walk(node, prefix) {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.files) walk(entry, path);
      else files.push([path, entry]);
    }
  })(header, '');
  return files;
}

export function readEntry(archive, entry) {
  if (entry.unpacked || entry.link) return null;
  const start = archive.dataStart + Number(entry.offset);
  return archive.raw.subarray(start, start + entry.size);
}

function integrityOf(data) {
  const blocks = [];
  for (let i = 0; i < data.length; i += INTEGRITY_BLOCK_SIZE) {
    blocks.push(createHash('sha256').update(data.subarray(i, i + INTEGRITY_BLOCK_SIZE)).digest('hex'));
  }
  return {
    algorithm: 'SHA256',
    hash: createHash('sha256').update(data).digest('hex'),
    blockSize: INTEGRITY_BLOCK_SIZE,
    blocks,
  };
}

/**
 * Réécrit l'archive en remplaçant le contenu de certains fichiers.
 * `replacements` : Map chemin → Buffer. La zone de données d'origine est recopiée telle quelle
 * (elle contient des trous que l'outil de Yostar laisse entre certains fichiers) et chaque
 * fichier remplacé est ajouté à la fin, son entrée pointant vers sa nouvelle place. Sans
 * remplacement, on retrouve donc l'archive d'origine à l'octet près.
 */
export function writeAsar(archive, replacements, outPath) {
  const header = JSON.parse(archive.headerString);
  const entries = new Map(listFiles(header));
  const originalData = archive.raw.subarray(archive.dataStart);
  const chunks = [originalData];
  let offset = originalData.length;
  for (const [path, data] of replacements) {
    const entry = entries.get(path);
    if (!entry || entry.unpacked || entry.link) throw new Error(`Fichier absent de l'archive : ${path}`);
    entry.offset = String(offset);
    entry.size = data.length;
    if (entry.integrity) entry.integrity = integrityOf(data);
    offset += data.length;
    chunks.push(data);
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const padded = Math.ceil(json.length / 4) * 4;
  const headerPickle = Buffer.alloc(8 + padded);
  headerPickle.writeUInt32LE(4 + padded, 0);
  headerPickle.writeUInt32LE(json.length, 4);
  json.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  writeFileSync(outPath, Buffer.concat([sizePickle, headerPickle, ...chunks]));
}
