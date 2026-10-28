/* eslint-disable no-console, max-len */
/*
 * Offline regression tests for the authored-edit guard in tools/importer/da-upload.mjs.
 * Each test runs the real uploader in a fresh temp working directory with a fake curl
 * (helpers/fake-curl.mjs, via DA_UPLOAD_CURL): no network, no credentials.
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
const UPLOADER = join(here, '..', 'da-upload.mjs');
const FAKE = join(here, 'helpers', 'fake-curl.mjs');
const SRC = 'https://admin.da.live/source/cloudadoption/manulifeim';
const doc = (p) => `${SRC}${p}.html`;
const daBody = (main) => `<body><header></header><main>${main}</main><footer></footer></body>`;
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function workspace(state = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'da-upload-test-'));
  mkdirSync(join(dir, 'tools/importer/reports'), { recursive: true });
  const curl = join(dir, 'curl');
  writeFileSync(curl, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`, { mode: 0o755 });
  const ws = {
    dir,
    state: join(dir, 'fake-state.json'),
    log: join(dir, 'fake-log.jsonl'),
    page(p, html) {
      const f = join(dir, 'content', `${p}.plain.html`);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, html);
    },
    media(name) {
      mkdirSync(join(dir, 'content/media-da'), { recursive: true });
      writeFileSync(join(dir, 'content/media-da', name), PNG);
    },
    records(r) { writeFileSync(join(dir, 'tools/importer/reports/da-upload.json'), JSON.stringify(r)); },
    pages() {
      const f = join(dir, 'tools/importer/reports/da-upload.json');
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : {};
    },
    conflicts() {
      const f = join(dir, 'tools/importer/reports/da-conflicts.json');
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : null;
    },
    remote(p) { return JSON.parse(readFileSync(this.state, 'utf-8')).docs[doc(p)]; },
    setRemote(p, d) {
      const s = JSON.parse(readFileSync(this.state, 'utf-8'));
      s.docs[doc(p)] = { status: 200, ...d };
      writeFileSync(this.state, JSON.stringify(s));
    },
    patchState(fn) {
      const s = JSON.parse(readFileSync(this.state, 'utf-8'));
      fn(s);
      writeFileSync(this.state, JSON.stringify(s));
    },
    run(...args) {
      writeFileSync(this.log, '');
      const r = spawnSync(process.execPath, [UPLOADER, ...args], {
        cwd: dir,
        encoding: 'utf-8',
        env: {
          ...process.env, DA_UPLOAD_CURL: curl, FAKE_DA_STATE: this.state, FAKE_DA_LOG: this.log,
        },
      });
      const calls = readFileSync(this.log, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      return { ...r, calls, docWrites: (p) => calls.filter((c) => c.method === 'POST' && c.url === doc(p)).length };
    },
  };
  writeFileSync(ws.state, JSON.stringify({ docs: {}, ...state }));
  return ws;
}

/** A page uploaded once by the migration (new in DA), so it has a real last-successful upload. */
function uploadedOnce(ws, p) {
  ws.page(p, '<div><p>v1</p></div>');
  const r = ws.run('--force', p);
  assert.equal(r.docWrites(p), 1, `first upload of ${p}: ${r.stdout}${r.stderr}`);
  ws.page(p, '<div><p>v2 from the importer</p></div>');
}

test('new page (DA 404): uploaded, previewed, and a later re-import with DA unchanged uploads again', () => {
  const ws = workspace();
  uploadedOnce(ws, '/t/new');
  assert.equal(ws.pages()['/t/new'].upload, 201);
  assert.equal(ws.pages()['/t/new'].preview, 200);
  const r = ws.run('--force', '/t/new');
  assert.equal(r.docWrites('/t/new'), 1, r.stdout);
  assert.match(ws.remote('/t/new').body, /v2 from the importer/);
});

test('an authored edit within the first minute after our upload is kept', () => {
  const ws = workspace();
  uploadedOnce(ws, '/t/quick');
  const at = Date.parse(ws.pages()['/t/quick'].at);
  ws.setRemote('/t/quick', { body: daBody('<div><p>Abbasi fixed a typo</p></div>'), lastModified: at + 30 * 1000 });
  const r = ws.run('--force', '/t/quick');
  assert.equal(r.docWrites('/t/quick'), 0, r.stdout);
  assert.match(ws.remote('/t/quick').body, /Abbasi fixed a typo/);
  assert.ok(ws.conflicts()?.['/t/quick'], 'conflict logged');
});

