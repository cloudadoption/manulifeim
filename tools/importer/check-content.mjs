#!/usr/bin/env node
/*
 * Checks that every imported page holds its own snapshot: the metadata Title of
 * content/<eds path>.plain.html must match the <title> captured from live (_state.json).
 * A mismatch means the page was imported from the wrong source (e.g. the homepage).
 *
 *   node tools/importer/check-content.mjs [--json]
 *
 * Writes tools/importer/reports/content-mismatch.json ({ "<eds path>": {...} });
 * upload-pending.mjs skips the pages listed there.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const SUFFIX = / \| Manulife Investment Management$/;
const norm = (s) => String(s || '').replace(SUFFIX, '').replace(/&amp;/g, '&').replace(/&nbsp;| /g, ' ')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const state = JSON.parse(readFileSync('tools/importer/snapshots/_state.json', 'utf-8'));
const linkMap = JSON.parse(readFileSync('tools/importer/link-map.json', 'utf-8'));

const out = {};
let checked = 0;
Object.entries(state).forEach(([live, s]) => {
  if (s.status !== 200 || !s.title) return;
  const eds = linkMap[live] || live.toLowerCase();
  const file = `content${eds}.plain.html`;
  if (!existsSync(file)) return;
  checked += 1;
  const html = readFileSync(file, 'utf-8');
  const m = html.match(/<div class="metadata">[\s\S]*?<div>Title<\/div><div>([\s\S]*?)<\/div>/);
  const title = m ? m[1].replace(/<[^>]+>/g, '') : '';
  // some pages carry a longer og:title ("Bank Opportunities | Institutional")
  if (!norm(title).startsWith(norm(s.title))) out[eds] = { live, captured: s.title.replace(SUFFIX, ''), imported: title };
});
writeFileSync('tools/importer/reports/content-mismatch.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(`${checked} pages checked, ${Object.keys(out).length} with a title that differs from the snapshot`);
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
