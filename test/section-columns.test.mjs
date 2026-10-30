/* global globalThis */
/* scripts/section-columns.js (node --test + jsdom, no browser): consecutive sections with
   Section Metadata Column (data-column) are merged into one row section, one div.section-column
   per section, so a column holds several blocks and text (live Pension Barometer). */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let main;
beforeEach(() => {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>');
  globalThis.document = dom.window.document;
  main = dom.window.document.querySelector('main');
});

const { default: buildSectionColumns, columnRows } = await import('../scripts/section-columns.js');

// sections as decorateSections / decorateBlocks leave them
const section = (attrs, inner) => `<div class="section" ${attrs}>${inner}</div>`;
const text = (t) => `<div class="default-content-wrapper"><p>${t}</p></div>`;
const blockWrap = (name) => `<div class="${name}-wrapper"><div class="${name} block" data-block-name="${name}"></div></div>`;

test('a Column 1 + Column 2 row: one section with two columns, Layout and Style from the first', () => {
  main.innerHTML = [
    section('id="market-overview" data-nav-title="Market overview"', text('Before')),
    section('data-layout="6-6" data-column="1"', text('Fixed income')).replace('class="section"', 'class="section divider"'),
    section('id="chart" data-column="2"', text('Canada yield curve') + blockWrap('promo')),
    section('', text('After')),
  ].join('');
  assert.equal(buildSectionColumns(main), 1);
  const sections = [...main.children];
  assert.equal(sections.length, 3);
  const row = sections[1];
  assert.ok(row.classList.contains('section-columns') && row.classList.contains('divider'));
  assert.equal(row.dataset.layout, '6-6');
  const cols = [...row.children];
  assert.deepEqual(cols.map((c) => c.className), ['section-column', 'section-column']);
  assert.equal(cols[0].textContent, 'Fixed income');
  assert.deepEqual([...cols[1].children].map((c) => c.className), ['default-content-wrapper', 'promo-wrapper']);
  assert.equal(cols[1].id, 'chart', 'the id of a merged section moves onto its column');
  assert.ok(row.querySelector('.promo.block'), 'blocks stay decorated, to be loaded with the row section');
});

test('Column 1 starts a new row; a section without Column ends one; a lone Column section stays', () => {
  main.innerHTML = [
    section('data-column="1"', text('a1')), section('data-column="2"', text('a2')),
    section('data-column="1"', text('b1')), section('data-column="2"', text('b2')), section('data-column="3"', text('b3')),
    section('', text('plain')),
    section('data-column="1"', text('lone')),
  ].join('');
  assert.deepEqual(columnRows(main).map((r) => r.map((s) => s.textContent)), [['a1', 'a2'], ['b1', 'b2', 'b3']]);
  buildSectionColumns(main);
  assert.deepEqual([...main.children].map((s) => s.querySelectorAll(':scope > .section-column').length), [2, 3, 0, 0]);
  assert.equal(main.lastElementChild.textContent, 'lone');
});

test('no Column metadata: nothing changes', () => {
  main.innerHTML = section('data-layout="6-6"', text('x') + blockWrap('form'));
  const before = main.innerHTML;
  assert.equal(buildSectionColumns(main), 0);
  assert.equal(main.innerHTML, before);
});
