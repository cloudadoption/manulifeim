#!/usr/bin/env node
/* eslint-disable no-console, max-len, no-restricted-syntax, no-await-in-loop, no-continue, no-nested-ternary, import/no-unresolved, import/extensions */
/* global globalThis */
/*
 * Browser-free dry run of the import scripts against the saved snapshots.
 *
 *   node tools/importer/dry-run.mjs [--md] [--html] [--out DIR] [--template NAME] <live path | snapshot file>...
 *   node tools/importer/dry-run.mjs --all [--template NAME] [--limit N]   every snapshot in _state.json
 *   --bundle  run tools/importer/import-<template>.bundle.js (the esbuild output) instead of the sources
 *
 * Loads the snapshot HTML with jsdom, exposes the real @adobe/helix-importer as
 * WebImporter (from the excat content-import skill's node_modules, nothing is installed in
 * the repo), runs WebImporter.html2md with the page's import-<template>.js exactly like the
 * bulk importer does (preProcess, transform, markdown), and prints per page:
 *   - result path, metadata, report fields
 *   - the section / block structure (block header, rows x cells, default content tags,
 *     Section Metadata)
 *   - text completeness: source <main> text vs output text (same scorer as run-bulk-import)
 * --md / --html write <out>/<eds path>.md / .html (default out: /tmp/mim-dry-run); --da writes
 * <out>/<eds path>.plain.html with the bulk importer's md2da (what DA receives).
 * The template comes from _state.json (group / routeClass) unless --template is given.
 */
import {
  readFileSync, existsSync, mkdirSync, writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_ROOT = join(here, 'snapshots');
const SNAP_DIR = join(SNAP_ROOT, 'www.manulifeim.com');
const ORIGIN = 'https://www.manulifeim.com';
const EXCAT = process.env.EXCAT_ROOT || '/home/node/.excat-marketplaces/excat-marketplace/excat';
const NM = join(EXCAT, 'skills/excat-content-import/scripts/node_modules');

process.removeAllListeners('warning');

// the import scripts import JSON without import attributes (esbuild style); let Node load it
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);

const { JSDOM, VirtualConsole } = await import(pathToFileURL(join(NM, 'jsdom/lib/api.js')).href);
const helix = await import(pathToFileURL(join(NM, '@adobe/helix-importer/src/index.js')).href);
let similarity = null;
try {
  similarity = await import(pathToFileURL(join(EXCAT, 'utils/content-similarity.js')).href);
} catch (e) {
  similarity = null;
}

const GROUP_TEMPLATE = {
  homepage: 'home',
  hub: 'plain',
  landing: 'plain',
  strategy: 'plain',
  'strategy-listing': 'plain',
  team: 'plain',
  legal: 'plain',
  people: 'plain',
  'people-listing': 'plain',
  resource: 'plain',
  'resource-listing': 'plain',
  search: 'search',
  'viewpoints-listing': 'viewpoints',
  article: 'viewpoint',
  'press-release-listing': 'press-release-root',
  'press-release': 'press-release',
  'case-study-listing': 'case-study-list',
  case: 'case-study-detail',
  'case-study': 'case-study-detail',
};

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const OUT = opt('--out', '/tmp/mim-dry-run');
const forcedTemplate = opt('--template');
const limit = Number(opt('--limit', '0'));
const quiet = flag('--quiet');
const valueArgs = new Set(['--out', '--template', '--limit']);
const targets = args.filter((a, i) => !a.startsWith('--') && !valueArgs.has(args[i - 1]));

const state = existsSync(join(SNAP_ROOT, '_state.json')) ? JSON.parse(readFileSync(join(SNAP_ROOT, '_state.json'), 'utf-8')) : {};

function resolveTarget(t) {
  if (t.endsWith('.html') && existsSync(t)) {
    const rel = resolve(t).replace(`${SNAP_DIR}`, '').replace(/\.html$/, '');
    return { livePath: rel, file: resolve(t) };
  }
  const livePath = t.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
  return { livePath, file: join(SNAP_DIR, `${livePath}.html`) };
}

let list = targets.map(resolveTarget);
if (flag('--all')) {
  list = Object.entries(state).filter(([, v]) => v.status === 200 && v.file)
    .filter(([, v]) => !forcedTemplate || GROUP_TEMPLATE[v.group] === forcedTemplate)
    .map(([p]) => resolveTarget(p));
  if (limit) list = list.slice(0, limit);
}
if (!list.length) {
  console.log('usage: node tools/importer/dry-run.mjs [--md] [--html] [--template NAME] <live path>... | --all');
  process.exit(1);
}

