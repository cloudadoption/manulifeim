/* global globalThis */
/* section tabs in Canvas (quick-edit): its own process, since scripts/authoring.js decides once
   at import time (node --test + jsdom). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('authoring (Canvas): the tab list block leaves every section visible', async () => {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>', { url: 'https://main--manulifeim--cloudadoption.aem.page/x?quick-edit=main' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const { default: decorate } = await import('../blocks/tabs/tabs.js');
  const main = document.querySelector('main');
  main.innerHTML = `<div><div class="tabs sections"><div><div>Active</div><div>a</div></div><div><div>Strategic</div><div>b</div></div></div></div>
    <div id="a" data-tab="Active"><p>A</p></div><div id="b" data-tab="Strategic"><p>B</p></div>`;
  const block = main.querySelector('.tabs');
  decorate(block);
  assert.equal(block.querySelector('[role=tab]'), null);
  assert.deepEqual([...main.querySelectorAll('[data-tab]')].map((s) => s.hidden), [false, false]);
});
