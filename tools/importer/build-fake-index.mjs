#!/usr/bin/env node
/* eslint-disable no-console, max-len, no-restricted-syntax, no-continue, import/no-unresolved, import/extensions */
/*
 * Builds a fake query index from the live snapshots, without a browser or network:
 *
 *   node tools/importer/build-fake-index.mjs [--da-dir DIR] [--out DIR]
 *
 * 1. runs the real import (tools/importer/dry-run.mjs --all --da) on every snapshot, so the
 *    metadata comes from the import metadata rules (transformers/metadata.js) and main is
 *    the document DA receives;
 * 2. renders each page the way EDS does for the indexer: metadata rows -> <head> meta tags
 *    (`Publication Date` -> meta[name=publication-date], `Tags` -> meta[property=article:tag]
 *    per value, Title -> og:title, Image -> og:image, site-wide Robots: noindex), sections
 *    -> <main>;
 * 3. evaluates tools/importer/query.yaml (include/exclude globs, select/selectFirst,
 *    value/values with attribute, textContent, innerHTML, match, words, characters,
 *    replace, replaceAll, parseTimestamp, headers) for every index;
 * 4. writes one single-sheet JSON per index target to migration-work/fake-index/
 *    (query-index.json, query-index-viewpoints.json, ...), shaped like the AEM output.
 *
 * Differences to the real index: image paths keep the live host (the DAM images are not
 * uploaded yet), lastModified is the snapshot capture time, and only the captured pages
 * (tools/importer/snapshots/_state.json) are in it.
 */
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync,
} from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const EXCAT = process.env.EXCAT_ROOT || '/home/node/.excat-marketplaces/excat-marketplace/excat';
const NM = join(EXCAT, 'skills/excat-content-import/scripts/node_modules');
const { JSDOM, VirtualConsole } = await import(pathToFileURL(join(NM, 'jsdom/lib/api.js')).href);
const yamlMod = await import(pathToFileURL(join(NM, 'js-yaml/dist/js-yaml.mjs')).href);
const yaml = yamlMod.default || yamlMod;

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const OUT = opt('--out', join(repo, 'migration-work/fake-index'));
let DA = opt('--da-dir');
const LIVE_ORIGIN = 'https://www.manulifeim.com';

/* ---------- 1. import every snapshot ---------- */
if (!DA) {
  DA = '/tmp/mim-fake-index-da';
  console.log(`importing snapshots (dry-run --all --da) -> ${DA}`);
  const r = spawnSync(process.execPath, [join(here, 'dry-run.mjs'), '--all', '--da', '--quiet', '--out', DA], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    console.error('dry-run failed');
    process.exit(1);
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const state = JSON.parse(readFileSync(join(here, 'snapshots/_state.json'), 'utf-8'));
const capturedAt = {};
Object.entries(state).forEach(([live, v]) => { capturedAt[live.toLowerCase()] = v.at; });

/* ---------- 2. EDS rendering of head + main ---------- */
const vc = new VirtualConsole();
const toMetaName = (k) => k.toLowerCase().replace(/[^0-9a-z:_]/g, '-');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function render(daHtml) {
  const dom = new JSDOM(`<body>${daHtml}</body>`, { virtualConsole: vc });
  const doc = dom.window.document;
  const meta = {};
  doc.querySelectorAll('div.metadata').forEach((m) => {
    [...m.children].forEach((row) => {
      const [k, v] = row.children;
      if (!k || !v) return;
      const img = v.querySelector('img');
      meta[k.textContent.trim()] = img ? img.getAttribute('src') : v.textContent.trim();
    });
    m.remove();
  });
  const head = [];
  const add = (attr, name, content) => {
    if (content !== undefined && content !== '') head.push(`<meta ${attr}="${esc(name)}" content="${esc(content)}">`);
  };
  Object.entries(meta).forEach(([k, v]) => {
    const key = k.toLowerCase();
    if (key === 'title') {
      head.push(`<title>${esc(v)}</title>`);
      add('property', 'og:title', v);
      add('name', 'twitter:title', v);
    } else if (key === 'description') {
      add('name', 'description', v);
      add('property', 'og:description', v);
    } else if (key === 'image') {
      add('property', 'og:image', v);
    } else if (key === 'tags') {
      v.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => add('property', 'article:tag', t));
    } else if (key === 'canonical') {
      head.push(`<link rel="canonical" href="${esc(v)}">`);
    } else {
      add('name', toMetaName(k), v);
    }
  });
  if (!meta.Image) {
    const first = doc.querySelector('img');
    add('property', 'og:image', first ? first.getAttribute('src') : `${LIVE_ORIGIN}/default-meta-image.png`);
  }
  if (!meta.Robots) add('name', 'robots', 'noindex'); // bulk metadata sheet (/metadata for /**)
  const main = [...doc.body.children].map((c) => c.outerHTML).join('\n');
  return new JSDOM(`<!DOCTYPE html><html><head>${head.join('\n')}</head><body><header></header><main>${main}</main><footer></footer></body></html>`, { virtualConsole: vc }).window.document;
}

/* ---------- 3. index expression evaluator ---------- */
function tokenizeExpr(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; } else { s += src[j]; j += 1; }
      }
      out.push({ t: 'str', v: s });
      i = j + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w-]/.test(src[j])) j += 1;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
    } else if (/[-\d]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /\d/.test(src[j])) j += 1;
      out.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j;
    } else {
      out.push({ t: c });
      i += 1;
    }
  }
  return out;
}

