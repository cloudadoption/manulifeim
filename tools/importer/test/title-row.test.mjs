/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests: the importer never emits a Title block. A live richTitle (numbered heading,
 * heading with link) becomes its own section with Style title-row holding the heading and the
 * link paragraph, as the 28 October migration did (tools/importer/migrate-title-row.mjs).
 * Fixture: tools/importer/test/fixtures/title-row.html (trimmed live markup of
 * real-assets-opportunities and about-us). No browser, no network.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
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
const sectionsTransformer = (await mod('transformers/sections.js')).default;

const FIXTURE = readFileSync(join(here, 'fixtures', 'title-row.html'), 'utf-8');
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

const model = (id, opts = {}) => toSections(itemsFor(document, [...document.querySelector(`#${id} > div`).children]), opts);
const view = (sections) => sections.map((s) => ({
  styles: s.styles, navTitle: s.navTitle || null, nodes: s.nodes.map((n) => n.outerHTML.replace(/\s+/g, ' ').trim()),
}));

test('article flow: each numbered heading is its own title-row section and splits the flow', () => {
  assert.deepEqual(view(model('fx-numbered', { flow: true })), [
    { styles: [], navTitle: null, nodes: ['<p>Our answer is threefold.</p>'] },
    { styles: ['title-row'], navTitle: null, nodes: ['<h2><strong>1</strong> Diversification</h2>'] },
    { styles: [], navTitle: null, nodes: ['<p>To build a well-diversified portfolio…</p>'] },
    { styles: ['title-row'], navTitle: 'Capital protection', nodes: ['<h2><strong>2</strong> Capital protection</h2>'] },
    { styles: [], navTitle: null, nodes: ['<p>Agriculture (+4.1%), infrastructure (+3.5%)…</p>'] },
  ]);
});

test('heading with link: the heading keeps its emphasis, the link becomes a link paragraph', () => {
  const [, title, after] = view(model('fx-link'));
  assert.deepEqual(title.styles, ['title-row']);
  assert.equal(title.nodes[0], '<h2>Latest <i>news</i></h2>');
  assert.match(title.nodes[1], /^<p><a href="[^"]*about-us\/press-releases">All news<\/a><\/p>$/);
  assert.deepEqual(after.nodes, ['<p>After the title.</p>']);
});

test('a title in a centered column keeps centered next to title-row; an empty title is dropped', () => {
  assert.deepEqual(view(model('fx-centered')), [
    { styles: ['centered', 'title-row'], navTitle: null, nodes: ['<h3>Our <em>capabilities</em></h3>'] },
    { styles: ['centered'], navTitle: null, nodes: ['<p>Centered text.</p>'] },
  ]);
});

test('the flattened page has Section Metadata Style title-row and no Title block', () => {
  document.body.replaceChildren(renderSections(document, model('fx-numbered', { flow: true })));
  sectionsTransformer('afterTransform', document.body, { document });
  const names = [...document.body.querySelectorAll('table')].map((t) => t.querySelector('th').textContent);
  assert.deepEqual(names, ['Section Metadata', 'Section Metadata']);
  assert.deepEqual([...document.body.querySelectorAll('table')].map((t) => t.querySelector('tr:nth-child(2)').textContent), ['Styletitle-row', 'Styletitle-row']);
});

test('no import script, template or parser list carries the Title parser any more', () => {
  assert.equal(existsSync(join(importer, 'parsers', 'title.js')), false);
  readdirSync(importer).filter((f) => /^import-.*\.js$/.test(f) && !f.endsWith('.bundle.js')).forEach((f) => {
    assert.doesNotMatch(readFileSync(join(importer, f), 'utf8'), /parsers\/title\.js|titleParser/, f);
  });
  const { templates } = JSON.parse(readFileSync(join(importer, 'page-templates.json'), 'utf8'));
  templates.forEach((t) => assert.equal(t.blocks.some((b) => b.name === 'title'), false, t.name));
  assert.doesNotMatch(readFileSync(join(importer, 'build-page-templates.mjs'), 'utf8'), /name: 'title'/);
});
