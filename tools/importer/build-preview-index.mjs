#!/usr/bin/env node
/*
 * Builds a stand-in for the query index from the PREVIEWED pages, as a multi-sheet JSON
 * (one sheet per index in tools/importer/query.yaml, same properties and include/exclude rules).
 *
 * Why: Edge Delivery indexes only published pages ("An index does not contain pages that have
 * only been previewed but never published", aem.live/developer/indexing), and this replica is
 * preview-only. The blocks read the real index first and fall back to this file
 * (/institutional/tw/en/preview-index.json, scripts/block-utils.js) while the real one is missing.
 *
 *   node tools/importer/build-preview-index.mjs [--out tools/importer/reports/preview-index.json]
 *
 * Reads the list of previewed pages from tools/importer/reports/da-upload.json and fetches
 * each page from main--manulifeim--cloudadoption.aem.page (our own preview, not the live site).
 * Upload the result with da-upload.mjs --sheet (see AGENTS.md).
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const { JSDOM } = require('/usr/local/lib/node_modules/jsdom');

const PREVIEW = 'https://main--manulifeim--cloudadoption.aem.page';
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = oi === -1 ? 'tools/importer/reports/preview-index.json' : args[oi + 1];

const config = yaml.load(readFileSync('tools/importer/query.yaml', 'utf-8'));
const uploads = JSON.parse(readFileSync('tools/importer/reports/da-upload.json', 'utf-8'));

const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]+').replace(/\u0000/g, '.*')}$`);
const matches = (path, list = []) => list.some((g) => globRe(g).test(path));

const attr = (el, name) => (el ? el.getAttribute(name) || '' : '');
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const parseTs = (v) => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? '' : Math.floor(t / 1000);
};

/** Evaluates the value expressions used in query.yaml. */
function evaluate(expr, el, headers) {
  let m = expr.match(/^attribute\(el, "([^"]+)"\)$/);
  if (m) return attr(el, m[1]);
  m = expr.match(/^match\(attribute\(el, "([^"]+)"\), "(.+)"\)$/);
  if (m) {
    const r = attr(el, m[1]).match(new RegExp(m[2].replace(/\\\\/g, '\\')));
    return r ? r[1] : '';
  }
  m = expr.match(/^parseTimestamp\(attribute\(el, "([^"]+)"\), "[^"]+"\)$/);
  if (m) return parseTs(attr(el, m[1]));
  if (/^parseTimestamp\(headers\["last-modified"\]/.test(expr)) return parseTs(headers.get('last-modified'));
  if (expr === 'textContent(el)') return text(el);
  m = expr.match(/^words\(textContent\(el\), (\d+), (\d+)\)$/);
  if (m) return text(el).split(' ').slice(Number(m[1]), Number(m[2])).join(' ');
  throw new Error(`unsupported expression ${expr}`);
}

function row(path, doc, headers, props) {
  const out = { path };
  Object.entries(props).forEach(([key, p]) => {
    if (p.values) {
      const els = p.select ? [...doc.querySelectorAll(p.select)] : [];
      out[key] = JSON.stringify(els.map((el) => evaluate(p.values, el, headers)).filter(Boolean));
      return;
    }
    const sel = p.selectFirst || p.select;
    const el = sel && sel !== 'none' ? doc.querySelector(sel) : null;
    if (sel && sel !== 'none' && !el) {
      out[key] = '';
      return;
    }
    out[key] = evaluate(p.value, el, headers);
  });
  // author photos in the metadata point at DA media (needs a login); use the media-bus URL of
  // the same photo as rendered in the page's author box (img alt = author name)
  if (out.authorDetails) {
    try {
      const authors = JSON.parse(out.authorDetails);
      const imgs = [...doc.querySelectorAll('main img')];
      authors.forEach((a) => {
        const img = imgs.find((i) => (i.getAttribute('alt') || '').trim() === (a.name || '').trim());
        if (img) a.photo = new URL(img.getAttribute('src'), `${PREVIEW}${path}`).pathname;
        else if (/content\.da\.live/.test(a.photo || '')) a.photo = '';
      });
      out.authorDetails = JSON.stringify(authors);
    } catch (e) { /* keep as is */ }
  }
  return out;
}

const pages = Object.entries(uploads)
  .filter(([p, r]) => r.preview < 300 && p.startsWith('/institutional/tw/en'))
  .map(([p]) => p)
  .sort();

const sheets = Object.fromEntries(Object.keys(config.indices).map((k) => [k, []]));
let fetched = 0;
for (let i = 0; i < pages.length; i += 1) {
  const path = pages[i];
  const wanted = Object.entries(config.indices)
    .filter(([, idx]) => matches(path, idx.include) && !matches(path, idx.exclude));
  if (!wanted.length) continue; // eslint-disable-line no-continue
  // eslint-disable-next-line no-await-in-loop
  const resp = await fetch(`${PREVIEW}${path}`);
  if (!resp.ok) {
    console.log(`skip ${resp.status} ${path}`);
    continue; // eslint-disable-line no-continue
  }
  // eslint-disable-next-line no-await-in-loop
  const { document } = new JSDOM(await resp.text()).window;
  fetched += 1;
  wanted.forEach(([name, idx]) => sheets[name].push(row(path, document, resp.headers, idx.properties)));
}

const names = Object.keys(sheets);
const json = { ':names': names, ':version': 3, ':type': 'multi-sheet' };
names.forEach((n) => {
  json[n] = {
    total: sheets[n].length, offset: 0, limit: sheets[n].length, data: sheets[n],
  };
});
writeFileSync(OUT, JSON.stringify(json));
console.log(`fetched ${fetched} previewed pages -> ${OUT}: ${names.map((n) => `${n} ${sheets[n].length}`).join(', ')}`);
