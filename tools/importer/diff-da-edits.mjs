#!/usr/bin/env node
/*
 * Read-only: for each page in reports/da-edits.json `edited` (check-da-edits.mjs), fetches the DA
 * source and compares its <main> with the local content/<path>.plain.html (what the migration
 * last uploaded or would upload next). Prints whether the DA copy differs, with a word summary.
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';

const SRC = 'https://admin.da.live/source/cloudadoption/manulifeim';
const norm = (h) => h.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
const words = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
const { edited = [] } = JSON.parse(readFileSync('tools/importer/reports/da-edits.json', 'utf-8'));

edited.forEach(({ path }) => {
  const body = execFileSync('curl', ['-s', '-S', `${SRC}${path}.html`], { maxBuffer: 64 * 1024 * 1024 }).toString();
  const da = (body.match(/<main>([\s\S]*)<\/main>/) || [])[1] || '';
  const file = `content${path}.plain.html`;
  const local = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  if (norm(da) === norm(local)) {
    console.log(`same      ${path}`);
    return;
  }
  const a = words(local);
  const b = words(da);
  const onlyDa = b.filter((w) => !a.includes(w)).slice(0, 15).join(' ');
  const onlyLocal = a.filter((w) => !b.includes(w)).slice(0, 15).join(' ');
  console.log(`DIFFERENT ${path}: DA ${da.length} chars, local ${local.length}; only in DA: "${onlyDa}"; only local: "${onlyLocal}"`);
});
