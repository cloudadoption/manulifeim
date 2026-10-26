#!/usr/bin/env node
/* eslint-disable no-console, max-len, no-restricted-syntax, no-await-in-loop, no-continue, no-nested-ternary, import/no-unresolved, import/extensions */
/*
 * Builds tools/importer/link-map.json from tools/migration-scope/pages.csv.
 *
 *   node tools/importer/build-link-map.mjs
 *
 * Output: { "<live_path>": "<eds_path>", ... } for every row whose live_status is
 * 200 or unchecked (404 rows are left out, so links to them stay on the live site).
 * The import scripts bundle the JSON (tools/importer/utils/links.js) and use it for the
 * page path of every imported document and for internal link rewriting (see LINKS.md).
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, '../migration-scope/pages.csv');
const outPath = join(here, 'link-map.json');

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, commas and newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0]);
}

const [header, ...rows] = parseCsv(readFileSync(csvPath, 'utf-8'));
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
['live_path', 'eds_path', 'live_status'].forEach((c) => {
  if (col[c] === undefined) throw new Error(`pages.csv: missing column ${c}`);
});

const map = {};
const edsSeen = new Map();
let skipped = 0;
rows.forEach((r) => {
  const live = r[col.live_path].trim();
  const eds = r[col.eds_path].trim();
  const status = r[col.live_status].trim();
  if (!live || !eds) return;
  if (status !== '200' && status !== 'unchecked') {
    skipped += 1;
    return;
  }
  if (edsSeen.has(eds) && edsSeen.get(eds) !== live) {
    throw new Error(`pages.csv: eds_path ${eds} used by ${edsSeen.get(eds)} and ${live}`);
  }
  edsSeen.set(eds, live);
  map[live] = eds;
});

const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(outPath, `${JSON.stringify(sorted, null, 1)}\n`);
const changed = Object.entries(sorted).filter(([l, e]) => l !== e).length;
console.log(`link-map.json: ${Object.keys(sorted).length} pages (${changed} with a different EDS path), ${skipped} rows skipped (status not 200/unchecked)`);
