/* scripts/authoring.js: Canvas gate and per-page listener signal (node --test, no browser). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeDom(search) {
  const attrs = new Map();
  globalThis.window = { location: { search } };
  globalThis.document = {
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      hasAttribute: (k) => attrs.has(k),
    },
  };
}

// a fresh module instance per case (the gate runs once at import time)
const load = (tag) => import(`../scripts/authoring.js?${tag}`);

test('any quick-edit value turns authoring on', async () => {
  fakeDom('?quick-edit=main&controller=parent');
  const { default: isAuthoring } = await load('a');
  assert.equal(isAuthoring(), true);
});

test('without quick-edit the page is not in authoring mode', async () => {
  fakeDom('?foo=bar');
  const { default: isAuthoring } = await load('b');
  assert.equal(isAuthoring(), false);
});

test('renewPageSignal aborts listeners of the previous page decoration', async () => {
  fakeDom('');
  const { pageSignal, renewPageSignal } = await load('c');
  const first = pageSignal();
  let calls = 0;
  const target = new EventTarget();
  target.addEventListener('ping', () => { calls += 1; }, { signal: first });
  target.dispatchEvent(new Event('ping'));
  renewPageSignal();
  target.dispatchEvent(new Event('ping'));
  assert.equal(calls, 1);
  assert.equal(first.aborted, true);
  assert.equal(pageSignal().aborted, false);
});