test('a failed upload record is not a baseline: authored version from before the failure is kept', () => {
  const ws = workspace();
  // reproduced case: our last attempt failed (500 at 18:05); DA holds an authored version from 18:02
  ws.records({ '/t/failed': { upload: 500, at: '2026-10-28T18:05:00.000Z', error: 'server error' } });
  ws.setRemote('/t/failed', { body: daBody('<div><p>authored at 18:02</p></div>'), lastModified: Date.parse('2026-10-28T18:02:00Z') });
  ws.page('/t/failed', '<div><p>importer copy</p></div>');
  const r = ws.run('--force', '/t/failed');
  assert.equal(r.docWrites('/t/failed'), 0, r.stdout);
  assert.match(ws.remote('/t/failed').body, /authored at 18:02/);
  assert.ok(ws.conflicts()?.['/t/failed'], 'conflict logged');
});

test('a failed upload keeps the last successful baseline: an edit made before the failed attempt is kept', () => {
  const ws = workspace();
  uploadedOnce(ws, '/t/keep');
  ws.patchState((s) => { s.postStatus = { [doc('/t/keep')]: 500 }; });
  ws.run('--force', '/t/keep');
  assert.equal(ws.pages()['/t/keep'].upload, 500);
  const failedAt = Date.parse(ws.pages()['/t/keep'].at);
  ws.patchState((s) => { s.postStatus = {}; });
  ws.setRemote('/t/keep', { body: daBody('<div><p>authored before the failed attempt</p></div>'), lastModified: failedAt - 30 * 1000 });
  const r = ws.run('--force', '/t/keep');
  assert.equal(r.docWrites('/t/keep'), 0, r.stdout);
  assert.match(ws.remote('/t/keep').body, /authored before the failed attempt/);
});

test('a page we uploaded that is now gone from DA is not recreated', () => {
  const ws = workspace();
  uploadedOnce(ws, '/t/deleted');
  ws.patchState((s) => { delete s.docs[doc('/t/deleted')]; });
  const r = ws.run('--force', '/t/deleted');
  assert.equal(r.docWrites('/t/deleted'), 0, r.stdout);
  assert.ok(ws.conflicts()?.['/t/deleted']);
});

test('an existing DA page the migration never uploaded is held', () => {
  const ws = workspace();
  ws.setRemote('/t/theirs', { body: daBody('<div><p>made in DA</p></div>'), lastModified: Date.now() - 3600 * 1000 });
  ws.page('/t/theirs', '<div><p>importer copy</p></div>');
  const r = ws.run('--force', '/t/theirs');
  assert.equal(r.docWrites('/t/theirs'), 0, r.stdout);
  assert.ok(ws.conflicts()?.['/t/theirs']);
});

test('an existing page with only a legacy timestamp record (no fingerprint) is held', () => {
  const ws = workspace();
  const at = '2026-10-27T09:47:37.033Z';
  ws.records({ '/t/legacy': { upload: 200, preview: 200, matches: true, at } });
  ws.setRemote('/t/legacy', { body: daBody('<div><p>maybe edited</p></div>'), lastModified: Date.parse(at) - 1000 });
  ws.page('/t/legacy', '<div><p>importer copy</p></div>');
  const r = ws.run('--force', '/t/legacy');
  assert.equal(r.docWrites('/t/legacy'), 0, r.stdout);
  assert.ok(ws.conflicts()?.['/t/legacy']);
});

test('DA auth error is held and logged; nothing is written', () => {
  const ws = workspace();
  ws.setRemote('/t/auth', { status: 401, body: '' });
  ws.page('/t/auth', '<div><p>importer copy</p></div>');
  const r = ws.run('--force', '/t/auth');
  assert.equal(r.docWrites('/t/auth'), 0, r.stdout);
  assert.ok(ws.conflicts()?.['/t/auth'], 'conflict logged');
});

test('a network error on one page is held; the run continues with the next page', () => {
  const ws = workspace({ network: [doc('/t/net')] });
  ws.page('/t/net', '<div><p>a</p></div>');
  ws.page('/t/after', '<div><p>b</p></div>');
  const r = ws.run('--force', '/t/net', '/t/after');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.docWrites('/t/net'), 0);
  assert.equal(r.docWrites('/t/after'), 1, r.stdout);
  assert.ok(ws.conflicts()?.['/t/net']);
});

