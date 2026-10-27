/* Unit tests for the DOM-free listing logic (node --test, no browser, no fixtures outside Git). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntry, resolveMedia } from '../scripts/listing-core.js';

const PAGE = '/institutional/tw/en/viewpoints/alternative-credit/some-article';

test('resolveMedia makes rendered media src site-relative and drops the query', () => {
  assert.equal(
    resolveMedia('./media_123.jpg?width=750&format=jpg', PAGE),
    '/institutional/tw/en/viewpoints/alternative-credit/media_123.jpg',
  );
  assert.equal(resolveMedia('', PAGE), '');
  assert.equal(resolveMedia('https://example.com/a.png?x=1', PAGE), 'https://example.com/a.png');
});

test('normalizeEntry replaces DA author photos with the indexed author box photos', () => {
  const row = {
    path: PAGE,
    title: 'Some article | Manulife Investment Management',
    authorDetails: JSON.stringify([
      { name: 'A Person', photo: 'https://content.da.live/cloudadoption/manulifeim/media-da/a.jpg' },
      { name: 'B Person', photo: '/institutional/tw/en/media_b.jpg' },
    ]),
    authorPhotos: JSON.stringify(['./media_a.jpg?width=750', './media_x.jpg']),
  };
  const item = normalizeEntry(row);
  assert.equal(item.title, 'Some article');
  assert.equal(item.authors[0].image, '/institutional/tw/en/viewpoints/alternative-credit/media_a.jpg');
  // photos that are already media-bus URLs stay as they are
  assert.equal(item.authors[1].image, '/institutional/tw/en/media_b.jpg');
});

test('normalizeEntry drops a DA author photo when the index has no rendered photo', () => {
  const item = normalizeEntry({
    path: PAGE,
    authorDetails: JSON.stringify([{ name: 'A', photo: 'https://content.da.live/x/media-da/a.jpg' }]),
  });
  assert.equal(item.authors[0].image, '');
});
