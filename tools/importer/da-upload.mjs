#!/usr/bin/env node
/*
 * Uploads imported pages to Document Authoring and previews them on
 * main--manulifeim--cloudadoption.aem.page. Never publishes.
 *
 *   node tools/importer/da-upload.mjs [--no-preview] [--force] <eds path> ...
 *   node tools/importer/da-upload.mjs --all [--limit N]     every content/**.plain.html not yet uploaded
 *   node tools/importer/da-upload.mjs --reupload-fixed      pages listed in reports/media-fixes.json
 *
 * Guards (page skipped, nothing sent): an <img> still on www.manulifeim.com (check-images.mjs;
 * override with --allow-live-images), more than 200 distinct images, or a /media-da file
 * Edge Delivery would reject (wrong extension, GIF, SVG > 40 KB: run
 * tools/importer/snapshot/fix-media.mjs first).
 *
 * Per page: uploads the /media-da/ images it uses to DA (once), rewrites their src in the local
 * content/<path>.plain.html to the DA media URL (so the local file is exactly what DA gets),
 * POSTs the page to admin.da.live, reads it back to confirm it matches, then previews it.
 * Credentials are injected by the environment (no Authorization header here).
 * State: tools/importer/reports/da-upload.json (pages) and da-media.json (images).
 */
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { liveImages, imageNames, PAGE_IMAGE_LIMIT } from './check-images.mjs';
import { mediaProblem } from './snapshot/media.mjs';

const ORG = 'cloudadoption';
const SITE = 'manulifeim';
const DA_SOURCE = `https://admin.da.live/source/${ORG}/${SITE}`;
const DA_MEDIA = `https://content.da.live/${ORG}/${SITE}/media-da/`;
const PREVIEW = `https://admin.hlx.page/preview/${ORG}/${SITE}/main`;
const REPORTS = 'tools/importer/reports';
mkdirSync(REPORTS, { recursive: true });
const pagesFile = `${REPORTS}/da-upload.json`;
const mediaFile = `${REPORTS}/da-media.json`;
const fixesFile = `${REPORTS}/media-fixes.json`;
const pages = existsSync(pagesFile) ? JSON.parse(readFileSync(pagesFile, 'utf-8')) : {};
const media = existsSync(mediaFile) ? JSON.parse(readFileSync(mediaFile, 'utf-8')) : {};
const save = () => {
  writeFileSync(pagesFile, JSON.stringify(pages, null, 1));
  writeFileSync(mediaFile, JSON.stringify(media, null, 1));
};

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const li = args.indexOf('--limit');
const limit = li === -1 ? Infinity : Number(args[li + 1]);

function curl(argv) {
  const out = execFileSync('curl', ['-s', '-S', '-w', '\n%{http_code}', ...argv], { maxBuffer: 64 * 1024 * 1024 }).toString();
  const i = out.lastIndexOf('\n');
  return { status: Number(out.slice(i + 1)), body: out.slice(0, i) };
}

const norm = (h) => h.replace(/\s+/g, ' ').replace(/> </g, '><').trim();

function uploadMedia(name, onDa) {
  if (media[name]?.status === 201 || media[name]?.status === 200) return true;
  const file = `content/media-da/${name}`;
  if (!existsSync(file)) {
    // already referenced by its DA URL and not kept locally: nothing to upload
    if (onDa) return true;
    media[name] = { status: 'missing' };
    return false;
  }
  const r = curl(['-X', 'POST', '-F', `data=@${file}`, `${DA_SOURCE}/media-da/${name}`]);
  media[name] = { status: r.status, at: new Date().toISOString() };
  return r.status < 300;
}

// guides the team maintains and publishes itself: never uploaded or previewed from here
const PROTECTED = /^\/migration-status(\/|$)/;

