#!/usr/bin/env node
/*
 * Rebuilds snapshots/_images.json from every stored snapshot (keeps download results already
 * recorded). Use after changing how image URLs are extracted.
 *
 *   node tools/importer/snapshot/rescan-images.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { imageUrls } from './store.mjs';
import { SNAP_DIR, readState, readJson } from './lib.mjs';

const state = readState();
const old = readJson(`${SNAP_DIR}/_images.json`, {});
const images = {};
Object.entries(state).forEach(([p, e]) => {
  if (!e.file) return;
  imageUrls(readFileSync(e.file, 'utf-8')).forEach((u) => {
    images[u] = images[u] || { ...(old[u] || {}), pages: [] };
    if (!images[u].pages.includes(p)) images[u].pages.push(p);
  });
});
writeFileSync(`${SNAP_DIR}/_images.json`, JSON.stringify(images, null, 1));
const spaced = Object.keys(images).filter((u) => u.includes('%20')).length;
console.log(`${Object.keys(old).length} -> ${Object.keys(images).length} image URLs (${spaced} with spaces)`);
