/* eslint-disable import/no-unresolved, import/extensions */
/* global globalThis */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!DOCTYPE html><body></body>');
globalThis.document = window.document;
const { el, readRows } = await import('../scripts/dom-utils.js');

const block = (html) => {
  const div = document.createElement('div');
  div.className = 'cards news block';
  div.innerHTML = html;
  return div;
};

test('el: class shorthand, attributes, children', () => {
  const node = el('a', {
    href: '/x', class: 'c', hidden: true, title: null,
  }, 'text', null, el('span'));
  assert.equal(node.outerHTML, '<a href="/x" class="c" hidden="">text<span></span></a>');
  assert.equal(el('ul', 'cards-list').className, 'cards-list');
});

test('readRows: settings rows marked and kept, content rows returned in order', () => {
  const b = block(`
    <div><div><picture></picture></div><div>Card one</div></div>
    <div><div>Source</div><div><a href="/institutional/tw/en/query-index.json">index</a></div></div>
    <div><div>Limit</div><div> 3 </div></div>
    <div><div>Card two</div></div>`);
  const {
    config, cells, settings, items,
  } = readRows(b, ['source', 'limit']);
  assert.deepEqual(config, { source: '/institutional/tw/en/query-index.json', limit: '3' });
  assert.equal(cells.limit.textContent.trim(), '3');
  assert.deepEqual(settings.map((r) => r.dataset.config), ['source', 'limit']);
  assert.deepEqual(items.map((r) => r.textContent.trim()), ['Card one', 'Card two']);
  assert.equal(b.children.length, 4, 'nothing removed from the block');
});

test('readRows: hrefKeys, links in lists and the accept test', () => {
  const b = block(`
    <div><div>Title</div><div><a href="/t">Linked title</a></div></div>
    <div><div>Source</div><div><ul><li><a href="/a">a</a></li></ul></div></div>
    <div><div>Speed</div></div>`);
  const r = readRows(b, ['title', 'source', 'speed'], { hrefKeys: ['source'] });
  assert.equal(r.config.title, 'Linked title', 'text when the key is not an href key');
  assert.equal(r.config.source, 'a', 'a link inside a list is content, not an href');
  assert.equal(r.items.length, 1, 'a one-cell row is never a settings row');
  const accepted = readRows(block('<div><div>Title</div><div><a href="/t">x</a></div></div>'), ['title'], {
    accept: (rowCells) => !rowCells[1].querySelector('a'),
  });
  assert.equal(accepted.settings.length, 0);
  assert.equal(accepted.items.length, 1);
});
