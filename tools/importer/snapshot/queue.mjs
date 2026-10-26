#!/usr/bin/env node
/*
 * Writes the next batch of live URLs to snapshot into tools/importer/snapshots/_queue.json.
 * The browser capture (see capture.js in this folder) reads that file from the local dev
 * server, so the capture code never changes between batches.
 *
 *   node tools/importer/snapshot/queue.mjs [--size 25] [--budget 540] [--gap 20-30] [--group article]
 *   (--gap: seconds between page starts, min-max)
 *
 * Order: one sample page per template group, then live_status 200 rows, then unchecked rows.
 * Rows already in _state.json (any outcome) are skipped, so a page is never fetched twice.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parseCsv, SNAP_DIR, ORIGIN, readState } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const size = Number(opt('size', 25));
const budgetMs = Number(opt('budget', 540)) * 1000;
const group = opt('group', null);
const [minGap, maxGap] = opt('gap', '5-10').split('-').map((n) => Number(n) * 1000);

const rows = parseCsv(readFileSync('tools/migration-scope/pages.csv', 'utf-8'));
const state = readState();
const todo = rows.filter((r) => !state[r.live_path] && ['200', 'unchecked'].includes(r.live_status))
  .filter((r) => !group || r.template_group === group);

const sampled = new Set(Object.keys(state).map((p) => state[p].group));
const samples = [];
todo.forEach((r) => {
  if (!sampled.has(r.template_group)) {
    sampled.add(r.template_group);
    samples.push(r);
  }
});
const rest = todo.filter((r) => !samples.includes(r));
const ordered = [
  ...samples,
  ...rest.filter((r) => r.live_status === '200'),
  ...rest.filter((r) => r.live_status !== '200'),
];
const batch = ordered.slice(0, size);
const queue = {
  budgetMs, minGapMs: minGap, maxGapMs: maxGap, urls: batch.map((r) => `${ORIGIN}${r.live_path}`), remaining: ordered.length - batch.length };
writeFileSync(`${SNAP_DIR}/_queue.json`, JSON.stringify(queue, null, 2));
console.log(`queued ${batch.length}, remaining after batch ${queue.remaining}`);
if (!existsSync(`${SNAP_DIR}/_state.json`)) console.log('(no state yet)');
