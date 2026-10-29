/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline regression tests for malformed metadata images (Global forest products: live og:image
 * "https://www.manulifeim.comhttps://author-tmp.jhinvestments.com/...", which the importer's URL
 * normalization turns into "https://www.manulifeim.comhttps//author-tmp...").
 * - check-images.mjs (real script in a temp working directory) and its liveImages() export, which
 *   da-upload.mjs uses, must hold both forms.
 * - transformers/metadata.js (real transformer in jsdom) must not make such an og:image a
 *   runtime Image cell; valid og:image values are unchanged.
 * No network, no live fetches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const CHECK = join(here, '..', 'check-images.mjs');

// utils/links.js imports link-map.json without import attributes (esbuild style)
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const { liveImages } = await import(pathToFileURL(CHECK).href);
const metadata = (await import(pathToFileURL(join(here, '..', 'transformers', 'metadata.js')).href)).default;

const ASSET = 'author-tmp.jhinvestments.com/assetdetails.html/content/dam/mim-institutional/global/viewpoints/tl-1_forest/TL-1_hero_1200x628.jpg';
const RAW = `https://www.manulifeim.comhttps://${ASSET}`; // as on the live page
const NORMALIZED = `https://www.manulifeim.comhttps//${ASSET}`; // after new URL() in the importer
const SOURCE = 'https://www.manulifeim.com/content/dam/mim-institutional/global/viewpoints/tl-2/TL-2-chart.png';
const MEDIA = 'https://content.da.live/cloudadoption/manulifeim/media-da/tl-2-chart-aaaa1111.png';
// another URL inside a query parameter is legitimate
const QUERY = `${MEDIA}?ref=https://www.manulifeim.com/content/dam/x.png`;
const pic = (src) => `<picture><img src="${src}" alt=""></picture>`;
const metaBlock = (src) => `<div class="metadata"><div><div>Image</div><div>${pic(src)}</div></div></div>`;

function runCheck(pages) {
  const dir = mkdtempSync(join(tmpdir(), 'metadata-image-test-'));
  Object.entries(pages).forEach(([p, html]) => {
    const f = join(dir, 'content', `${p}.plain.html`);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, html);
  });
  const r = spawnSync(process.execPath, [CHECK, '--quiet'], { cwd: dir, encoding: 'utf-8' });
  const report = JSON.parse(readFileSync(join(dir, 'tools/importer/reports/live-images.json'), 'utf-8'));
  return { status: r.status, hits: report.hits };
}

test('check-images holds pages whose metadata image is a manulifeim.comhttps concatenation (both forms)', () => {
  const { status, hits } = runCheck({
    '/a/normalized': `<div><p>Body</p></div>${metaBlock(NORMALIZED)}`,
    '/a/raw': `<div><p>Body</p></div>${metaBlock(RAW)}`,
  });
  assert.equal(status, 1);
  assert.deepEqual(hits, { '/a/normalized': [NORMALIZED], '/a/raw': [RAW] });
  assert.deepEqual(liveImages(pic(NORMALIZED)), [NORMALIZED]);
  assert.deepEqual(liveImages(pic(RAW)), [RAW]);
  assert.deepEqual(liveImages(`<picture><source srcset="${NORMALIZED} 2x"><img src="${MEDIA}"></picture>`), [NORMALIZED]);
});

test('check-images: ordinary source images still held; downloaded media and URLs in query parameters are not', () => {
  const { status, hits } = runCheck({
    '/b/source': `<div>${pic(SOURCE)}</div>`,
    '/b/media': `<div>${pic(MEDIA)}</div>${metaBlock(MEDIA)}`,
    '/b/query': `<div>${pic(QUERY)}</div>`,
    '/b/other-host': `<div>${pic('https://www.manulifeim.community.example/x.png')}</div>`,
  });
  assert.equal(status, 1);
  assert.deepEqual(hits, { '/b/source': [SOURCE] });
});

function runMetadata(og) {
  const { document } = new JSDOM(`<!DOCTYPE html><html><head><title>Forest | Manulife Investment Management</title>
    ${og === null ? '' : `<meta property="og:image" content="${og}">`}</head><body><main><p>Body</p></main></body></html>`).window;
  let cells = null;
  globalThis.WebImporter = {
    Blocks: {
      getMetadataBlock: (doc, c) => { cells = c; return doc.createElement('table'); },
    },
  };
  const payload = { document, template: { name: 'plain' }, ctx: { livePath: '/institutional/tw/en/x' } };
  metadata('beforeTransform', document.body, payload);
  metadata('afterTransform', document.body, payload);
  return { meta: payload.ctx.metadata, cells };
}

test('metadata: the malformed concatenated og:image does not become an Image cell', () => {
  [RAW, NORMALIZED].forEach((og) => {
    const { meta, cells } = runMetadata(og);
    assert.equal(meta.Image, undefined, og);
    assert.equal(cells.Image, undefined, og);
    assert.equal(cells.Title, 'Forest');
  });
});

test('metadata: valid og:image values still become the Image cell unchanged', () => {
  const cases = [
    [SOURCE, SOURCE],
    ['/content/dam/mim-institutional/global/a.jpg', 'https://www.manulifeim.com/content/dam/mim-institutional/global/a.jpg'],
    [`${SOURCE}?src=https://cdn.example.com/b.jpg`, `${SOURCE}?src=https://cdn.example.com/b.jpg`],
  ];
  cases.forEach(([og, src]) => {
    const { meta, cells } = runMetadata(og);
    assert.equal(meta.Image, og);
    assert.equal(cells.Image.getAttribute('src'), src);
  });
  assert.equal(runMetadata(null).cells.Image, undefined);
});
