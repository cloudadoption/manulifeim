/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests for navigationTabs whose panels hold other components (columns, cards, tables,
 * disclosures): utils/page-model.js gives each panel its own section with Section Metadata
 * Tab: <label> (scripts/section-tabs.js groups them on the site), and transformers/sections.js
 * writes the Tab row. Fixture: tools/importer/test/fixtures/section-tabs.html (trimmed live
 * markup of US-econometer, privates and two viewpoints). No browser, no network.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
// utils/links.js imports link-map.json without import attributes (esbuild style)
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const mod = (p) => import(pathToFileURL(join(here, '..', p)).href);
const {
  classify, itemsFor, toSections, renderSections,
} = await mod('utils/page-model.js');
const sectionsTransformer = (await mod('transformers/sections.js')).default;

const FIXTURE = readFileSync(join(here, 'fixtures', 'section-tabs.html'), 'utf-8');
let document;

function createBlock(doc, { name, cells }) {
  const table = doc.createElement('table');
  const head = doc.createElement('tr');
  head.innerHTML = `<th>${name}</th>`;
  table.append(head);
  cells.forEach((row) => {
    const tr = doc.createElement('tr');
    row.forEach((v) => {
      const td = doc.createElement('td');
      td.append(typeof v === 'string' ? doc.createTextNode(v) : v);
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

beforeEach(() => {
  ({ document } = new JSDOM(FIXTURE, { virtualConsole: new VirtualConsole() }).window);
  globalThis.WebImporter = { Blocks: { createBlock } };
});

const model = (id, opts = {}) => {
  const root = document.querySelector(`#${id} > div`);
  return toSections(itemsFor(document, [...root.children]), opts);
};
const summary = (sections) => sections.map((s) => ({
  tab: s.tab || null,
  styles: s.styles,
  nodes: s.nodes.map((n) => (n.classList?.length ? `.${n.classList[0]}` : n.tagName)),
}));

test('classify: navigationTabs with component panels -> tabSections; text and figure panels stay a Tabs block', () => {
  ['fx-econometer', 'fx-privates', 'fx-india', 'fx-foresight'].forEach((id) => {
    assert.deepEqual(classify(document.querySelector(`#${id} .navigationTabs`)), { kind: 'tabSections' }, id);
  });
  const one = document.querySelector('#fx-privates .navigationTabs');
  one.querySelectorAll('.navigationTabs__contentItem')[1].remove();
  assert.deepEqual(classify(one), { kind: 'default', name: 'navigationTabs' }, 'a single panel is flattened as before');
});

test('component-root page: one centered section per panel (title + image), the content after is its own section', () => {
  const sections = model('fx-econometer');
  assert.deepEqual(summary(sections), [
    { tab: null, styles: [], nodes: ['H3', 'P'] },
    { tab: 'June 15, 2023', styles: ['centered'], nodes: ['H1', 'P'] },
    { tab: 'May 8, 2023', styles: ['centered'], nodes: ['H1', 'P'] },
    { tab: null, styles: [], nodes: ['H2'] },
  ]);
  assert.ok(sections[1].nodes[1].querySelector('img[alt="Econometer June"]'));
});

test('cards panels: each infoContainer stays a live element for the cards-tiles parser, in its own Tab section', () => {
  const sections = model('fx-privates');
  assert.deepEqual(summary(sections).map((s) => [s.tab, s.nodes.join()]), [['1985–1999', '.infoContainer'], ['2000–2009', '.infoContainer']]);
  assert.deepEqual(classify(sections[0].nodes[0]), { kind: 'block', name: 'cards-tiles' });
});

test('article flow: the tab panels split the flow; text before and after keep their own sections', () => {
  const sections = model('fx-india', { flow: true });
  assert.deepEqual(summary(sections), [
    { tab: null, styles: [], nodes: ['H2', 'P'] },
    { tab: 'Consumers (ex-auto)', styles: [], nodes: ['.table2'] },
    { tab: 'Automobiles', styles: [], nodes: ['.table2'] },
    { tab: null, styles: [], nodes: ['P'] },
  ]);
});

test('a panel with image and disclosure keeps both in one section; the tab set title is an h2 before it', () => {
  const sections = model('fx-foresight', { flow: true });
  assert.deepEqual(summary(sections), [
    { tab: null, styles: [], nodes: ['H2'] },
    { tab: 'Active', styles: ['centered'], nodes: ['P', '.disclosures'] },
    { tab: 'Strategic', styles: ['centered'], nodes: ['P', '.disclosures'] },
  ]);
  assert.equal(sections[0].nodes[0].textContent, 'Our asset allocation views');
});

test('sections transformer writes Section Metadata Tab (and Style) for every panel section', () => {
  const page = renderSections(document, model('fx-foresight', { flow: true }));
  assert.deepEqual([...page.children].map((d) => JSON.parse(d.getAttribute('data-mim'))), [
    {}, { Style: 'centered', Tab: 'Active' }, { Style: 'centered', Tab: 'Strategic' },
  ]);
  document.body.replaceChildren(page);
  sectionsTransformer('afterTransform', document.body, { document });
  const metas = [...document.body.querySelectorAll('table')].filter((t) => t.querySelector('th').textContent === 'Section Metadata')
    .map((t) => [...t.querySelectorAll('tr')].slice(1).map((r) => [...r.children].map((c) => c.textContent).join(': ')));
  assert.deepEqual(metas, [['Style: centered', 'Tab: Active'], ['Style: centered', 'Tab: Strategic']]);
  assert.equal(document.body.querySelectorAll('hr').length, 2);
});