function uploadPage(path) {
  if (PROTECTED.test(path)) return { path, skipped: 'protected guide page (/migration-status)' };
  const file = `content${path}.plain.html`;
  if (!existsSync(file)) return { path, error: 'no local file' };
  let html = readFileSync(file, 'utf-8');
  const live = liveImages(html);
  if (live.length && !flag('allow-live-images')) {
    return { path, skipped: `${live.length} image(s) still on the live site, e.g. ${live[0]} (download them, or --allow-live-images)` };
  }
  const distinct = imageNames(html).length;
  if (distinct > PAGE_IMAGE_LIMIT) {
    return { path, skipped: `${distinct} distinct images, preview fails over ${PAGE_IMAGE_LIMIT} (move some to a fragment, e.g. split-browse-by.mjs)` };
  }
  const names = [...new Set([...html.matchAll(/\/media-da\/([^"'\s?)]+)/g)].map((m) => m[1]))];
  const bad = names.filter((n) => existsSync(`content/media-da/${n}`))
    .map((n) => [n, mediaProblem(`content/media-da/${n}`)]).filter(([, pr]) => pr);
  if (bad.length) {
    return { path, skipped: `media Edge Delivery rejects: ${bad.map(([n, pr]) => `${n} (${pr.action})`).join(', ')}; run tools/importer/snapshot/fix-media.mjs` };
  }
  // images: upload once (new names too, e.g. after fix-media), then point the local copy at the DA media URL
  const failed = names.filter((n) => !uploadMedia(n, html.includes(`${DA_MEDIA}${n}`)));
  html = html.replace(/(["'(\s])\/media-da\//g, `$1${DA_MEDIA}`);
  writeFileSync(file, html);

  const doc = `/tmp/da-${process.pid}.html`;
  writeFileSync(doc, `<body><header></header><main>${html}</main><footer></footer></body>`);
  const up = curl(['-X', 'POST', '-F', `data=@${doc};type=text/html`, `${DA_SOURCE}${path}.html`]);
  const rec = {
    upload: up.status, images: names.length, imagesFailed: failed, at: new Date().toISOString(),
  };
  if (up.status >= 300) {
    rec.error = up.body.slice(0, 300);
    return rec;
  }
  const back = curl([`${DA_SOURCE}${path}.html`]);
  const main = (back.body.match(/<main>([\s\S]*)<\/main>/) || [])[1];
  rec.matches = main !== undefined && norm(main) === norm(html);
  if (main !== undefined && !rec.matches) {
    // DA normalised the markup: keep the local copy identical to DA
    writeFileSync(file, main);
    rec.localUpdated = true;
  }
  if (!flag('no-preview')) {
    const pv = curl(['-X', 'POST', `${PREVIEW}${path}`]);
    rec.preview = pv.status;
    if (pv.status >= 300) rec.previewError = pv.body.slice(0, 200);
  }
  return rec;
}

function listAll(dir = 'content', out = []) {
  readdirSync(dir).forEach((f) => {
    const p = join(dir, f);
    if (f === 'media-da') return;
    if (statSync(p).isDirectory()) listAll(p, out);
    else if (f.endsWith('.plain.html')) out.push(p.replace(/^content/, '').replace(/\.plain\.html$/, ''));
  });
  return out;
}

const fixes = existsSync(fixesFile) ? JSON.parse(readFileSync(fixesFile, 'utf-8')) : { reupload: [] };
const reupload = flag('reupload-fixed') ? (fixes.reupload || []) : [];
let todo = flag('all') ? listAll() : args.filter((a) => a.startsWith('/'));
if (!flag('force')) todo = todo.filter((p) => !(pages[p]?.upload < 300 && (flag('no-preview') || pages[p]?.preview < 300)));
todo = [...new Set([...reupload, ...todo])].slice(0, limit);
let ok = 0;
let skipped = 0;
todo.forEach((p, i) => {
  const rec = uploadPage(p);
  if (rec.skipped) {
    // the previous record (if any) stays: the page was not sent
    skipped += 1;
    console.log(`[${i + 1}/${todo.length}] ${p} SKIPPED: ${rec.skipped}`);
    return;
  }
  pages[p] = rec;
  if (reupload.includes(p) && rec.upload < 300) {
    fixes.reupload = fixes.reupload.filter((x) => x !== p);
    writeFileSync(fixesFile, `${JSON.stringify(fixes, null, 1)}\n`);
  }
  save();
  const good = rec.upload < 300 && (flag('no-preview') || rec.preview < 300);
  if (good) ok += 1;
  console.log(`[${i + 1}/${todo.length}] ${p} upload ${rec.upload ?? '-'} preview ${rec.preview ?? '-'} img ${rec.images ?? 0}${rec.imagesFailed?.length ? ` (failed ${rec.imagesFailed.length})` : ''}${rec.matches === false ? ' (local updated from DA)' : ''} ${rec.error || rec.previewError || ''}`);
  if ([401, 403].includes(rec.upload) || [401, 403].includes(rec.preview)) {
    console.log('auth error: stop');
    process.exit(3);
  }
});
const all = Object.values(pages);
console.log(`done ${ok}/${todo.length}${skipped ? `, skipped ${skipped}` : ''}; total uploaded ${all.filter((r) => r.upload < 300).length}, previewed ${all.filter((r) => r.preview < 300).length}`);
