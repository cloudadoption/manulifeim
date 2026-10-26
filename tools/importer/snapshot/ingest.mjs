#!/usr/bin/env node
/*
 * Stores one capture batch saved by the MCP browser capture (capture-pages.fn.txt) on disk.
 *
 *   node tools/importer/snapshot/ingest.mjs /tmp/playwright/snap-001.json
 *
 * Exits 2 when the batch hit a block (403/429/...), so the caller stops instead of retrying.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import storeRecords from './store.mjs';

const file = process.argv[2];
const data = JSON.parse(readFileSync(file, 'utf-8'));
// the capture returns either an array of page records or {pages, images}
const batch = Array.isArray(data) ? data : data.pages;
if (!Array.isArray(data) && data.images?.length) {
  const imgFile = `${file}.images.json`;
  writeFileSync(imgFile, JSON.stringify(data.images));
  try {
    console.log(execFileSync('node', ['tools/importer/snapshot/images.mjs', 'ingest', imgFile]).toString().trim());
  } catch (e) {
    console.log(String(e.stdout || e.message).trim());
  }
}
const res = storeRecords(batch);
unlinkSync(file);
console.log(`batch: ${batch.length} captured, ${res.stored} stored; total snapshots ${res.done}/${res.total}; images pending ${res.pendingImages}`);
res.odd.forEach((r) => console.log(`  ${r.status} ${r.url} ${r.finalUrl !== r.url ? `-> ${r.finalUrl}` : ''} ${r.error || ''}`));
res.blocked.forEach((r) => console.log(`BLOCKED ${r.status} ${r.url} ${r.error || ''}`));
if (res.blocked.length) process.exit(2);