// --da: the bulk importer's md2da (browser bundle of the excat skill, run in a jsdom window)
let md2da = null;
if (flag('--da')) {
  const bundle = join(EXCAT, 'skills/excat-content-import/scripts/static/inject/helix-importer.js');
  const win = new JSDOM('<html><head></head><body></body></html>', { runScripts: 'outside-only', virtualConsole: new VirtualConsole() }).window;
  win.eval(readFileSync(bundle, 'utf-8'));
  md2da = (md) => win.WebImporter.md2da(md);
}

const modules = {};
const useBundle = flag('--bundle');
async function importModule(template) {
  if (!modules[template]) {
    if (useBundle) {
      // the esbuild IIFE produced by aem-import-bundle.sh (global CustomImportScript)
      const file = join(here, `import-${template}.bundle.js`);
      if (!existsSync(file)) throw new Error(`no bundle ${file} (run aem-import-bundle.sh first)`);
      // eslint-disable-next-line no-new-func
      const lib = new Function(`${readFileSync(file, 'utf-8')}\nreturn CustomImportScript;`)();
      modules[template] = lib.default;
    } else {
      const file = join(here, `import-${template}.js`);
      if (!existsSync(file)) throw new Error(`no import script ${file}`);
      modules[template] = (await import(pathToFileURL(file).href)).default;
    }
  }
  return modules[template];
}

function templateFor(livePath) {
  if (forcedTemplate) return forcedTemplate;
  const s = state[livePath];
  if (s && GROUP_TEMPLATE[s.group]) return GROUP_TEMPLATE[s.group];
  if (s && s.routeClass === 'viewpoint') return 'viewpoint';
  return 'plain';
}

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

function spacedText(root) {
  let out = '';
  const walk = (n) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += `${c.textContent} `;
      else if (c.nodeType === 1) {
        walk(c);
        out += ' ';
      }
    });
  };
  walk(root);
  return out.replace(/\s+/g, ' ').trim();
}

function sourceMainText(document) {
  const root = document.querySelector('main') || document.body;
  const clone = root.cloneNode(true);
  clone.querySelectorAll('header, footer, nav, .header, .footer, .navigation, script, style, noscript').forEach((el) => el.remove());
  let out = '';
  const walk = (n) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += `${c.textContent} `;
      else if (c.nodeType === 1) {
        walk(c);
        out += ' ';
      }
    });
  };
  walk(clone);
  return out.replace(/\s+/g, ' ').trim();
}

function describeCell(td) {
  const parts = [];
  [...td.childNodes].forEach((n) => {
    if (n.nodeType === 3 && norm(n.textContent)) parts.push(`"${norm(n.textContent).slice(0, 40)}"`);
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (tag === 'img') parts.push('img');
    else if (tag === 'p' && n.querySelector('img') && !norm(n.textContent)) parts.push('img');
    else if (tag === 'p' && n.querySelector('a') && norm(n.textContent) === norm(n.querySelector('a').textContent)) parts.push(`link(${norm(n.textContent).slice(0, 30)})`);
    else if (/^h[1-6]$/.test(tag)) parts.push(`${tag}"${norm(n.textContent).slice(0, 40)}"`);
    else if (tag === 'ul' || tag === 'ol') parts.push(`${tag}[${n.children.length}]`);
    else parts.push(tag);
  });
  return parts.join(' ') || '-';
}

function describe(element) {
  const sections = [[]];
  [...element.children].forEach((n) => {
    if (n.tagName === 'HR') sections.push([]);
    else sections[sections.length - 1].push(n);
  });
  return sections.map((nodes, i) => {
    const lines = [];
    let defaults = [];
    const flush = () => {
      if (defaults.length) lines.push(`    default: ${defaults.join(' ')}`);
      defaults = [];
    };
    nodes.forEach((n) => {
      if (n.tagName === 'TABLE') {
        flush();
        const rows = [...n.querySelectorAll(':scope > tbody > tr, :scope > tr')];
        const name = norm(rows[0] ? rows[0].textContent : '');
        if (/^Section Metadata$/i.test(name) || /^Metadata$/i.test(name)) {
          const kv = rows.slice(1).map((r) => `${norm(r.children[0].textContent)}=${norm(r.children[1] ? (r.children[1].querySelector('img') ? `img:${r.children[1].querySelector('img').getAttribute('src')}` : r.children[1].textContent) : '').slice(0, 140)}`);
          lines.push(`    [${name}] ${kv.join(' | ')}`);
          return;
        }
        lines.push(`    [${name}] ${rows.length - 1} rows`);
        rows.slice(1).forEach((r, j) => {
          if (j < 12 || !quiet) lines.push(`      ${j + 1}: ${[...r.children].map(describeCell).join(' || ')}`.slice(0, 260));
        });
      } else {
        const tag = n.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) defaults.push(`${tag}"${norm(n.textContent).slice(0, 50)}"`);
        else if (tag === 'p' && n.querySelector('img') && !norm(n.textContent)) defaults.push('img');
        else defaults.push(tag);
      }
    });
    flush();
    return `  section ${i + 1}\n${lines.join('\n')}`;
  }).join('\n');
}

