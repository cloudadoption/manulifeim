#!/usr/bin/env node
/*
 * Builds the Edge Delivery redirects sheet (/redirects: Source | Destination) from pages.csv:
 * one row per live address that Edge Delivery cannot use as it is (live_path != eds_path,
 * e.g. capital letters or underscores: /institutional/tw/en/Pension-Barometer ->
 * /institutional/tw/en/pension-barometer). No network.
 *
 * Rules: rows with live_path == eds_path are skipped; a duplicate Source keeps its first row;
 * a chain (a Destination that is also a Source) is collapsed to its final Destination; a loop is
 * left out. Every skip is reported with its reason.
 *
 *   node tools/migration-scope/redirects.mjs [--exclude <file of Sources>] [--out <file.json>]
 *
 * Output: the DA sheet JSON ({ total, offset, limit, data: [{ Source, Destination }],
 * ":type": "sheet" }) on stdout or in --out; skipped rows on stderr.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line breaks. */
export function parseCsv(text) {
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
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * @param {string} csvText pages.csv
 * @returns {{rows: {Source: string, Destination: string}[], skipped: {source: string, reason: string}[]}}
 */
export function buildRedirects(csvText) {
  const [head, ...data] = parseCsv(csvText);
  const live = head.indexOf('live_path');
  const eds = head.indexOf('eds_path');
  const skipped = [];
  const map = new Map();
  data.forEach((r) => {
    const source = (r[live] || '').trim();
    const destination = (r[eds] || '').trim();
    if (!source || !destination || source === destination) return;
    if (map.has(source)) {
      skipped.push({ source, reason: `duplicate Source (kept -> ${map.get(source)}, dropped -> ${destination})` });
      return;
    }
    map.set(source, destination);
  });
  const rows = [];
  map.forEach((first, source) => {
    const seen = new Set([source]);
    let destination = first;
    while (map.has(destination) && !seen.has(destination)) {
      seen.add(destination);
      destination = map.get(destination);
    }
    if (seen.has(destination)) skipped.push({ source, reason: `redirect loop via ${first}` });
    else rows.push({ Source: source, Destination: destination });
  });
  return { rows, skipped };
}

/** The DA sheet document for the rows. */
export function sheet(rows) {
  return {
    total: rows.length, offset: 0, limit: rows.length, data: rows, ':type': 'sheet',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? null : args[i + 1];
  };
  const csv = readFileSync(fileURLToPath(new URL('./pages.csv', import.meta.url)), 'utf8');
  const { rows, skipped } = buildRedirects(csv);
  const exclude = new Set(opt('exclude') ? readFileSync(opt('exclude'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : []);
  const kept = rows.filter((r) => !exclude.has(r.Source));
  [...skipped, ...rows.filter((r) => exclude.has(r.Source)).map((r) => ({ source: r.Source, reason: 'excluded (--exclude)' }))]
    .forEach((s) => process.stderr.write(`skipped ${s.source}: ${s.reason}\n`));
  const json = `${JSON.stringify(sheet(kept), null, 1)}\n`;
  if (opt('out')) writeFileSync(opt('out'), json);
  else process.stdout.write(json);
  process.stderr.write(`${kept.length} rows (${rows.length} built, ${skipped.length} skipped, ${rows.length - kept.length} excluded)\n`);
}