test('conflicts are persisted when every page in the run is skipped', () => {
  const ws = workspace();
  ['/t/a', '/t/b'].forEach((p) => {
    ws.setRemote(p, { body: daBody('<div><p>authored</p></div>'), lastModified: Date.now() });
    ws.page(p, '<div><p>importer copy</p></div>');
  });
  ws.run('--force', '/t/a', '/t/b');
  const c = ws.conflicts();
  assert.ok(c, 'da-conflicts.json written');
  assert.deepEqual(Object.keys(c).sort(), ['/t/a', '/t/b']);
});

test('--force does not bypass the guard', () => {
  const ws = workspace();
  uploadedOnce(ws, '/t/forced');
  ws.setRemote('/t/forced', { body: daBody('<div><p>authored</p></div>'), lastModified: Date.now() + 5 * 60 * 1000 });
  const r = ws.run('--force', '/t/forced');
  assert.equal(r.docWrites('/t/forced'), 0, r.stdout);
});

test('DA is rechecked right before the document write (after media uploads)', () => {
  const ws = workspace();
  ws.media('pic.png');
  ws.page('/t/race', '<div><p><img src="/media-da/pic.png" alt=""></p></div>');
  // the page does not exist at the first check; an author creates it while the media uploads
  ws.patchState((s) => { s.afterMediaPost = { [doc('/t/race')]: { body: daBody('<div><p>created by an author</p></div>'), lastModified: Date.now() } }; });
  const r = ws.run('--force', '/t/race');
  assert.equal(r.docWrites('/t/race'), 0, r.stdout);
  assert.match(ws.remote('/t/race').body, /created by an author/);
  assert.ok(ws.conflicts()?.['/t/race']);
});

/* ---- regressions found in review of a347bc6 ---- */

test('legacy successful-upload record without a baseline + DA 404: not recreated (--force), conflict persisted', () => {
  const ws = workspace();
  ws.records({ '/t/legacy404': { upload: 200, preview: 200, matches: true, at: '2026-10-27T09:47:37.033Z' } });
  ws.page('/t/legacy404', '<div><p>importer copy</p></div>');
  const r = ws.run('--force', '/t/legacy404');
  assert.equal(r.docWrites('/t/legacy404'), 0, r.stdout);
  assert.equal(ws.remote('/t/legacy404'), undefined, 'still absent in DA');
  assert.ok(ws.conflicts()?.['/t/legacy404'], 'conflict persisted');
});

test('failed-upload record (ambiguous ownership) + DA 404: not recreated', () => {
  const ws = workspace();
  ws.records({ '/t/failed404': { upload: 500, at: '2026-10-28T18:05:00.000Z', error: 'server error' } });
  ws.page('/t/failed404', '<div><p>importer copy</p></div>');
  const r = ws.run('--force', '/t/failed404');
  assert.equal(r.docWrites('/t/failed404'), 0, r.stdout);
  assert.ok(ws.conflicts()?.['/t/failed404']);
});

function editAfterUpload(p, ours, authored) {
  const ws = workspace();
  ws.page(p, ours);
  assert.equal(ws.run('--force', p).docWrites(p), 1, 'first upload');
  ws.setRemote(p, { body: daBody(authored), lastModified: Date.now(), etag: '"author"' });
  ws.page(p, '<div><p>re-import</p></div>');
  return ws;
}

test('a whitespace-only edit inside <pre> is an authored change', () => {
  const ws = editAfterUpload('/t/pre', '<div><pre>alpha beta</pre></div>', '<div><pre>alpha  beta</pre></div>');
  const r = ws.run('--force', '/t/pre');
  assert.equal(r.docWrites('/t/pre'), 0, r.stdout);
  assert.match(ws.remote('/t/pre').body, /alpha {2}beta/);
  assert.ok(ws.conflicts()?.['/t/pre']);
});

test('a space inserted between inline elements is an authored change', () => {
  const ws = editAfterUpload('/t/inline', '<div><p><em>a</em><strong>b</strong></p></div>', '<div><p><em>a</em> <strong>b</strong></p></div>');
  const r = ws.run('--force', '/t/inline');
  assert.equal(r.docWrites('/t/inline'), 0, r.stdout);
  assert.match(ws.remote('/t/inline').body, /<\/em> <strong>/);
  assert.ok(ws.conflicts()?.['/t/inline']);
});

