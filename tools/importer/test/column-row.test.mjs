/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests: a live column-container whose columns are all filled, one holding several
 * components with a block among them (Pension Barometer: chart + promo, form beside a promo),
 * becomes one section per column with Section Metadata Column 1, 2 (Layout on the first; a divider
 * inside a column continues it in a section with the same Column and Style divider;
 * scripts/section-columns.js merges them). In a flow it keeps the old model. A column with one
 * component each stays a Layout section. Fixture: tools/importer/test/fixtures/column-row.html.
 * No browser, no network.
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
const { itemsFor, toSections, renderSections } = await mod('utils/page-model.js');

const FIXTURE = readFileSync(join(here, 'fixtures', 'column-row.html'), 'utf-8');
let document;

beforeEach(() => {
  ({ document } = new JSDOM(FIXTURE, { virtualConsole: new VirtualConsole() }).window);
  globalThis.WebImporter = { Blocks: { createBlock: (doc, { name }) => doc.createElement(`x-${name.toLowerCase().replace(/\s+/g, '-')}`) } };
});

const containers = () => [...document.querySelectorAll('#fx-plain > div > .column-container')];
const view = (sections) => sections.map((s) => ({
  meta: JSON.parse(renderSections(document, [s]).firstElementChild.getAttribute('data-mim')),
  nodes: s.nodes.map((n) => (/^(DIV|SECTION)$/.test(n.tagName) ? `[${n.className.split(' ')[0]}]` : n.tagName.toLowerCase())),
}));

test('chart with a promo under it: Column 1 (Layout 6-6) | Column 2 with text, image, source and the promo', () => {
  assert.deepEqual(view(toSections(itemsFor(document, [containers()[0]]))), [
    { meta: { Layout: '6-6', Column: '1' }, nodes: ['h3', 'p'] },
    { meta: { Column: '2' }, nodes: ['p', 'p', 'p', '[simpleBanner]'] },
  ]);
});

test('form beside a promo: the form in Column 1, the text after the divider continues Column 1 with Style divider', () => {
  assert.deepEqual(view(toSections(itemsFor(document, [containers()[1]]))), [
    { meta: { Layout: '6-6', Column: '1' }, nodes: ['p', '[marketoForm]'] },
    { meta: { Style: 'divider', Column: '1' }, nodes: ['p'] },
    { meta: { Column: '2' }, nodes: ['[simpleBanner]'] },
  ]);
});

test('in a flow the old model stays: content, then the blocks as their own sections', () => {
  const sections = view(toSections(itemsFor(document, [containers()[0]]), { flow: true }));
  assert.ok(sections.every((s) => !s.meta.Column));
  assert.ok(sections.some((s) => s.nodes.includes('[simpleBanner]')));
});

test('one component per column (title + text next to a form) stays one Layout 8-4 section', () => {
  const [row] = view(toSections(itemsFor(document, [containers()[2]])));
  assert.equal(row.meta.Layout, '8-4');
  assert.equal(row.meta.Column, undefined);
  assert.deepEqual(row.nodes, ['h2', 'p', '[marketoForm]']);
});
