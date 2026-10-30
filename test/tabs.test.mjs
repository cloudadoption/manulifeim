/* blocks/tabs (node --test + jsdom, no browser). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function setup(search = '') {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>', { url: `https://main--manulifeim--cloudadoption.aem.page/x${search}` });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom;
}

let n = 0;
const fresh = () => import(`../blocks/tabs/tabs.js?t=${n += 1}`);

const ROWS = `
  <div><div>Inflation targets</div><div><h4>Is 2% the right target?</h4><p>As economies slow …</p><p><picture><img src="/media-da/a.jpg" alt=""></picture></p></div></div>
  <div><div><p>Terminal rates</p></div><div><h4>Higher for longer?</h4><p>We suspect …</p></div></div>
  <div><div></div><div><p>no label: skipped</p></div></div>
  <div><div>New tools</div><div><h4>QE and QT</h4><p>We doubt it.</p></div></div>`;

function block() {
  const main = document.querySelector('main');
  main.innerHTML = `<div class="tabs">${ROWS}</div>`;
  return main.querySelector('.tabs');
}

test('one tab per labelled row; the first is open, the others hidden', async () => {
  setup();
  const { default: decorate } = await fresh();
  const b = block();
  decorate(b);
  const tabs = [...b.querySelectorAll('[role=tab]')];
  const panels = [...b.querySelectorAll('[role=tabpanel]')];
  assert.deepEqual(tabs.map((t) => t.textContent), ['Inflation targets', 'Terminal rates', 'New tools']);
  assert.equal(panels.length, 3);
  assert.deepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false', 'false']);
  assert.deepEqual(panels.map((p) => p.hidden), [false, true, true]);
  tabs.forEach((t, i) => {
    assert.equal(t.getAttribute('aria-controls'), panels[i].id);
    assert.equal(panels[i].getAttribute('aria-labelledby'), t.id);
  });
  assert.equal(b.querySelector('[role=tablist]').children.length, 3);
});

test('a panel with an image gets the media layout; text and image are separated', async () => {
  setup();
  const { default: decorate } = await fresh();
  const b = block();
  decorate(b);
  const [first, second] = b.querySelectorAll('[role=tabpanel]');
  assert.ok(first.classList.contains('tabs-panel-media'));
  assert.ok(first.querySelector('.tabs-panel-image picture'));
  assert.equal(first.querySelector('.tabs-panel-text h4').textContent, 'Is 2% the right target?');
  assert.equal(first.querySelector('.tabs-panel-text picture'), null);
  assert.equal(second.classList.contains('tabs-panel-media'), false);
  assert.equal(second.querySelector('.tabs-panel-image'), null);
});

test('click and keyboard (Right, Left wraps, Home, End) switch the open panel', async () => {
  setup();
  const { default: decorate } = await fresh();
  const b = block();
  decorate(b);
  const tabs = [...b.querySelectorAll('[role=tab]')];
  const panels = [...b.querySelectorAll('[role=tabpanel]')];
  const open = () => panels.findIndex((p) => !p.hidden);
  tabs[1].click();
  assert.equal(open(), 1);
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[0].tabIndex, -1);
  const key = (k) => {
    document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  };
  tabs[1].focus();
  key('ArrowRight');
  assert.equal(open(), 2);
  assert.equal(document.activeElement, tabs[2]);
  key('ArrowRight');
  assert.equal(open(), 0);
  key('ArrowLeft');
  assert.equal(open(), 2);
  key('Home');
  assert.equal(open(), 0);
  key('End');
  assert.equal(open(), 2);
});

test('an empty block (no labelled row with content) is left alone', async () => {
  setup();
  const { default: decorate } = await fresh();
  const main = document.querySelector('main');
  main.innerHTML = '<div class="tabs"><div><div>Only label</div></div></div>';
  const empty = main.querySelector('.tabs');
  decorate(empty);
  assert.equal(empty.querySelector('[role=tablist]'), null);
  assert.equal(empty.children.length, 1);
});