test('a read-back with other bytes than we sent (whitespace only) does not become our baseline', () => {
  const ws = workspace({ storeTransform: { [doc('/t/readback')]: ['</p>', '</p> '] } });
  ws.page('/t/readback', '<div><p>ours</p></div>');
  const first = ws.run('--force', '/t/readback');
  assert.equal(first.docWrites('/t/readback'), 1);
  assert.equal(ws.pages()['/t/readback'].baseline, undefined, 'no baseline from an uncertain read-back');
  ws.patchState((s) => { s.storeTransform = {}; });
  ws.page('/t/readback', '<div><p>re-import</p></div>');
  const r = ws.run('--force', '/t/readback');
  assert.equal(r.docWrites('/t/readback'), 0, r.stdout);
  assert.ok(ws.conflicts()?.['/t/readback']);
});

test('a read-back with changed content does not become our baseline', () => {
  const ws = workspace({ storeTransform: { [doc('/t/changed')]: ['ours', 'author text'] } });
  ws.page('/t/changed', '<div><p>ours</p></div>');
  ws.run('--force', '/t/changed');
  assert.equal(ws.pages()['/t/changed'].baseline, undefined);
  ws.patchState((s) => { s.storeTransform = {}; });
  ws.page('/t/changed', '<div><p>re-import</p></div>');
  const r = ws.run('--force', '/t/changed');
  assert.equal(r.docWrites('/t/changed'), 0, r.stdout);
  assert.match(ws.remote('/t/changed').body, /author text/);
});

test('an author creates the page after our final check, before the POST: create-only write is rejected and kept', () => {
  const ws = workspace({ atPost: { [doc('/t/created')]: { body: daBody('<div><p>created by an author</p></div>') } } });
  ws.page('/t/created', '<div><p>importer copy</p></div>');
  const r = ws.run('--force', '/t/created');
  const posts = r.calls.filter((c) => c.method === 'POST' && c.url === doc('/t/created'));
  assert.equal(posts.length, 1, 'one attempt, no unconditional retry');
  assert.equal(posts[0].headers['if-none-match'], '*', 'create-only precondition');
  assert.match(ws.remote('/t/created').body, /created by an author/);
  assert.notEqual(ws.pages()['/t/created']?.upload, 201, 'not recorded as a success');
  assert.equal(ws.pages()['/t/created']?.baseline, undefined);
  assert.ok(ws.conflicts()?.['/t/created'], 'conflict persisted');
});

test('an author saves an existing page as our POST arrives: If-Match write is rejected and kept', () => {
  const ws = workspace();
  ws.page('/t/update', '<div><p>v1</p></div>');
  ws.run('--force', '/t/update');
  const { baseline } = ws.pages()['/t/update'];
  ws.page('/t/update', '<div><p>v2</p></div>');
  ws.patchState((s) => { s.atPost = { [doc('/t/update')]: { body: daBody('<div><p>author save</p></div>') } }; });
  const r = ws.run('--force', '/t/update');
  const posts = r.calls.filter((c) => c.method === 'POST' && c.url === doc('/t/update'));
  assert.equal(posts.length, 1, 'one attempt, no unconditional retry');
  assert.ok(posts[0].headers['if-match'] && posts[0].headers['if-match'] !== '*', 'specific If-Match');
  assert.match(ws.remote('/t/update').body, /author save/);
  assert.deepEqual(ws.pages()['/t/update'].baseline, baseline, 'baseline unchanged');
  assert.ok(ws.conflicts()?.['/t/update']);
});

test('an existing page without a usable precondition (no ETag from our write) is held', () => {
  const ws = workspace({ noEtag: true });
  ws.page('/t/noetag', '<div><p>v1</p></div>');
  ws.run('--force', '/t/noetag');
  ws.page('/t/noetag', '<div><p>v2</p></div>');
  const r = ws.run('--force', '/t/noetag');
  assert.equal(r.docWrites('/t/noetag'), 0, r.stdout);
  assert.ok(ws.conflicts()?.['/t/noetag']);
});

test('/migration-status pages are never touched', () => {
  const ws = workspace();
  ws.page('/migration-status/author-guide', '<div><p>guide</p></div>');
  const r = ws.run('--force', '/migration-status/author-guide');
  assert.equal(r.calls.length, 0, JSON.stringify(r.calls));
});
