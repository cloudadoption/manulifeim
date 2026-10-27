#!/usr/bin/env node
/*
 * Moves the author rows of an imported page's Browse By block into fragment documents, so the
 * page stays under the 200-image preview limit (aem.live/docs/limits). Same result as
 * importing with import-viewpoints.js (parsers/browse-by.js), without a re-import.
 *
 *   node tools/importer/split-browse-by.mjs [--max 150] [--tab Authors] [<eds page>]
 *   default page: /institutional/tw/en/viewpoints
 *
 * Writes content/<parent>/fragments/<page>-authors-N.plain.html (one Browse By block each, at
 * most --max distinct images, balanced) and replaces the rows in the page with one row per
 * fragment: | Authors | [<fragment path>](<fragment path>) |. Prints the distinct image count
 * (by file name) of every document; exit 1 if the page is still over 200 or a fragment over
 * --max. Re-running on a split page only re-checks the counts.
 */
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync,
} from 'fs';
import { dirname } from 'path';
import { imageNames, PAGE_IMAGE_LIMIT } from './check-images.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const max = Number(opt('max', 150));
const tabName = opt('tab', 'Authors');
const page = args.find((a, i) => a.startsWith('/') && !['--max', '--tab'].includes(args[i - 1])) || '/institutional/tw/en/viewpoints';
const parent = page.replace(/\/[^/]*$/, '');
const base = page.split('/').pop();
const fragPath = (n) => `${parent}/fragments/${base}-${tabName.toLowerCase()}-${n}`;
const fileOf = (p) => `content${p}.plain.html`;

/** [start, end) of each direct child <div> of the element whose open tag ends at `from`. */
function childDivs(html, from) {
  const out = [];
  const re = /<(\/?)div\b[^>]*>/gi;
  re.lastIndex = from;
  let depth = 0;
  let start = -1;
  let m = re.exec(html);
  while (m) {
    if (!m[1]) {
      if (depth === 0) start = m.index;
      depth += 1;
    } else {
      if (depth === 0) return { rows: out, end: m.index };
      depth -= 1;
      if (depth === 0) out.push([start, re.lastIndex]);
    }
    m = re.exec(html);
  }
  throw new Error('unbalanced <div> markup');
}

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const firstCell = (row) => {
  const inner = row.replace(/^<div[^>]*>/i, '');
  const m = inner.match(/^\s*<div[^>]*>([\s\S]*?)<\/div>/i);
  return m ? strip(m[1]) : '';
};

// same rule as splitByImages() in parsers/browse-by.js
function splitByImages(rows) {
  const parts = Math.max(1, Math.ceil(new Set(rows.map((r) => r.img).filter(Boolean)).size / max));
  const size = Math.ceil(rows.length / parts);
  const chunks = [];
  let current = [];
  let seen = new Set();
  rows.forEach((r) => {
    const grows = r.img && !seen.has(r.img);
    if (current.length && (current.length >= size || (grows && seen.size >= max))) {
      chunks.push(current);
      current = [];
      seen = new Set();
    }
    current.push(r);
    if (r.img) seen.add(r.img);
  });
  if (current.length) chunks.push(current);
  return chunks;
}

const file = fileOf(page);
if (!existsSync(file)) {
  console.error(`no ${file}`);
  process.exit(2);
}
let html = readFileSync(file, 'utf-8');
const open = html.match(/<div class="browse-by(?:\s[^"]*)?">/);
if (!open) {
  console.error(`${page}: no Browse By block`);
  process.exit(2);
}
const from = open.index + open[0].length;
const { rows } = childDivs(html, from);
const all = rows.map(([s, e]) => ({ s, e, html: html.slice(s, e) }));
const authors = all.filter((r) => firstCell(r.html) === tabName && !/\/fragments\//.test(r.html))
  .map((r) => ({ ...r, img: imageNames(r.html)[0] || '' }));

if (authors.length) {
  const chunks = splitByImages(authors);
  const dir = dirname(fileOf(fragPath(1)));
  mkdirSync(dir, { recursive: true });
  chunks.forEach((chunk, i) => {
    writeFileSync(fileOf(fragPath(i + 1)), `<div><div class="browse-by">${chunk.map((r) => r.html).join('')}</div></div>\n`);
  });
  // drop fragments of an earlier, longer split
  const stale = new RegExp(`^${base}-${tabName.toLowerCase()}-(\\d+)\\.plain\\.html$`);
  readdirSync(dir).forEach((f) => {
    const m = f.match(stale);
    if (m && Number(m[1]) > chunks.length) {
      unlinkSync(`${dir}/${f}`);
      console.log(`removed stale ${dir}/${f}`);
    }
  });
  const pointers = chunks.map((c, i) => `<div><div>${tabName}</div><div><a href="${fragPath(i + 1)}">${fragPath(i + 1)}</a></div></div>`).join('');
  // replace from the last row backwards so the offsets stay valid; pointers go where the first row was
  [...authors].reverse().forEach((r, i) => {
    html = html.slice(0, r.s) + (i === authors.length - 1 ? pointers : '') + html.slice(r.e);
  });
  writeFileSync(file, html);
  console.log(`${page}: moved ${authors.length} ${tabName} rows to ${chunks.length} fragment(s)`);
} else {
  console.log(`${page}: no inline ${tabName} rows (already split); checking counts`);
}

let bad = 0;
const pointed = [...html.matchAll(/href="([^"]*\/fragments\/[^"]+)"/g)].map((m) => m[1]);
[[page, PAGE_IMAGE_LIMIT], ...pointed.map((p) => [p, max])].forEach(([p, limit]) => {
  if (!existsSync(fileOf(p))) {
    console.log(`  ${p}: MISSING`);
    bad += 1;
    return;
  }
  const doc = readFileSync(fileOf(p), 'utf-8');
  const n = imageNames(doc).length;
  const imgs = (doc.match(/<img\b/gi) || []).length;
  if (n > limit) bad += 1;
  console.log(`  ${p}: ${n} distinct images (${imgs} <img>), limit ${limit}${n > limit ? '  OVER' : ''}`);
});
process.exit(bad ? 1 : 0);