let failures = 0;
const summary = [];
for (const { livePath, file } of list) {
  if (!existsSync(file)) {
    console.log(`\n### ${livePath}: snapshot missing (${file})`);
    failures += 1;
    continue;
  }
  const template = templateFor(livePath);
  const html = readFileSync(file, 'utf-8');
  const dom = new JSDOM(html, { url: 'about:blank', virtualConsole: new VirtualConsole() });
  const { document } = dom.window;
  globalThis.WebImporter = helix;
  const srcText = sourceMainText(document);
  const url = `${ORIGIN}${livePath}`;
  let captured = null;
  let result;
  try {
    const mod = await importModule(template);
    const wrapped = {
      ...mod,
      transform: (payload) => {
        const out = mod.transform(payload);
        [captured] = out;
        return out;
      },
    };
    result = await helix.html2md(url, document, wrapped, { toMd: true, toDocx: false }, { originalURL: url });
  } catch (e) {
    console.log(`\n### ${livePath} [${template}] FAILED: ${e.stack || e.message}`);
    failures += 1;
    dom.window.close();
    continue;
  }
  const outEl = captured && captured.element;
  const outText = outEl ? spacedText(outEl) : '';
  let score = null;
  let missing = [];
  if (similarity && srcText) {
    score = similarity.computeTextSimilarity(srcText, norm(outText));
    if (score < 0.995) missing = similarity.findMissingPhrases(srcText, norm(outText)).slice(0, 8);
  }
  // recall: share of source words (multiset) found in the output; lists words in deficit
  const toks = (t) => (t || '').toLowerCase().replace(/[^a-z0-9%$]+/g, ' ').trim().split(' ')
    .filter((w) => w.length > 1);
  const count = (arr) => arr.reduce((m, w) => { m[w] = (m[w] || 0) + 1; return m; }, {});
  const sc = count(toks(srcText));
  const oc = count(toks(outText));
  let hit = 0;
  let total = 0;
  const deficit = [];
  Object.entries(sc).forEach(([w, n]) => {
    total += n;
    hit += Math.min(n, oc[w] || 0);
    if ((oc[w] || 0) < n) deficit.push(`${w}${n - (oc[w] || 0) > 1 ? `x${n - (oc[w] || 0)}` : ''}`);
  });
  const recall = total ? hit / total : 1;
  const report = captured ? captured.report : {};
  const p = (captured && captured.path) || result.path;
  summary.push({
    livePath, template, path: p, score, recall, unmigrated: report['unmigrated-link-count'],
  });
  console.log(`\n### ${livePath}  [import-${template}.js] -> ${p}`);
  console.log(`  report: blocks=${report.blocks} sections=${report.sections} unmigrated-links=${report['unmigrated-link-count']}`);
  if (score !== null) console.log(`  text completeness: cosine ${(score * 100).toFixed(1)}% (run-bulk-import scorer), recall ${(recall * 100).toFixed(1)}% of source words${missing.length ? `\n  missing phrases: ${missing.map((m) => JSON.stringify(m.slice(0, 80))).join(', ')}` : ''}`);
  if (deficit.length) console.log(`  words in deficit (${deficit.length}): ${deficit.slice(0, 40).join(' ')}`);
  if (outEl) console.log(describe(outEl));
  if (flag('--md') || flag('--html') || md2da) {
    const base = join(OUT, p.replace(/^\//, ''));
    mkdirSync(dirname(base), { recursive: true });
    if (flag('--md')) writeFileSync(`${base}.md`, result.md || '');
    if (flag('--html') && outEl) writeFileSync(`${base}.html`, outEl.outerHTML);
    if (md2da) writeFileSync(`${base}.plain.html`, await md2da(result.md || ''));
    if (flag('--links')) writeFileSync(`${base}.links.json`, report['unmigrated-links'] || '[]');
  }
  dom.window.close();
}

if (summary.length > 1) {
  console.log('\n=== summary');
  summary.forEach((s) => console.log(`cos ${s.score === null ? '  n/a ' : `${(s.score * 100).toFixed(1).padStart(5)}%`} recall ${(s.recall * 100).toFixed(1).padStart(5)}%  ${s.template.padEnd(18)} ${s.path}  (live links: ${s.unmigrated})`));
}
process.exit(failures ? 1 : 0);
