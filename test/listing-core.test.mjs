/* Unit tests for the DOM-free listing logic (node --test, no browser, no fixtures outside Git). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntry, resolveMedia, sortItems } from '../scripts/listing-core.js';

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

/* items as normalizeEntry gives them: ts = publication date (s), lastModified = preview time (s) */
const item = (title, ts, lastModified) => ({ title, ts, lastModified, sortTs: ts || lastModified });
const titles = (list) => list.map((i) => i.title);

test('newest: dated items newest first, undated after them by title', () => {
  const list = [
    item('Mainland China: charting the path to reopening', 0, 1793330000),
    item('Understanding Asset-Based Finance', 1792713600, 1793000000),
    item('Canadian commercial real estate outlook', 0, 1793340000),
    item('Q&A with PERE Credit', 1792368000, 1793100000),
  ];
  assert.deepEqual(titles(sortItems(list, 'newest')), [
    'Understanding Asset-Based Finance', 'Q&A with PERE Credit',
    'Canadian commercial real estate outlook', 'Mainland China: charting the path to reopening',
  ]);
});

test('a re-preview (newer lastModified) does not move an undated item', () => {
  const before = [item('B undated', 0, 100), item('A undated', 0, 200), item('Dated', 50, 10)];
  const after = [item('B undated', 0, 9999), item('A undated', 0, 200), item('Dated', 50, 10)];
  assert.deepEqual(titles(sortItems(before, 'newest')), ['Dated', 'A undated', 'B undated']);
  assert.deepEqual(titles(sortItems(after, 'newest')), ['Dated', 'A undated', 'B undated']);
});

test('an all-undated list (case studies, resources) sorts by title for newest and oldest', () => {
  const list = [item('Retaining an engaged healthcare workforce', 0, 3), item('Aligning compensation with performance', 0, 1), item('managing water risk', 0, 2)];
  const expected = ['Aligning compensation with performance', 'managing water risk', 'Retaining an engaged healthcare workforce'];
  assert.deepEqual(titles(sortItems(list, 'newest')), expected);
  assert.deepEqual(titles(sortItems(list, 'oldest')), expected);
});

test('oldest: dated items oldest first, undated after them; same date by title; relevance ties by date', () => {
  const list = [item('Undated', 0, 5), item('Late', 300, 1), item('Early b', 100, 1), item('Early a', 100, 1)];
  assert.deepEqual(titles(sortItems(list, 'oldest')), ['Early a', 'Early b', 'Late', 'Undated']);
  const scored = [{ ...item('Undated', 0, 900), score: 1 }, { ...item('Dated', 100, 1), score: 1 }, { ...item('Best', 0, 1), score: 5 }];
  assert.deepEqual(titles(sortItems(scored, 'relevance')), ['Best', 'Dated', 'Undated']);
});
