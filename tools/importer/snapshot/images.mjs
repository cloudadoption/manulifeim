#!/usr/bin/env node
/*
 * Image capture for snapshotted pages. The live site answers 403 to plain HTTP clients, so
 * images are fetched in the browser (same origin) and handed over as base64.
 *
 *   node tools/importer/snapshot/images.mjs queue [--size 40]   writes snapshots/_img-queue.json
 *   node tools/importer/snapshot/images.mjs ingest <file.json>   stores content/media-da/<name>
 *   node tools/importer/snapshot/images.mjs sidecars             writes <page>.images.json maps
 *
 * The sidecars map original image URLs to /media-da/<name>; run-bulk-import rewrites img src
 * with them when it imports from a snapshot.
 */
import { readFileSync, unlinkSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import {
  SNAP_DIR, MEDIA_DIR, readJson, writeFile, snapshotFile,
} from './lib.mjs';

const IMAGES = `${SNAP_DIR}/_images.json`;
const [cmd, arg, val] = process.argv.slice(2);
const images = readJson(IMAGES, {});

const mediaName = (url) => {
  const { pathname } = new URL(url);
  const base = decodeURIComponent(pathname.split('/').pop());
  const m = base.match(/^(.*?)(\.[a-z0-9]+)?$/i);
  const stem = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'image';
  const ext = (m[2] || '.bin').toLowerCase().replace('.jpeg', '.jpg');
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 8);
  return `${stem}-${hash}${ext}`;
};

if (cmd === 'queue') {
  const size = Number(arg === '--size' ? val : 40);
  const urls = Object.keys(images).filter((u) => !images[u].file && !images[u].status).slice(0, size);
  writeFile(`${SNAP_DIR}/_img-queue.json`, JSON.stringify({ urls }, null, 1));
  const left = Object.keys(images).filter((u) => !images[u].file && !images[u].status).length;
  console.log(`queued ${urls.length} images, ${left - urls.length} more pending`);
} else if (cmd === 'ingest') {
  const batch = JSON.parse(readFileSync(arg, 'utf-8'));
  let stored = 0;
  batch.forEach((rec) => {
    const entry = images[rec.url] || { pages: [] };
    if (rec.status === 200 && rec.b64) {
      const name = mediaName(rec.url);
      writeFile(`${MEDIA_DIR}/${name}`, Buffer.from(rec.b64, 'base64'));
      entry.file = `/media-da/${name}`;
      entry.type = rec.type;
      stored += 1;
    } else {
      entry.status = rec.status || 'error';
      entry.error = rec.error;
    }
    images[rec.url] = entry;
  });
  writeFile(IMAGES, JSON.stringify(images, null, 1));
  unlinkSync(arg);
  const failed = batch.filter((r) => r.status !== 200);
  console.log(`stored ${stored}/${batch.length} images`);
  failed.forEach((r) => console.log(`  ${r.status} ${r.url} ${r.error || ''}`));
  if (failed.some((r) => [403, 429].includes(r.status))) process.exit(2);
} else if (cmd === 'sidecars') {
  const perPage = {};
  Object.entries(images).forEach(([url, e]) => {
    if (!e.file) return;
    e.pages.forEach((p) => {
      perPage[p] = perPage[p] || {};
      perPage[p][url] = e.file;
      // the importer may see the URL with an encoded or decoded path; map both
      perPage[p][decodeURI(url)] = e.file;
    });
  });
  Object.entries(perPage).forEach(([p, map]) => {
    writeFile(snapshotFile(p).replace(/\.html$/, '.images.json'), JSON.stringify(map, null, 1));
  });
  console.log(`wrote ${Object.keys(perPage).length} sidecars`);
} else {
  console.log(readdirSync(SNAP_DIR));
  console.log('usage: images.mjs queue|ingest <file>|sidecars');
}