function parseExpr(src) {
  const toks = tokenizeExpr(src);
  let p = 0;
  const peek = () => toks[p];
  const take = (t) => {
    const tok = toks[p];
    if (!tok || (t && tok.t !== t)) throw new Error(`index expression "${src}": expected ${t} at ${p}`);
    p += 1;
    return tok;
  };
  function expr() {
    const tok = take();
    if (tok.t === 'str') return { k: 'lit', v: tok.v };
    if (tok.t === 'num') return { k: 'lit', v: tok.v };
    if (tok.t !== 'id') throw new Error(`index expression "${src}": unexpected ${tok.t}`);
    if (peek() && peek().t === '(') {
      take('(');
      const argv = [];
      while (peek() && peek().t !== ')') {
        argv.push(expr());
        if (peek() && peek().t === ',') take(',');
      }
      take(')');
      return { k: 'call', name: tok.v, args: argv };
    }
    if (peek() && peek().t === '[') {
      take('[');
      const key = expr();
      take(']');
      return { k: 'index', name: tok.v, key };
    }
    return { k: 'var', name: tok.v };
  }
  const tree = expr();
  if (p !== toks.length) throw new Error(`index expression "${src}": trailing tokens`);
  return tree;
}

const MON = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
function parseTimestamp(value, format) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (format === 'YYYY-MM-DD') {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : '';
  }
  if (format === 'ddd, DD MMM YYYY hh:mm:ss GMT') {
    const m = s.match(/^\w{3}, (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/);
    return m ? Date.UTC(+m[3], MON[m[2]], +m[1], +m[4], +m[5], +m[6]) / 1000 : '';
  }
  throw new Error(`parseTimestamp format not supported here: ${format}`);
}

const str = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.nodeType) return v.textContent;
  return String(v);
};

function evaluate(node, ctx) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'var':
      if (node.name === 'el') return ctx.el;
      if (node.name === 'path') return ctx.path;
      throw new Error(`unknown variable ${node.name}`);
    case 'index':
      if (node.name === 'headers') return ctx.headers[String(evaluate(node.key, ctx)).toLowerCase()] || '';
      throw new Error(`unknown map ${node.name}`);
    case 'call': {
      const a = node.args.map((x) => evaluate(x, ctx));
      switch (node.name) {
        case 'attribute': return a[0] && a[0].getAttribute ? (a[0].getAttribute(a[1]) || '') : '';
        case 'textContent': return a[0] && a[0].textContent !== undefined ? a[0].textContent.replace(/\s+/g, ' ').trim() : '';
        case 'innerHTML': return a[0] && a[0].innerHTML !== undefined ? a[0].innerHTML.trim() : '';
        case 'match': {
          const m = str(a[0]).match(new RegExp(a[1]));
          if (!m) return '';
          return m[1] !== undefined ? m[1] : m[0];
        }
        case 'words': return str(a[0]).split(/\s+/).filter(Boolean).slice(a[1], a[2]).join(' ');
        case 'characters': return str(a[0]).slice(a[1], a[2]);
        case 'replace': return str(a[0]).replace(a[1], a[2]);
        case 'replaceAll': return str(a[0]).split(a[1]).join(a[2]);
        case 'parseTimestamp': return parseTimestamp(str(a[0]), a[1]);
        default: throw new Error(`function not supported: ${node.name}`);
      }
    }
    default: throw new Error('bad node');
  }
}

