#!/usr/bin/env node
/*
 * Makes content/media-da acceptable to Edge Delivery (rules: media.mjs) and keeps every
 * reference in step.
 *
 *   node tools/importer/snapshot/fix-media.mjs [--dry-run] [<name> ...]
 *
 * Per file: extension from the bytes (dutton-charlie-….jpg holding a PNG -> .png), GIF -> PNG,
 * SVG > 40 KB -> PNG at 2x intrinsic size. Then rewrites the old name in
 * snapshots/_images.json, the per-page sidecars (<page>.images.json) and content/**.plain.html
 * (both /media-da/<old> and https://content.da.live/…/media-da/<old>).
 * Converted originals are kept in tools/importer/reports/media-originals/.
 * Log: tools/importer/reports/media-fixes.json; `reupload` lists already uploaded pages whose
 * markup changed (node tools/importer/da-upload.mjs --reupload-fixed).
 */
import {
  readdirSync, readFileSync, writeFileSync, statSync, existsSync, copyFileSync,
} from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import {
  SNAP_DIR, HOST_DIR, MEDIA_DIR, readJson, writeFile,
} from './lib.mjs';
import { fixMediaFile, MIME, extOf } from './media.mjs';

const REPORT = 'tools/importer/reports/media-fixes.json';
const ORIGINALS = 'tools/importer/reports/media-originals';
const UPLOADS = 'tools/importer/reports/da-upload.json';
const IMAGES = `${SNAP_DIR}/_images.json`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));

function walk(dir, test, out = []) {
  if (!existsSync(dir)) return out;
  readdirSync(dir).forEach((f) => {
    const p = join(dir, f);
    if (p === MEDIA_DIR) return;
    if (statSync(p).isDirectory()) walk(p, test, out);
    else if (test(f)) out.push(p);
  });
  return out;
}

const names = only.length ? only : readdirSync(MEDIA_DIR).filter((f) => !f.startsWith('.') && !/\.new-\d+\.png$|\.tmp-\d+\.png$/.test(f));
// rasters over the 20 MB limit: scale down in place (same name, nothing else to rewrite)
if (!dryRun) {
  names.filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).forEach((n) => {
    const file = join(MEDIA_DIR, n);
    if (statSync(file).size <= 20 * 1024 * 1024) return;
    const tmp = `/tmp/fix-media-${process.pid}-${n}`;
    execFileSync('convert', [file, '-resize', '3000x>', '-quality', '85', tmp]);
    copyFileSync(tmp, file);
    console.log(`resized ${n} to ${statSync(file).size} bytes`);
  });
}

const results = names.map((n) => {
  try {
    return fixMediaFile(MEDIA_DIR, n, { dryRun, keepDir: ORIGINALS });
  } catch (e) {
    return { from: n, error: e.message };
  }
}).filter(Boolean);

const verb = (r) => {
  if (r.error) return 'FAIL';
  return dryRun ? 'would' : 'fixed';
};
results.forEach((r) => console.log(`${verb(r)} ${r.action || ''} ${r.from}${r.to ? ` -> ${r.to}` : ''}${r.width ? ` ${r.width}x${r.height} ${r.renderer}` : ''}${r.error ? ` (${r.error})` : ''}`));
const renames = new Map(results.filter((r) => r.to && r.to !== r.from).map((r) => [r.from, r.to]));
if (dryRun || !results.length) {
  console.log(`${results.length} files need a fix${dryRun ? ' (dry run, nothing changed)' : ''}`);
  process.exit(0);
}

// references -------------------------------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const refRe = renames.size
  ? new RegExp(`/media-da/(${[...renames.keys()].map(esc).join('|')})(?![\\w.-])`, 'g')
  : null;
const swap = (s) => (refRe ? s.replace(refRe, (m, old) => `/media-da/${renames.get(old)}`) : s);

// _images.json: entry.file (and type)
const images = readJson(IMAGES, {});
let imageEntries = 0;
Object.values(images).forEach((e) => {
  if (!e.file) return;
  const old = e.file.replace('/media-da/', '');
  const r = results.find((x) => x.from === old && x.to);
  if (!r) return;
  e.file = `/media-da/${r.to}`;
  e.type = MIME[extOf(r.to)];
  if (r.action !== 'rename') e.convertedFrom = r.type;
  imageEntries += 1;
});
if (imageEntries) writeFile(IMAGES, JSON.stringify(images, null, 1));

// per-page sidecars
let sidecars = 0;
walk(HOST_DIR, (f) => f.endsWith('.images.json')).forEach((f) => {
  const before = readFileSync(f, 'utf-8');
  const after = swap(before);
  if (after !== before) {
    writeFileSync(f, after);
    sidecars += 1;
  }
});

// content pages
const pagesByFile = new Map();
const changedPages = [];
walk('content', (f) => f.endsWith('.plain.html')).forEach((f) => {
  const before = readFileSync(f, 'utf-8');
  const used = new Set([...before.matchAll(refRe || /$^/g)].map((m) => m[1]));
  if (!used.size) return;
  writeFileSync(f, swap(before));
  const page = f.replace(/^content/, '').replace(/\.plain\.html$/, '');
  changedPages.push(page);
  used.forEach((n) => pagesByFile.set(n, [...(pagesByFile.get(n) || []), page]));
});

// report -----------------------------------------------------------------------------------
const report = readJson(REPORT, { files: [], reupload: [] });
const uploads = readJson(UPLOADS, {});
const at = new Date().toISOString();
results.forEach((r) => {
  const rec = { ...r, pages: pagesByFile.get(r.from) || [], at };
  const i = report.files.findIndex((x) => x.from === r.from);
  if (i === -1) report.files.push(rec);
  else report.files[i] = rec;
});
const uploaded = changedPages.filter((p) => uploads[p]?.upload < 300);
report.reupload = [...new Set([...(report.reupload || []), ...uploaded])].sort();
report.updated = at;
writeFile(REPORT, `${JSON.stringify(report, null, 1)}\n`);

const count = (a) => results.filter((r) => r.action === a && r.to).length;
console.log(`renamed ${count('rename')}, gif->png ${count('gif-to-png')}, svg->png ${count('svg-to-png')}, failed ${results.filter((r) => r.error).length}`);
console.log(`references: _images.json ${imageEntries}, sidecars ${sidecars}, pages ${changedPages.length} (${uploaded.length} already uploaded -> reupload)`);
const msvg = results.filter((r) => r.renderer === 'imagemagick-msvg');
if (msvg.length) console.log(`check by eye (ImageMagick MSVG fallback): ${msvg.map((r) => r.to).join(', ')}`);
console.log(`log: ${REPORT}`);
