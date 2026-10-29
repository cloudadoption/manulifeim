/* eslint-disable max-len */
/*
 * Offline regression tests for glued-host image URLs in the fetch queues (Global forest products:
 * og:image "https://www.manulifeim.comhttps://author-tmp...", stored by the importer as
 * "https://www.manulifeim.comhttps//author-tmp..."; check-images holds the page, rescan-images
 * adopts the URL into _images.json as pending). Runs the real snapshot/queue.mjs,
 * snapshot/images.mjs queue and check-images.mjs in a fresh temp working directory.
 * No network: the CLIs only read and write local files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(here, '..', 'snapshot', 'queue.mjs');
const IMAGES_CLI = join(here, '..', 'snapshot', 'images.mjs');
const CHECK = join(here, '..', 'check-images.mjs');
const ORIGIN = 'https://www.manulifeim.com';
const ROOT = '/institutional/tw/en';
const DAM = `${ORIGIN}/content/dam/mim-institutional/global/viewpoints`;

const FOREST = `${ROOT}/viewpoints/private-markets/forest`;
const ASSET = 'author-tmp.jhinvestments.com/assetdetails.html/content/dam/mim-institutional/global/viewpoints/tl-1/TL-1_hero_1200x628.jpg';
const RAW = `https://www.manulifeim.comhttps://${ASSET}`;
const NORMALIZED = `https://www.manulifeim.comhttps//${ASSET}`;
const FIRST = `${DAM}/first/first-chart.png`; // on the --images-first page
const VALID = `${DAM}/a/a-hero.jpg`;
const NESTED = `${DAM}/b/b-chart.png?ref=https://www.manulifeim.com/content/dam/x.png`;
const DONE = `${DAM}/c/c.jpg`;
const GONE = `${DAM}/d/d.svg`;
const DENIED = `${DAM}/e/e.jpg`;
const IMAGES = {
  // glued records first, so an unfiltered queue would take them
  [NORMALIZED]: { pages: [FOREST] },
  [RAW]: { pages: [FOREST] },
  [VALID]: { pages: [`${ROOT}/viewpoints/a`] },
  [NESTED]: { pages: [`${ROOT}/viewpoints/b`] },
  [DONE]: { file: '/media-da/c-1.jpg', type: 'image/jpeg', pages: [`${ROOT}/viewpoints/c`] },
  [GONE]: { status: 404, pages: [`${ROOT}/viewpoints/d`] },
  [DENIED]: { status: 403, pages: [`${ROOT}/viewpoints/e`] },
  [FIRST]: { pages: [`${ROOT}/viewpoints/first`] },
};
const CSV = [
  'template_group,live_path,eds_path,live_status,redirect_to,route_class,robots,lastmod,title',
  `article,${ROOT}/viewpoints/done,${ROOT}/viewpoints/done,200,,,,2026-10-01,`,
  `article,${ROOT}/viewpoints/p1,${ROOT}/viewpoints/p1,200,,,,2026-10-01,`,
  `hub,${ROOT}/hub-1,${ROOT}/hub-1,unchecked,,,,2026-10-01,`,
  `article,${ROOT}/viewpoints/p2,${ROOT}/viewpoints/p2,200,,,,2026-10-01,`,
  `article,${ROOT}/viewpoints/gone,${ROOT}/viewpoints/gone,404,,,,2026-10-01,`,
  `article,${ROOT}/viewpoints/p3,${ROOT}/viewpoints/p3,200,,,,2026-10-01,`,
  '',
].join('\n');
const STATE = { [`${ROOT}/viewpoints/done`]: { status: 200, group: 'article', file: 'x.html' } };

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'image-queue-test-'));
  const snap = join(dir, 'tools/importer/snapshots');
  mkdirSync(snap, { recursive: true });
  mkdirSync(join(dir, 'tools/migration-scope'), { recursive: true });
  writeFileSync(join(dir, 'tools/migration-scope/pages.csv'), CSV);
  writeFileSync(join(snap, '_state.json'), JSON.stringify(STATE));
  const imagesJson = JSON.stringify(IMAGES, null, 1);
  writeFileSync(join(snap, '_images.json'), imagesJson);
  const run = (script, args) => {
    const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  return {
    dir,
    imagesJson,
    queue: (...args) => { run(QUEUE, args); return JSON.parse(readFileSync(join(snap, '_queue.json'), 'utf-8')); },
    imgQueue: (...args) => { run(IMAGES_CLI, ['queue', ...args]); return JSON.parse(readFileSync(join(snap, '_img-queue.json'), 'utf-8')).urls; },
    imagesNow: () => readFileSync(join(snap, '_images.json'), 'utf-8'),
  };
}

test('queue.mjs: glued-host image URLs (raw and normalized) are not queued; pages, priority and size unchanged', () => {
  const ws = workspace();
  const q = ws.queue('--size', '3', '--budget', '520', '--gap', '30-45', '--images', '10', '--images-first', `${ROOT}/viewpoints/first`);
  assert.deepEqual(q.urls, [`${ORIGIN}${ROOT}/hub-1`, `${ORIGIN}${ROOT}/viewpoints/p1`, `${ORIGIN}${ROOT}/viewpoints/p2`]);
  assert.equal(q.remaining, 1);
  assert.equal(q.budgetMs, 520000);
  assert.deepEqual([q.minGapMs, q.maxGapMs], [30000, 45000]);
  assert.deepEqual(q.images, [FIRST, VALID, NESTED]);
  assert.deepEqual(ws.queue('--size', '3', '--images', '2', '--images-first', `${ROOT}/viewpoints/first`).images, [FIRST, VALID]);
  assert.equal(ws.imagesNow(), ws.imagesJson, '_images.json keeps the malformed pending records unchanged');
});

test('images.mjs queue: glued-host image URLs are not queued; valid pending order and --size unchanged', () => {
  const ws = workspace();
  assert.deepEqual(ws.imgQueue('--size', '10'), [VALID, NESTED, FIRST]);
  assert.deepEqual(ws.imgQueue('--size', '1'), [VALID]);
  assert.equal(ws.imagesNow(), ws.imagesJson, '_images.json keeps the malformed pending records unchanged');
  const rec = JSON.parse(ws.imagesNow());
  [RAW, NORMALIZED].forEach((u) => assert.deepEqual(rec[u], { pages: [FOREST] }, 'still pending: no file, no status'));
});

test('the page with the glued-host image stays held by check-images after queueing', () => {
  const ws = workspace();
  const f = join(ws.dir, 'content', `${FOREST}.plain.html`);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, `<div><p>Body</p></div><div class="metadata"><div><div>Image</div><div><picture><img src="${NORMALIZED}" alt=""></picture></div></div></div>`);
  ws.queue('--size', '3', '--images', '10');
  ws.imgQueue('--size', '10');
  const r = spawnSync(process.execPath, [CHECK, '--quiet'], { cwd: ws.dir, encoding: 'utf-8' });
  assert.equal(r.status, 1);
  const { hits } = JSON.parse(readFileSync(join(ws.dir, 'tools/importer/reports/live-images.json'), 'utf-8'));
  assert.deepEqual(hits, { [FOREST]: [NORMALIZED] });
});
