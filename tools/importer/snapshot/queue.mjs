#!/usr/bin/env node
/*
 * Writes the next batch of live URLs to snapshot into tools/importer/snapshots/_queue.json.
 * The browser capture (see capture.js in this folder) reads that file from the local dev
 * server, so the capture code never changes between batches.
 *
 *   node tools/importer/snapshot/queue.mjs [--size 25] [--budget 540] [--gap 20-30] [--group article]
 *   (--gap: seconds between page starts, min-max; --images-first p1,p2: their images first;
 *   --deferred: include the pages listed in _deferred.json)
 *
 * Order: one sample page per template group, then live_status 200 rows, then unchecked rows.
 * Rows already in _state.json (any outcome) are skipped, so a page is never fetched twice.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import {
  parseCsv, SNAP_DIR, ORIGIN, readState, readJson, gluedHost,
} from './lib.mjs';

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
// pages that timed out (no status) get one more try
const retry = (s) => s && s.status == null && !s.retried;
// pages loaded several times by lost batches wait in _deferred.json until the rest is captured
const deferred = new Set(readJson(`${SNAP_DIR}/_deferred.json`, []));
const todo = rows.filter((r) => (!state[r.live_path] || retry(state[r.live_path])) && ['200', 'unchecked'].includes(r.live_status))
  .filter((r) => !group || r.template_group === group)
  .filter((r) => args.includes('--deferred') || !deferred.has(`${ORIGIN}${r.live_path}`));

const sampled = new Set(Object.keys(state).map((p) => state[p].group));
const samples = [];
todo.forEach((r) => {
  if (!sampled.has(r.template_group)) {
    sampled.add(r.template_group);
    samples.push(r);
  }
});
const rest = todo.filter((r) => !samples.includes(r));
// round-robin across template groups so every group fills up early
const roundRobin = (list) => {
  const byGroup = {};
  list.forEach((r) => { (byGroup[r.template_group] = byGroup[r.template_group] || []).push(r); });
  const queues = Object.values(byGroup);
  const out = [];
  while (queues.some((q) => q.length)) queues.forEach((q) => { if (q.length) out.push(q.shift()); });
  return out;
};
const ordered = [
  ...samples,
  // unchecked rows get their status from the capture itself
  ...roundRobin(rest),
];
const batch = ordered.slice(0, size);
const queue = {
  budgetMs, minGapMs: minGap, maxGapMs: maxGap, urls: batch.map((r) => `${ORIGIN}${r.live_path}`), remaining: ordered.length - batch.length };
// images still to download are fetched in the gaps between pages (same-origin, in the page)
const images = readJson(`${SNAP_DIR}/_images.json`, {});
const firstPages = (opt('images-first', '') || '').split(',').filter(Boolean);
const pending = Object.keys(images)
  .filter((u) => !images[u].file && !images[u].status && !gluedHost(u));
const first = pending.filter((u) => images[u].pages.some((p) => firstPages.includes(p)));
queue.images = [...first, ...pending.filter((u) => !first.includes(u))].slice(0, Number(opt('images', 300)));
writeFileSync(`${SNAP_DIR}/_queue.json`, JSON.stringify(queue, null, 2));
console.log(`queued ${batch.length} pages and ${queue.images.length} images, remaining after batch ${queue.remaining}`);
if (!existsSync(`${SNAP_DIR}/_state.json`)) console.log('(no state yet)');
