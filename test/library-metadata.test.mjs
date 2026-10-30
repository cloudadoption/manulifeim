/* eslint-disable import/no-unresolved, import/extensions */
/* global globalThis */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!DOCTYPE html><body></body>');
globalThis.document = window.document;
const { default: decorate } = await import('../blocks/library-metadata/library-metadata.js');

test('library-metadata: hidden in rendered pages, kept in the DOM for DA', () => {
  document.body.innerHTML = `<main><div class="section">
    <div class="promo-wrapper"><div class="promo navy block"><div><div>Promo</div></div></div></div>
    <div class="library-metadata-wrapper"><div class="library-metadata block">
      <div><div>description</div><div>Coloured promotion</div></div>
      <div><div>fields</div><div>Image | Heading</div></div>
    </div></div>
  </div></main>`;
  const block = document.querySelector('.library-metadata');
  decorate(block);
  assert.equal(block.hidden, true);
  assert.equal(block.parentElement.hidden, true, 'wrapper hidden so it adds no section padding');
  assert.ok(document.querySelector('.library-metadata'), 'block stays in the DOM');
  assert.equal(document.querySelector('.promo').hidden, false, 'the example block stays visible');
});

test('library-metadata: a block without its wrapper is still hidden', () => {
  const block = document.createElement('div');
  block.className = 'library-metadata block';
  document.body.replaceChildren(block);
  decorate(block);
  assert.equal(block.hidden, true);
  assert.equal(document.body.hidden, false);
});
