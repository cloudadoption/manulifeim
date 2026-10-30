/* global globalThis */
/* blocks/team (node --test + jsdom, no browser): every bio in full by default; the live per-member
   "Read more" option collapses long bios, for the whole block (variant read-more) or one member
   (third cell "Read more"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function setup() {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>', { url: 'https://main--manulifeim--cloudadoption.aem.page/x' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // jsdom has no layout: every bio measures 300px high in a visible block
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 300; } });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 300; } });
  globalThis.ResizeObserver = function ResizeObserver() {
    return { observe() {}, disconnect() {} };
  };
  return dom;
}

let n = 0;
const fresh = () => {
  n += 1;
  return import(`../blocks/team/team.js?t=${n}`);
};

const member = (name, extra = '') => `<div><div><picture><img src="/media-da/${name}.jpg" alt=""></picture></div>
  <div><h4>${name}</h4><p>Senior Managing Director</p><p>${name} leads the team. ${'Long bio text. '.repeat(30)}</p>
  <ul><li><strong>Education:</strong> B.S.</li></ul></div>${extra}</div>`;

function block(cls, rows) {
  const main = document.querySelector('main');
  main.innerHTML = `<div class="${cls}">${rows.join('')}</div>`;
  return main.querySelector('.team');
}

const collapsed = (b) => [...b.querySelectorAll('.team-member')].map((m) => !!m.querySelector('.team-bio.team-bio-collapsed') && !!m.querySelector('details.team-read-more'));

test('default: every bio shows in full, no toggle (live canadian-core, asia-best-select)', async () => {
  setup();
  const { default: decorate } = await fresh();
  const b = block('team', [member('Roshan Thiru'), member('Sivan Nair')]);
  decorate(b);
  assert.deepEqual(collapsed(b), [false, false]);
  assert.equal(b.querySelectorAll('.team-bio').length, 2, 'the bio is still wrapped for styling');
});

test('variant read-more: every long bio collapses to the toggle (live agriculture/team senior management)', async () => {
  setup();
  const { default: decorate } = await fresh();
  const b = block('team read-more', [member('Brent McGowan'), member('Oliver Williams')]);
  decorate(b);
  assert.deepEqual(collapsed(b), [true, true]);
  const details = b.querySelector('details.team-read-more');
  details.open = true;
  details.dispatchEvent(new window.Event('toggle'));
  assert.equal(b.querySelector('.team-bio').classList.contains('team-bio-collapsed'), false);
});

test('a third cell "Read more" opts one member in; an empty third cell is a placeholder and goes', async () => {
  setup();
  const { default: decorate } = await fresh();
  const b = block('team', [member('Brent McGowan', '<div>Read more</div>'), member('Carl B. Evers, Jr., AFM', '<div></div>')]);
  decorate(b);
  assert.deepEqual(collapsed(b), [true, false]);
  assert.equal(b.textContent.includes('Read moreRead'), false);
  b.querySelectorAll('.team-member').forEach((m) => assert.equal(m.children.length, 2, 'option cell removed on pages'));
});

test('a member bio with a "Read more" link stays content, not an option', async () => {
  setup();
  const { default: decorate } = await fresh();
  const b = block('team', [member('Ann Lee', '<div><a href="/x">Read more</a></div>')]);
  decorate(b);
  assert.deepEqual(collapsed(b), [false]);
});
