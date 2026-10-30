/* blocks/tabs in Canvas (quick-edit): its own process, since scripts/authoring.js decides once
   at import time (node --test + jsdom). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('authoring (Canvas): rows stay as authored, all visible', async () => {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>', { url: 'https://main--manulifeim--cloudadoption.aem.page/x?quick-edit=main' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const { default: decorate } = await import('../blocks/tabs/tabs.js');
  const main = document.querySelector('main');
  main.innerHTML = `<div class="tabs">
    <div><div>Inflation targets</div><div><p>Is 2% the right target?</p></div></div>
    <div><div>Terminal rates</div><div><p>Higher for longer?</p></div></div></div>`;
  const block = main.querySelector('.tabs');
  decorate(block);
  assert.equal(block.querySelector('[role=tab]'), null);
  assert.equal(block.querySelectorAll('.tabs-item').length, 2);
  assert.equal(block.textContent.includes('Higher for longer?'), true);
});
