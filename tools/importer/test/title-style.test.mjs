/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests: a live Title component (plain heading, sized by its context on live) starts a
 * section with Section Metadata Style section-title; in a flow the content after it stays in that
 * section. A title in a tab panel stays a plain heading of the panel, the press release h1
 * stays the release title. Fixture: tools/importer/test/fixtures/title-style.html (trimmed
 * live markup). No browser, no network.
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
const sectionsTransformer = (await mod('transformers/sections.js')).default;

const FIXTURE = readFileSync(join(here, 'fixtures', 'title-style.html'), 'utf-8');
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
  styles: s.styles,
  nodes: s.nodes.map((n) => (n.tagName === 'DIV' ? `[${n.className.split(' ')[0]}]` : `${n.tagName.toLowerCase()}: ${n.textContent.trim()}`)),
  ...(s.layout ? { layout: s.layout } : {}),
  ...(s.tab ? { tab: s.tab } : {}),
}));

test('article flow: each title starts a Style section-title section that keeps the text after it', () => {
  assert.deepEqual(view(model('fx-article', { flow: true })), [
    { styles: [], nodes: ['p: Intro paragraph.'] },
    {
      styles: ['section-title'],
      nodes: ['h2: A crisis unlike any other brings about a recovery unlike any other', 'p: Economists are used to studying the past.', 'h2: Rich text heading', 'p: More text.'],
    },
    { styles: ['section-title'], nodes: ['h4: The transformation of the MSCI Emerging Markets Index', 'p: After the second title.'] },
  ]);
});

test('component root: a title is its own Style section-title section; a title opening a column run leads it', () => {
  assert.deepEqual(view(model('fx-plain')), [
    { styles: ['section-title'], nodes: ['h1: Explore the strategies'] },
    { styles: ['section-title'], nodes: ['h4: Related viewpoints', 'p: Text under the title in the same column.'] },
  ]);
});

test('layout row: Style section-title on the Layout section when the first column opens with the title', () => {
  const [row] = view(model('fx-layout'));
  assert.deepEqual(row.styles, ['section-title']);
  assert.equal(row.layout, '8-4');
  assert.deepEqual(row.nodes.slice(0, 2), ['h2: Portfolio review', 'p: Ask for a review.']);
});

test('tab panel: the title stays a plain heading in the panel section (no Style section-title, no split)', () => {
  const sections = view(model('fx-tabs'));
  const overview = sections.filter((s) => s.tab === 'Overview');
  assert.equal(overview.length, 1);
  assert.deepEqual(overview[0].styles, []);
  assert.equal(overview[0].nodes[0], 'h1: US Econometer');
});

test('press release: the h1 title stays in the header flow; a later title starts a Style section-title section', () => {
  const body = document.createElement('body');
  body.append(document.querySelector('#fx-press > main'));
  document.body.replaceWith(body);
  sectionsTransformer('beforeTransform', document.body, { document, template: { name: 'press-release' } });
  sectionsTransformer('afterTransform', document.body, { document });
  const sections = document.body.innerHTML.split('<hr>');
  assert.equal(sections.length, 2);
  assert.match(sections[0], /<p>March 1, 2024<\/p>\s*<h1>Manulife Investment Management announces co-heads<\/h1>\s*<p>Release body\.<\/p>/);
  assert.doesNotMatch(sections[0], /Section Metadata/);
  assert.match(sections[1], /^<h2>About Manulife<\/h2><p>Boilerplate\.<\/p><table>.*Section Metadata.*Style.*section-title/);
});
