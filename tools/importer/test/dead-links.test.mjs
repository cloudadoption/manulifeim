/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests for the dead-link rule of utils/links.js (rewriteLinks / dropDeadLink): a link to
 * "#" goes nowhere on live, so a paragraph or list item holding only it goes (an emptied list
 * too) and inside other text the text stays without the link, as the repairs5 edits did.
 * Fixture: tools/importer/test/fixtures/dead-links.html, real snapshot markup of an author box
 * ("Read bio"), a tile set ("Learn more") and a list with one dead item, run through the real
 * parsers first. No browser, no network.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const mod = (p) => import(pathToFileURL(join(here, '..', p)).href);
const { rewriteLinks, dropDeadLink } = await mod('utils/links.js');
const author = (await mod('parsers/author.js')).default;
const tiles = (await mod('parsers/cards-tiles.js')).default;
const linkListInline = (await mod('parsers/link-list-inline.js')).default;

const FIXTURE = readFileSync(join(here, 'fixtures', 'dead-links.html'), 'utf-8');
let document;

/* block table like the importer's: header row = name (variants), one row per cells entry */
function createBlock(doc, { name, variants = [], cells }) {
  const table = doc.createElement('table');
  const head = doc.createElement('tr');
  const th = doc.createElement('th');
  th.textContent = variants.length ? `${name} (${variants.join(', ')})` : name;
  head.append(th);
  table.append(head);
  cells.forEach((row) => {
    const tr = doc.createElement('tr');
    row.forEach((value) => {
      const td = doc.createElement('td');
      [].concat(value).forEach((v) => {
        if (v === null || v === undefined || v === '') return;
        td.append(typeof v === 'string' ? doc.createTextNode(v) : v);
      });
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

const run = (id, parse, selector) => {
  const root = document.querySelector(`#${id}`);
  parse(root.querySelector(selector), { document });
  const ctx = { rules: {} };
  rewriteLinks(root, ctx);
  return { root, ctx };
};

test('author box: the "Read bio" paragraph to "#" goes, name, title and company stay', () => {
  assert.equal(document.querySelectorAll('#fx-author a[href="#"]').length, 1);
  const { root, ctx } = run('fx-author', author, '.mim-authors');
  const cell = root.querySelector('table tr:nth-child(2) td:nth-child(2)');
  assert.deepEqual([...cell.querySelectorAll('p')].map((p) => p.textContent), ['Frances Donald', 'Former Global Chief Economist and Strategist', 'Manulife Investment Management']);
  assert.equal(root.textContent.includes('Read bio'), false);
  assert.deepEqual(ctx.rules, { 'dead-link-removed': 1 });
});

test('tiles: the five "Learn more" paragraphs to "#" go, every tile keeps its heading and text', () => {
  assert.equal(document.querySelectorAll('#fx-tiles a[href="#"]').length, 5);
  const { root, ctx } = run('fx-tiles', tiles, '.infoContainer');
  assert.equal(root.querySelector('a[href="#"]'), null);
  assert.equal(root.textContent.includes('Learn more'), false);
  const headings = [...root.querySelectorAll('h2, h3, h4')].map((h) => h.textContent.trim());
  assert.deepEqual(headings, ['Fixed income', 'Alpha-focused equity', 'Multi-asset solutions', 'Private markets', 'Alternative credit']);
  assert.ok(root.textContent.includes('Regional and global portfolios spanning the credit spectrum'));
  assert.equal(ctx.rules['dead-link-removed'], 5);
});

test('a list whose only item links to "#": the item and the emptied list go, the label stays', () => {
  const { root, ctx } = run('fx-list', linkListInline, '.moreInsights');
  const cells = [...root.querySelectorAll('table tr:nth-child(2) td')];
  assert.equal(cells[0].textContent.trim(), 'View our full library of research');
  assert.equal(cells[1].querySelector('ul, li, a'), null);
  assert.deepEqual(ctx.rules, { 'dead-link-removed': 1 });
});

test('inside other text the text stays unlinked; images, in-page anchors and video buttons are kept', () => {
  const box = document.createElement('div');
  box.innerHTML = `<p>Contact our <a href="#">institutional sales team</a> today.</p>
    <p><strong><a href="#">Download the latest report</a></strong></p>
    <p><a href="#"><img src="/media-da/x.png" alt="Report cover"></a></p>
    <h2><a href="#">Recommended viewpoints</a></h2>
    <p><a href="#key-facts">Key facts</a></p>
    <p><a href="#" data-videomodal="6000000000001">Watch the video</a></p>`;
  const ctx = { rules: {} };
  rewriteLinks(box, ctx);
  const ps = [...box.children];
  assert.equal(ps[0].outerHTML, '<p>Contact our institutional sales team today.</p>');
  assert.equal(box.textContent.includes('Download the latest report'), false, 'a bold CTA alone in its paragraph goes too');
  assert.equal(box.querySelector('img').getAttribute('alt'), 'Report cover');
  assert.equal(box.querySelector('img').parentElement.tagName, 'P');
  assert.equal(box.querySelector('h2').outerHTML, '<h2>Recommended viewpoints</h2>');
  assert.equal(box.querySelector('a[href="#key-facts"]').textContent, 'Key facts');
  assert.equal(box.querySelector('a[data-videomodal]').getAttribute('href'), '#');
  assert.deepEqual(ctx.rules, { 'dead-link-unwrapped': 3, 'dead-link-removed': 1, 'keep-scheme': 2 });
});

test('dropDeadLink reports what it did; an ordered list keeps its other items', () => {
  const box = document.createElement('div');
  box.innerHTML = '<ol><li><a href="#">Newsletter 1</a></li><li><a href="/x">Newsletter 2</a></li></ol>';
  assert.equal(dropDeadLink(box.querySelector('a[href="#"]')), 'removed');
  assert.equal(box.innerHTML, '<ol><li><a href="/x">Newsletter 2</a></li></ol>');
});
