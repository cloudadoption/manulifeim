#!/usr/bin/env node
/*
 * Read-only: lists pages that were edited in DA after the migration last uploaded them, so authored
 * changes are reported instead of overwritten (da-upload.mjs skips the same pages).
 *
 *   node tools/importer/check-da-edits.mjs [<eds path> ...]   default: every page we uploaded
 *
 * One HEAD request per page (DA source Last-Modified, compared with da-upload.json `at` plus 60 s).
 * Writes tools/importer/reports/da-edits.json.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';

const SRC = 'https://admin.da.live/source/cloudadoption/manulifeim';
const GRACE_MS = 60 * 1000;
const pages = JSON.parse(readFileSync('tools/importer/reports/da-upload.json', 'utf-8'));

function head(path) {
  const h = execFileSync('curl', ['-s', '-S', '-I', `${SRC}${path}.html`]).toString();
  // the last status line (a proxy may answer CONNECT first)
  const status = Number((h.match(/^HTTP\/[\d.]+ (\d{3})(?![\s\S]*^HTTP\/)/m) || [])[1]);
  const lm = Date.parse((h.match(/^last-modified:\s*(.+)$/im) || [])[1] || '');
  return { status, lm };
}

const only = process.argv.slice(2).filter((a) => a.startsWith('/'));
const list = (only.length ? only : Object.keys(pages).filter((p) => pages[p].upload < 300))
  .filter((p) => !/^\/migration-status(\/|$)/.test(p));
const out = {
  at: new Date().toISOString(), checked: 0, edited: [], notOurs: [], missing: [], unknown: [],
};
list.forEach((p) => {
  const { status, lm } = head(p);
  out.checked += 1;
  if (status === 404) out.missing.push(p);
  else if (status !== 200 || Number.isNaN(lm)) out.unknown.push({ path: p, status });
  else if (!pages[p]) out.notOurs.push({ path: p, daModified: new Date(lm).toISOString() });
  else if (lm > Date.parse(pages[p].at) + GRACE_MS) {
    out.edited.push({ path: p, daModified: new Date(lm).toISOString(), ourUpload: pages[p].at });
  }
});
writeFileSync('tools/importer/reports/da-edits.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(`${out.checked} pages checked: ${out.edited.length} edited in DA after our upload, ${out.notOurs.length} not uploaded by us, ${out.missing.length} missing, ${out.unknown.length} unknown`);
out.edited.forEach((e) => console.log(`  edited ${e.path} (DA ${e.daModified}, ours ${e.ourUpload})`));
