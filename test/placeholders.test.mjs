/* eslint-disable import/extensions */
/* global globalThis */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const {
  fetchPlaceholders, placeholder, resetPlaceholders, PLACEHOLDERS_SHEET,
} = await import('../scripts/placeholders.js');

const respond = (body, ok = true) => async () => ({ ok, json: async () => body });

test('placeholder: sheet text, English default, {name} values', () => {
  assert.equal(placeholder({ readMore: 'Mehr' }, 'readMore', 'Read more'), 'Mehr');
  assert.equal(placeholder({}, 'readMore', 'Read more'), 'Read more');
  assert.equal(placeholder(undefined, 'x', 'Slide {n} of {total}', { n: 2, total: 5 }), 'Slide 2 of 5');
  assert.equal(placeholder({}, 'x', 'Read more: {title}'), 'Read more: {title}', 'unknown names stay');
});

test('fetchPlaceholders: one request, Key / Text rows, blanks skipped', async () => {
  resetPlaceholders();
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.equal(url, PLACEHOLDERS_SHEET);
    return respond({ data: [{ Key: ' readMore ', Text: 'Read more ' }, { Key: 'empty', Text: '' }, { Key: '', Text: 'x' }] })();
  };
  const [a, b] = await Promise.all([fetchPlaceholders(), fetchPlaceholders()]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.deepEqual(a, { readMore: 'Read more' });
});

test('fetchPlaceholders: missing sheet or network error gives {}', async () => {
  resetPlaceholders();
  globalThis.fetch = respond({}, false);
  assert.deepEqual(await fetchPlaceholders(), {});
  resetPlaceholders();
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await fetchPlaceholders(), {});
});

test('sheet source: every key has text, keys are unique', () => {
  const sheet = JSON.parse(readFileSync(new URL('../tools/importer/placeholders.json', import.meta.url), 'utf-8'));
  const keys = sheet.data.map((r) => r.Key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(sheet.data.every((r) => r.Key && r.Text));
});
