/* global globalThis */
/* blocks/table (node --test + jsdom, no browser): a last single-cell row is the caption when it is
   text ("Source: ..."), but a table row when it only holds a link (the odd last strategy of the
   live strategyDetailTable on capabilities/fixed-income). */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

beforeEach(() => {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
});

let n = 0;
const fresh = () => {
  n += 1;
  return import(`../blocks/table/table.js?t=${n}`);
};

function block(cls, rows) {
  const main = document.querySelector('main');
  main.innerHTML = `<div class="${cls}">${rows.map((r) => `<div>${r.map((c) => `<div>${c}</div>`).join('')}</div>`).join('')}</div>`;
  return main.firstElementChild;
}

const link = (t) => `<a href="/institutional/tw/en/strategies/global-fixed-income/${t.toLowerCase().replace(/\W+/g, '-')}">${t}</a>`;

test('a last row with one link and an empty cell stays a table row', async () => {
  const { default: decorate } = await fresh();
  const b = block('table card no-header', [
    [link('Asia Total Return Bond'), link('High Yield')],
    [link('Canadian Core Plus'), link('Preferred Income')],
    [link('China CNY Bond'), ''],
  ]);
  await decorate(b);
  assert.equal(b.querySelectorAll('tbody tr').length, 3);
  assert.equal(b.querySelector('tbody tr:last-child td a').textContent, 'China CNY Bond');
  assert.equal(b.querySelector('figcaption, .table-caption'), null);
});

test('a last single-cell text row is still the caption', async () => {
  const { default: decorate } = await fresh();
  const b = block('table header-row', [['Index', 'Return'], ['A', '1%'], ['Source: Bank of Canada, as of September 30, 2025.', '']]);
  await decorate(b);
  assert.equal(b.querySelectorAll('tbody tr, thead tr').length, 2);
  assert.match(b.textContent, /Source: Bank of Canada/);
  assert.equal([...b.querySelectorAll('td')].some((td) => /Source:/.test(td.textContent)), false, 'the source line is not a cell');
});

test('a row label ending in "as of <date>" keeps the label and puts the date in span.table-date', async () => {
  const { default: decorate } = await fresh();
  const b = block('table header-column', [['Style', 'Multidiscipline'], ['Strategy AUM (CAD) as of 6/30/2026', '$ 9.4 billion']]);
  await decorate(b);
  const th = b.querySelectorAll('th')[1];
  assert.equal(th.querySelector('.table-date').textContent, 'as of 6/30/2026');
  assert.equal(th.textContent, 'Strategy AUM (CAD) as of 6/30/2026');
  assert.equal(b.querySelectorAll('th')[0].querySelector('.table-date'), null);
});

test('the "as of <date>" split also works when the label is one paragraph (DA markup on the live pages)', async () => {
  const { default: decorate } = await fresh();
  const b = block('table header-column', [['<p>Style</p>', '<p>Multidiscipline</p>'], ['<p>Strategy AUM (CAD) as of 6/30/2026</p>', '<p>$ 9.4 billion</p>']]);
  await decorate(b);
  const th = b.querySelectorAll('th')[1];
  assert.equal(th.querySelector('.table-date')?.textContent, 'as of 6/30/2026');
  assert.equal(th.textContent, 'Strategy AUM (CAD) as of 6/30/2026');
  assert.equal(b.querySelectorAll('th')[0].querySelector('.table-date'), null);
});
