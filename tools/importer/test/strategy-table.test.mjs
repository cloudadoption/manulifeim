/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests: the live strategyDetailTable (card of strategy links on capabilities/fixed-income
 * and strategies/global-fixed-income) is a Table block (card, no-header) with every row. Before,
 * it fell into default content as a bare <table>, and DA read its first row as the block name
 * ("asia-pacific-investment-grade-bond sgd"). Trimmed live markup inline. No browser, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const importer = join(here, '..');
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const mod = (p) => import(pathToFileURL(join(importer, p)).href);
const { classify } = await mod('utils/page-model.js');
const parse = (await mod('parsers/table.js')).default;

const LIVE = `<div class="strategyDetailTable parbase"><div class="strategyDetailTable__main strategyDetailTable__main--card rtf"><table width="100%" border="1"><tbody>
<tr><td><a href="/institutional/tw/en/strategies/global-fixed-income/asia-pacific-investment-grade-bond-strategy">Asia Pacific Investment Grade Bond (SGD)</a></td><td><a href="/institutional/tw/en/strategies/global-fixed-income/emerging-market-debt">Emerging Markets Debt</a></td></tr>
<tr><td><a href="/institutional/tw/en/strategies/global-fixed-income/asia-total-return-bond">Asia Total Return Bond</a></td><td><a href="/institutional/tw/en/strategies/global-fixed-income/high-yield-fixed-income">High Yield</a></td></tr>
</tbody></table></div></div>`;

test('strategyDetailTable is a table block component', () => {
  const { document } = new JSDOM(`<body>${LIVE}</body>`).window;
  assert.deepEqual(classify(document.querySelector('.strategyDetailTable')), { kind: 'block', name: 'table' });
});

test('parsed as Table (card, no-header) keeping the first row of links', () => {
  const { document } = new JSDOM(`<body>${LIVE}</body>`).window;
  let made;
  globalThis.WebImporter = {
    Blocks: {
      createBlock: (doc, spec) => {
        made = spec;
        return doc.createElement('table');
      },
    },
  };
  parse(document.querySelector('.strategyDetailTable'), { document });
  assert.equal(made.name, 'Table');
  assert.deepEqual(made.variants, ['card', 'no-header']);
  assert.equal(made.cells.length, 2);
  const firstRow = made.cells[0].map((c) => [c].flat().map((n) => n.textContent).join(''));
  assert.deepEqual(firstRow, ['Asia Pacific Investment Grade Bond (SGD)', 'Emerging Markets Debt']);
});
