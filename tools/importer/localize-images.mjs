#!/usr/bin/env node
/*
 * Points <img>/<source> URLs that are still on www.manulifeim.com at the local /media-da copy
 * once that image has been downloaded (snapshots/_images.json), without re-importing the page.
 *
 *   node tools/importer/localize-images.mjs [<content path> ...]   (default: every page)
 *
 * Prints the pages it changed; run check-images.mjs afterwards.
 */
import {
  readFileSync, writeFileSync, readdirSync, statSync,
} from 'fs';
import { join } from 'path';

const images = JSON.parse(readFileSync('tools/importer/snapshots/_images.json', 'utf-8'));
const byUrl = {};
// images that fail on the live site itself (403/404 there too) are dropped from the page
const dead = new Set();
Object.entries(images).forEach(([u, e]) => {
  if (!e.file && [403, 404, 410].includes(e.status)) {
    [u, decodeURI(u), encodeURI(decodeURI(u))].forEach((k) => dead.add(k));
  }
  if (!e.file) return;
  [u, decodeURI(u), encodeURI(decodeURI(u))].forEach((k) => { byUrl[k] = e.file; });
});

const list = (d, out = []) => {
  readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (f === 'media-da') return;
    if (statSync(p).isDirectory()) list(p, out);
    else if (f.endsWith('.plain.html')) out.push(p);
  });
  return out;
};

const args = process.argv.slice(2);
const files = args.length ? args.map((p) => `content${p}.plain.html`) : list('content');
let changed = 0;
const deadLog = [];
files.forEach((f) => {
  const html = readFileSync(f, 'utf-8');
  // any live path: dead assets also sit outside /content (e.g. /libs/.../blank.png spacers)
  const stripped = html.replace(/(<picture>\s*)?<img[^>]*src="(https:\/\/www\.manulifeim\.com\/[^"]+)"[^>]*>(\s*<\/picture>)?/g, (m, a, src) => {
    const clean = src.replace(/&amp;/g, '&');
    if (!dead.has(clean)) return m;
    deadLog.push(`${f.replace(/^content|\.plain\.html$/g, '')} ${clean}`);
    return '';
  });
  const out = stripped.replace(/https:\/\/www\.manulifeim\.com\/content\/[^"\s]+/g, (m) => {
    // srcset entries end in a comma; URLs themselves may contain commas and parentheses
    const [, u, tail] = m.match(/^(.*?)(,?)$/);
    const clean = u.replace(/&amp;/g, '&');
    const local = byUrl[clean] || byUrl[clean.split('?')[0]];
    return local ? `${local}${tail}` : m;
  });
  if (out !== html) {
    writeFileSync(f, out);
    changed += 1;
    console.log(`localized ${f.replace(/^content|\.plain\.html$/g, '')}`);
  }
});
if (deadLog.length) {
  writeFileSync('tools/importer/reports/dead-images.txt', `${deadLog.join('\n')}\n`, { flag: 'a' });
}
console.log(`${changed} pages changed${deadLog.length ? `, ${deadLog.length} images dead on live removed (reports/dead-images.txt)` : ''}`);
