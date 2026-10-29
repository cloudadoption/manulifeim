/* eslint-disable max-len */
/*
 * Offline regression tests for tools/importer/localize-images.mjs (dead-image classification).
 * Each test runs the real script, then check-images.mjs, in a fresh temp working directory with
 * its own content/ and snapshots/_images.json: no network, no live fetches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync,
} from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALIZE = join(here, '..', 'localize-images.mjs');
const CHECK = join(here, '..', 'check-images.mjs');
const LIVE = 'https://www.manulifeim.com/content/dam/mim-institutional/global/viewpoints';
const MEDIA = 'https://content.da.live/cloudadoption/manulifeim/media-da';
// a historical 403 (like the PERE lead image: parentheses and commas in the path)
const IMG403 = `${LIVE}/pm-1-viewpoint--q-a-(first-author,-second-author)/PM-1-Viewpoint-QA_1200x628.jpg`;
const IMG404 = `${LIVE}/pm-2/PM-2-gone.jpg`;
const IMG410 = `${LIVE}/pm-3/PM-3-removed.png`;
const IMGOK = `${LIVE}/pm-4/PM-4-hero.jpg`;
const IMGOK2 = `${LIVE}/pm-5/PM-5-chart,(v2).png`;
const IMAGES = {
  [IMG403]: { status: 403 },
  [IMG404]: { status: 404 },
  [IMG410]: { status: 410 },
  [IMGOK]: { file: `${MEDIA}/pm-4-hero-aaaa1111.jpg` },
  [IMGOK2]: { file: `${MEDIA}/pm-5-chart-bbbb2222.png` },
};
const PAGE = '/institutional/tw/en/viewpoints/private-markets/sample';
const pic = (src) => `<picture><img src="${src}" alt=""></picture>`;

function workspace(pages) {
  const dir = mkdtempSync(join(tmpdir(), 'localize-images-test-'));
  mkdirSync(join(dir, 'tools/importer/snapshots'), { recursive: true });
  mkdirSync(join(dir, 'tools/importer/reports'), { recursive: true });
  writeFileSync(join(dir, 'tools/importer/snapshots/_images.json'), JSON.stringify(IMAGES));
  Object.entries(pages).forEach(([p, html]) => {
    const f = join(dir, 'content', `${p}.plain.html`);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, html);
  });
  const run = (script) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf-8' });
  return {
    localize() {
      const r = run(LOCALIZE);
      assert.equal(r.status, 0, r.stderr);
      return r;
    },
    check: () => run(CHECK),
    page: (p) => readFileSync(join(dir, 'content', `${p}.plain.html`), 'utf-8'),
    dead() {
      const f = join(dir, 'tools/importer/reports/dead-images.txt');
      return existsSync(f) ? readFileSync(f, 'utf-8').split('\n').filter(Boolean) : [];
    },
    liveHits: () => JSON.parse(readFileSync(join(dir, 'tools/importer/reports/live-images.json'), 'utf-8')).hits,
  };
}

test('a 403 image keeps its picture markup, is not logged dead and stays held by check-images', () => {
  const html = `<div><h1>Sample</h1><p>${pic(IMG403)}</p><p>Body text.</p></div>`;
  const ws = workspace({ [PAGE]: html });
  ws.localize();
  assert.equal(ws.page(PAGE), html, 'page with a 403 image must not change');
  assert.deepEqual(ws.dead(), [], 'a 403 is not proof the source asset is gone');
  const r = ws.check();
  assert.equal(r.status, 1, 'check-images must list the page');
  assert.deepEqual(ws.liveHits(), { [PAGE]: [IMG403] });
});

test('404 and 410 images are still removed with their picture and logged in dead-images.txt', () => {
  const html = `<div><p>${pic(IMG404)}</p><p>Text</p><p>${pic(IMG410)}</p></div>`;
  const ws = workspace({ [PAGE]: html });
  ws.localize();
  assert.equal(ws.page(PAGE), '<div><p></p><p>Text</p><p></p></div>');
  assert.deepEqual(ws.dead(), [`${PAGE} ${IMG404}`, `${PAGE} ${IMG410}`]);
  assert.equal(ws.check().status, 0);
});

test('downloaded images are localized in src and srcset (commas and parentheses in the URL)', () => {
  const html = `<div><picture><source srcset="${IMGOK2}, ${IMGOK} 2x"><img src="${IMGOK}" alt=""></picture></div>`;
  const ws = workspace({ [PAGE]: html });
  ws.localize();
  assert.equal(
    ws.page(PAGE),
    `<div><picture><source srcset="${IMAGES[IMGOK2].file}, ${IMAGES[IMGOK].file} 2x"><img src="${IMAGES[IMGOK].file}" alt=""></picture></div>`,
  );
  assert.deepEqual(ws.dead(), []);
  assert.equal(ws.check().status, 0);
});

test('mixed page: 404 removed, downloaded image localized, 403 kept so the page stays held', () => {
  const html = `<div><p>${pic(IMG403)}</p><p>${pic(IMG404)}</p><p>${pic(IMGOK)}</p></div>`;
  const ws = workspace({ [PAGE]: html });
  ws.localize();
  assert.equal(ws.page(PAGE), `<div><p>${pic(IMG403)}</p><p></p><p>${pic(IMAGES[IMGOK].file)}</p></div>`);
  assert.deepEqual(ws.dead(), [`${PAGE} ${IMG404}`]);
  assert.equal(ws.check().status, 1);
  assert.deepEqual(ws.liveHits(), { [PAGE]: [IMG403] });
});