/* include/exclude globs: `*` = one segment, `**` = any depth */
function globRe(glob) {
  const re = glob.split('/').map((seg) => {
    if (seg === '**') return '§§';
    return seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  }).join('/').replace(/\/§§/g, '(?:/.*)?').replace(/§§/g, '.*');
  return new RegExp(`^${re}$`);
}

function compileIndex(def) {
  const props = Object.entries(def.properties || {}).map(([name, p]) => ({
    name,
    select: p.select || p.selectFirst || 'none',
    first: !!p.selectFirst,
    multi: p.values !== undefined,
    expr: parseExpr(String(p.values !== undefined ? p.values : p.value)),
  }));
  return {
    include: (def.include || []).map(globRe),
    exclude: (def.exclude || []).map(globRe),
    target: def.target,
    props,
  };
}

function indexRow(index, doc, path, headers) {
  const row = { path };
  index.props.forEach((p) => {
    let els = [];
    if (p.select !== 'none') els = [...doc.querySelectorAll(p.select)];
    if (p.first) els = els.slice(0, 1);
    if (p.multi) {
      const values = els.map((el) => str(evaluate(p.expr, { el, path, headers }))).filter((v) => v !== '');
      row[p.name] = values.length ? JSON.stringify(values) : '';
    } else if (p.select === 'none') {
      row[p.name] = evaluate(p.expr, { el: null, path, headers });
    } else {
      row[p.name] = els.length ? evaluate(p.expr, { el: els[0], path, headers }) : '';
    }
    if (row[p.name] === null || row[p.name] === undefined) row[p.name] = '';
  });
  return row;
}

/* ---------- 4. run ---------- */
const config = yaml.load(readFileSync(join(here, 'query.yaml'), 'utf-8'));
// YAML merge keys (`<<: *default`): this js-yaml build keeps them as a plain `<<` key
const resolveMerge = (def) => {
  const base = def['<<'];
  if (!base) return def;
  const merged = { ...(Array.isArray(base) ? Object.assign({}, ...base) : base), ...def };
  delete merged['<<'];
  return merged;
};
const indices = Object.entries(config.indices)
  .map(([name, def]) => ({ name, ...compileIndex(resolveMerge(def)) }));
const rows = Object.fromEntries(indices.map((i) => [i.name, []]));

const files = walk(DA).filter((f) => f.endsWith('.plain.html'));
files.forEach((file) => {
  const path = `/${relative(DA, file).replace(/\.plain\.html$/, '')}`;
  const doc = render(readFileSync(file, 'utf-8'));
  const at = capturedAt[path.toLowerCase()] || new Date().toISOString();
  const headers = { 'last-modified': new Date(at).toUTCString() };
  indices.forEach((index) => {
    if (!index.include.some((re) => re.test(path)) || index.exclude.some((re) => re.test(path))) return;
    const row = indexRow(index, doc, path, headers);
    // keep live image hosts in the fake index (DAM images are not uploaded to DA yet)
    const og = doc.querySelector('meta[property="og:image"]');
    if (row.image && og && og.getAttribute('content').startsWith(LIVE_ORIGIN)) row.image = og.getAttribute('content').split('?')[0];
    rows[index.name].push(row);
  });
});

mkdirSync(OUT, { recursive: true });
indices.forEach((index) => {
  const data = rows[index.name].sort((a, b) => a.path.localeCompare(b.path));
  const columns = ['path', ...index.props.map((p) => p.name)];
  const json = {
    total: data.length, offset: 0, limit: data.length, data, columns, ':type': 'sheet',
  };
  const file = join(OUT, index.target.split('/').pop());
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${index.name.padEnd(13)} ${String(data.length).padStart(4)} rows -> ${relative(repo, file)}`);
});
if (!existsSync(join(OUT, 'README.txt'))) {
  writeFileSync(join(OUT, 'README.txt'), 'Generated by tools/importer/build-fake-index.mjs from the live snapshots (see tools/importer/QUERY-INDEX.md). Do not edit.\n');
}
