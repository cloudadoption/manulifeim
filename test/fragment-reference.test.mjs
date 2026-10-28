import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../scripts/scripts.js', import.meta.url), 'utf8');
const expression = source.match(/const fragments = (.*);/)?.[1];
assert.ok(expression, 'the auto-fragment selection must be found');

function select(html) {
  const main = new JSDOM(`<main>${html}</main>`, {
    url: 'https://guide-links--manulifeim--cloudadoption.aem.page/migration-status/author-guide',
  }).window.document.querySelector('main');
  return Array.from(vm.runInNewContext(expression, { main })).map((a) => a.textContent);
}

test('keeps DA editor and other fragment-looking hash links as ordinary links', () => {
  assert.deepEqual(select('<a href="https://da.live/canvas#/cloudadoption/manulifeim/institutional/tw/en/fragments/attestation">DA editor</a><a href="#/fragments/example">Hash</a><a href="https://example.com/?path=/fragments/example">Query</a>'), []);
});

test('still embeds actual fragment paths and excludes already-authored fragment blocks', () => {
  assert.deepEqual(select('<a href="/institutional/tw/en/fragments/attestation">Relative fragment</a><a href="https://main--manulifeim--cloudadoption.aem.page/institutional/tw/en/fragments/attestation">Absolute fragment</a><div class="fragment"><a href="/institutional/tw/en/fragments/attestation">Existing block</a></div>'), ['Relative fragment', 'Absolute fragment']);
});
