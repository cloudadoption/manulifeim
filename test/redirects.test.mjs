/* tools/migration-scope/redirects.mjs (node --test, no network): the redirects sheet rows
   (Source, Destination) built from pages.csv. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { buildRedirects, parseCsv } from '../tools/migration-scope/redirects.mjs';

const CSV = readFileSync(fileURLToPath(new URL('../tools/migration-scope/pages.csv', import.meta.url)), 'utf8');

const csv = (lines) => ['template_group,live_path,eds_path,live_status,redirect_to,route_class,robots,lastmod,title', ...lines].join('\n');

function assertSheet(rows) {
  const sources = rows.map((r) => r.Source);
  assert.equal(new Set(sources).size, sources.length, 'no duplicate Source');
  rows.forEach((r) => assert.notEqual(r.Source, r.Destination, `${r.Source} points to itself`));
  const set = new Set(sources);
  rows.forEach((r) => assert.ok(!set.has(r.Destination), `chain: ${r.Destination} is also a Source`));
  rows.forEach((r) => assert.deepEqual(Object.keys(r), ['Source', 'Destination']));
}

test('parseCsv: quoted fields with commas, quotes and line breaks', () => {
  const [head, row] = parseCsv('a,b,c\n"x, y","say ""hi""","two\nlines"\n');
  assert.deepEqual(head, ['a', 'b', 'c']);
  assert.deepEqual(row, ['x, y', 'say "hi"', 'two\nlines']);
});

test('only rows whose live_path differs from eds_path become redirects', () => {
  const { rows } = buildRedirects(csv([
    'hub,/institutional/tw/en/about-us,/institutional/tw/en/about-us,200,,,,,"About, us"',
    'landing,/institutional/tw/en/Pension-Barometer,/institutional/tw/en/pension-barometer,unchecked,,,,,',
    'viewpoint,/institutional/tw/en/viewpoints/x/global_macro_outlook,/institutional/tw/en/viewpoints/x/global-macro-outlook,200,,,,,',
  ]));
  assert.deepEqual(rows, [
    { Source: '/institutional/tw/en/Pension-Barometer', Destination: '/institutional/tw/en/pension-barometer' },
    { Source: '/institutional/tw/en/viewpoints/x/global_macro_outlook', Destination: '/institutional/tw/en/viewpoints/x/global-macro-outlook' },
  ]);
});

test('duplicate Source: the first row is kept, the other reported', () => {
  const { rows, skipped } = buildRedirects(csv([
    'a,/institutional/tw/en/A,/institutional/tw/en/a,200,,,,,',
    'a,/institutional/tw/en/A,/institutional/tw/en/a-2,200,,,,,',
  ]));
  assert.deepEqual(rows.map((r) => r.Destination), ['/institutional/tw/en/a']);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /duplicate Source/);
  assertSheet(rows);
});

test('a chain is collapsed to its final Destination; a loop is left out', () => {
  const { rows, skipped } = buildRedirects(csv([
    'a,/institutional/tw/en/A,/institutional/tw/en/B,200,,,,,',
    'a,/institutional/tw/en/B,/institutional/tw/en/c,200,,,,,',
    'a,/institutional/tw/en/X,/institutional/tw/en/Y,200,,,,,',
    'a,/institutional/tw/en/Y,/institutional/tw/en/X,200,,,,,',
  ]));
  assert.deepEqual(rows, [
    { Source: '/institutional/tw/en/A', Destination: '/institutional/tw/en/c' },
    { Source: '/institutional/tw/en/B', Destination: '/institutional/tw/en/c' },
  ]);
  assert.deepEqual(skipped.map((s) => s.source).sort(), ['/institutional/tw/en/X', '/institutional/tw/en/Y']);
  assertSheet(rows);
});

test('pages.csv: 237 redirects, every live_path != eds_path row, a valid sheet', () => {
  const [head, ...data] = parseCsv(CSV);
  const live = head.indexOf('live_path');
  const eds = head.indexOf('eds_path');
  const differing = data.filter((r) => r[live] !== r[eds]);
  const { rows, skipped } = buildRedirects(CSV);
  assert.equal(rows.length, 237);
  assert.equal(skipped.length, 0);
  assert.deepEqual(rows.map((r) => r.Source), differing.map((r) => r[live]));
  assertSheet(rows);
  rows.forEach((r) => assert.match(r.Destination, /^\/[a-z0-9/-]*$/, `${r.Destination} is an Edge Delivery path`));
});
