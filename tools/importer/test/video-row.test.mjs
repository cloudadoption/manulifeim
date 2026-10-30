/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests: a live row of small videos (2+ column-container columns, each a videoKicker
 * optionally followed by its linkList2) becomes one section with Layout (qw-4 + qw-4 = 6-6) whose
 * Video blocks have the variant small, each column's links in its video as a bulleted list. In an
 * article flow the row keeps its Layout and drops centered. Fixture:
 * tools/importer/test/fixtures/video-row.html (trimmed live markup). No browser, no network.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const importer = join(here, '..');
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const mod = (p) => import(pathToFileURL(join(importer, p)).href);
const { itemsFor, toSections } = await mod('utils/page-model.js');
const parseVideo = (await mod('parsers/video.js')).default;

const FIXTURE = readFileSync(join(here, 'fixtures', 'video-row.html'), 'utf-8');
let document;

function createBlock(doc, { name, variants = [], cells }) {
  const table = doc.createElement('table');
  const head = doc.createElement('tr');
  head.innerHTML = `<th>${name}${variants.length ? ` (${variants.join(', ')})` : ''}</th>`;
  table.append(head);
  cells.forEach((row) => {
    const tr = doc.createElement('tr');
    row.forEach((v) => {
      const td = doc.createElement('td');
      [v].flat().forEach((x) => td.append(typeof x === 'string' ? doc.createTextNode(x) : x));
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

beforeEach(() => {
  ({ document } = new JSDOM(FIXTURE, { url: 'https://www.manulifeim.com/institutional/tw/en/x', virtualConsole: new VirtualConsole() }).window);
  globalThis.WebImporter = { Blocks: { createBlock } };
});

const model = (id, opts = {}) => toSections(itemsFor(document, [...document.querySelector(`#${id} > div`).children]), opts);

test('article flow: the two videos and their links are one Layout 6-6 section between the text (no centered)', () => {
  const sections = model('fx-article', { flow: true });
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map((s) => [s.styles, s.layout || null]), [[[], null], [[], '6-6'], [[], null]]);
  const row = sections[1];
  assert.equal(row.nodes.length, 2);
  row.nodes.forEach((v) => {
    assert.ok(v.matches('.videoKicker[data-mim-video-small]'));
    assert.equal(v.querySelectorAll('ul[data-mim-video-links] > li > a').length, 1);
  });
  assert.equal(document.querySelectorAll('#fx-article .linkList2').length, 0, 'the link lists moved into the videos');
});

test('video parser: Video (small) with poster, player link, caption and the links list', () => {
  const [, row] = model('fx-article', { flow: true });
  const [first] = row.nodes;
  const holder = document.createElement('div');
  holder.append(first);
  parseVideo(first, { document });
  const table = holder.querySelector('table');
  assert.equal(table.querySelector('th').textContent, 'Video (small)');
  const cell = table.querySelector('td');
  assert.ok(cell.querySelector('img'));
  assert.match(cell.textContent, /players\.brightcove\.net\/207397170001\/default_default\/index\.html\?videoId=6169714962001/);
  assert.match(cell.textContent, /The global economic recovery might be underway\./);
  const links = cell.querySelectorAll('ul > li > a');
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, 'Download transcript (PDF)');
  assert.equal(cell.querySelector('[data-mim-video-links]'), null, 'marker removed');
});

test('a single video stays Video without the variant', () => {
  const el = document.querySelector('#fx-text-video .videoKicker');
  const holder = el.parentElement;
  parseVideo(el, { document });
  assert.equal(holder.querySelector('th').textContent, 'Video');
});

test('component root: a quarter-width pair is a centered Layout 6-6 section of small videos', () => {
  const [row] = model('fx-cqs');
  assert.deepEqual(row.styles, ['centered']);
  assert.equal(row.layout, '6-6');
  assert.equal(row.nodes.filter((v) => v.hasAttribute('data-mim-video-small')).length, 2);
});

test('text next to one video (live cio-insight): one Layout 6-6 section, the text then Video (small)', () => {
  const [row, ...rest] = toSections(itemsFor(document, [...document.querySelector('#fx-text-video > div').children]), { flow: true });
  assert.equal(rest.length, 0);
  assert.equal(row.layout, '6-6');
  assert.deepEqual(row.styles, []);
  assert.deepEqual(row.nodes.map((n) => n.tagName), ['H3', 'P', 'DIV']);
  assert.ok(row.nodes[2].matches('.videoKicker[data-mim-video-small]'));
});
