/* eslint-disable max-len, import/extensions, import/no-extraneous-dependencies, object-curly-newline */
/* global globalThis */
/*
 * Offline tests for tools/importer/strategy-charts.mjs: chart figures as Table blocks (one per
 * view), the live "Others (n)" rule, the toggles/legend read from a captured page, insertion
 * into an imported strategy page, and the result decorated by blocks/table. Small inline feed
 * in the fund-data response shape; no browser, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';
import {
  liveDate, compositionRows, riskRows, liveViews, addChartTables, RISK, COMPOSITION,
} from '../strategy-charts.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const comp = (dataElement, pairs, date = '2026-09-30') => pairs.map(([label, value]) => ({
  label, dataElement, dataGrouping: 'Fund_MV%', value, date,
}));
const SHARE_CLASS = {
  id: 'S9999',
  name: 'Sample Fixed Income Strategy',
  strategyData: { compPrimaryBenchmarkName: 'Sample Bond Index' },
  performance: {
    dates: { asOfDate: '2026-09-30' },
    returns: [
      { dataElement: 'Fund_Return_Net', year3: 0.054901, year5: 0.008522, year7: null, year10: 0.016432 },
      { dataElement: 'Primary_Benchmark_Return', year3: 0.047451, year5: 0.00295, year7: 0.007041, year10: null },
    ],
  },
  riskMeasures: {
    dates: { asOfDate: '2026-09-30' },
    returns: [
      { dataElement: 'std_dev_ratio_3YR', fundValue: 0.051463, indexValue: 0.048866 },
      { dataElement: 'std_dev_ratio_5YR', fundValue: 0.062694, indexValue: 0.06077 },
      { dataElement: 'std_dev_ratio_7YR', fundValue: 0.059864, indexValue: 0.057962 },
      { dataElement: 'std_dev_ratio_10YR', fundValue: 0.054253, indexValue: 0.052812 },
    ],
  },
  compositions: {
    dates: { asOfDate: '2026-09-30' },
    returns: [
      ...comp('Sector', [['Federal', 16.59], ['Corporate', 48.45], ['Cash & Cash Equivalents', 0.32], ['Provincial', 34.64]]),
      // live Canadian Corporate Plus: Cash -3.19 and FX -1.42 stay, HEDGING -0.33 goes to Others
      ...comp('Credit_Quality', [['BBB', 60.5], ['Cash & Cash Equivalents', -3.19], ['FX', -1.42], ['NR', 0.39], ['HEDGING', -0.33], ['A', 43.05]]),
      ...comp('Geography', [['Canada', 89.68], ['United States', 8.62], ['France', 0.76], ['SUPR', 0.02], ['N/A', -0.06], ['Eurozone', 0], ['Australia', 0.98]]),
      ...comp('Geography', [['Canada', 50], ['Japan', 50]], '2026-06-30'),
    ],
  },
};

const SNAPSHOT = `<div class="strategyDetail__chartHeader"><h3>Risk and return</h3><small>as of 9/30/2026</small>
  <div class="strategyDetail__chartButtons"><button aria-selected="true">3 years</button><button>5 years</button><button>7 years</button><button>10 years</button></div></div>
  <div class="plotChart__legend"><svg><text>Sample Fixed Income Strategy (Net)</text><text>Sample Fixed Income Strategy (Net)</text><text>Sample Bond Index</text></svg></div>
  <div class="strategyDetail__chartHeader"><h3>Composition</h3><small>as of 9/30/2026</small>
  <div class="strategyDetail__chartButtons"><button aria-selected="true">Sector</button><button>Geography</button><button>Credit Quality</button></div></div>`;

const PAGE = '<div><h2 id="risk-and-return">Risk and return</h2><p>as of 9/30/2026</p><div class="disclosure inset"><div><div>Important Disclosures</div><div><p>…</p></div></div></div></div>'
  + '<div><h2 id="composition">Composition</h2><p>as of 9/30/2026</p><div class="section-metadata"><div><div>Style</div><div>divider</div></div></div></div>';

const doc = (html = PAGE) => new JSDOM(`<body>${html}</body>`).window.document;

test('liveDate: ISO date in the chart subheading format', () => {
  assert.equal(liveDate('2026-09-30'), '9/30/2026');
  assert.equal(liveDate('2025-01-05'), '1/5/2025');
  assert.equal(liveDate(undefined), '');
});

test('compositionRows: largest first, zero slices dropped, two or more under 1% fold into Others (n)', () => {
  const geo = compositionRows(SHARE_CLASS, 'Geography');
  assert.deepEqual(geo.map((r) => r.label), ['Canada', 'United States', 'Others (4)']);
  assert.deepEqual(geo[2].members.map((m) => m.label), ['Australia', 'France', 'SUPR', 'N/A']);
  assert.equal(geo[2].value.toFixed(2), '1.70');
  // a single slice under 1% stays on its own (live Canadian Long Duration: Cash 0.32)
  assert.deepEqual(compositionRows(SHARE_CLASS, 'Sector').map((r) => r.label), ['Corporate', 'Provincial', 'Federal', 'Cash & Cash Equivalents']);
  assert.deepEqual(compositionRows(SHARE_CLASS, 'Credit_Quality').map((r) => `${r.label} ${r.value.toFixed(2)}`), ['BBB 60.50', 'A 43.05', 'FX -1.42', 'Cash & Cash Equivalents -3.19', 'Others (2) 0.06']);
  assert.deepEqual(compositionRows(SHARE_CLASS, 'Asset_Mix'), []);
  assert.deepEqual(compositionRows({}, 'Sector'), []);
});

test('riskRows: net return and standard deviation per period, legend names first, dash for a missing benchmark value', () => {
  assert.deepEqual(riskRows(SHARE_CLASS, 3), [
    ['Sample Fixed Income Strategy (Net)', '5.49%', '5.15%'],
    ['Sample Bond Index', '4.75%', '4.89%'],
  ]);
  assert.deepEqual(riskRows(SHARE_CLASS, 10, ['Live name (Net)', 'Live index'])[1], ['Live index', '–', '5.28%']);
  assert.equal(riskRows(SHARE_CLASS, 7), null, 'no strategy return: no table');
});

test('liveViews: chart toggles per chart heading and the risk legend names', () => {
  const live = liveViews(SNAPSHOT);
  assert.deepEqual(live.views[RISK], ['3 years', '5 years', '7 years', '10 years']);
  assert.deepEqual(live.views[COMPOSITION], ['Sector', 'Geography', 'Credit Quality']);
  assert.deepEqual(live.names, ['Sample Fixed Income Strategy (Net)', 'Sample Bond Index']);
});

test('addChartTables: one table per view after the as-of line; re-running adds nothing', () => {
  const d = doc();
  const report = addChartTables(d, SHARE_CLASS, liveViews(SNAPSHOT));
  assert.deepEqual(report, [
    'Risk and return: 3 tables (3 years, 5 years, 10 years)',
    'Composition: 3 tables (Sector, Geography, Credit Quality)',
  ]);
  const [risk, compSection] = d.body.children;
  assert.deepEqual([...risk.children].map((e) => e.className || e.tagName), ['H2', 'P', 'table header-row-column', 'table header-row-column', 'table header-row-column', 'disclosure inset']);
  assert.deepEqual([...compSection.children].map((e) => e.className || e.tagName), ['H2', 'P', 'table header-column', 'table header-column', 'table header-column', 'section-metadata']);
  const geo = compSection.querySelectorAll('.table')[1];
  assert.equal(geo.lastElementChild.textContent, 'as of 9/30/2026. Others (4): Australia 0.98%, France 0.76%, SUPR 0.02%, N/A -0.06%');
  const before = d.body.innerHTML;
  assert.deepEqual(addChartTables(d, SHARE_CLASS, liveViews(SNAPSHOT)), ['Risk and return: has a table, left as is', 'Composition: has a table, left as is']);
  assert.equal(d.body.innerHTML, before);
});

test('addChartTables: an imported live fallback table is replaced only when it holds the default view figures', () => {
  const fallback = (rows) => `<div><h2 id="composition">Composition</h2><p>as of 9/30/2026</p><div class="table header-row-column"><div><div></div><div>Value</div></div>${rows.map(([l, v]) => `<div><div>${l}</div><div>${v}</div></div>`).join('')}</div></div>`;
  const live = liveViews(SNAPSHOT);
  const same = doc(fallback([['Cash &amp; Cash Equivalents', '0.32'], ['Corporate', '48.45'], ['Federal', '16.59'], ['Provincial', '34.64']]));
  assert.deepEqual(addChartTables(same, SHARE_CLASS, live).slice(1), [
    'Composition: imported live fallback table equals the default view, replaced',
    'Composition: 3 tables (Sector, Geography, Credit Quality)',
  ]);
  assert.equal(same.querySelectorAll('.table').length, 3);
  assert.equal(same.querySelector('.table h3').textContent, 'Sector');
  const differs = doc(fallback([['Corporate', '48.45'], ['Federal', '16.60']]));
  const before = differs.body.innerHTML;
  assert.deepEqual(addChartTables(differs, SHARE_CLASS, live).slice(1), ['Composition: has a table, left as is']);
  assert.equal(differs.body.innerHTML, before);
});

test('addChartTables: missing sections and data are reported, not invented', () => {
  const d = doc('<div><h2>Overview</h2></div>');
  assert.deepEqual(addChartTables(d, SHARE_CLASS, {}), ['Risk and return: section not found', 'Composition: section not found']);
  const e = doc();
  assert.deepEqual(addChartTables(e, { name: 'X' }, { views: { [COMPOSITION]: ['Sector'] } }), ['Risk and return: no data', 'Composition: no data']);
  assert.equal(e.querySelectorAll('.table').length, 0);
});

test('the tables decorate with blocks/table: title, header row and column, caption', async () => {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const { default: decorate } = await import(pathToFileURL(join(repo, 'blocks/table/table.js')).href);
  const main = document.querySelector('main');
  main.innerHTML = PAGE;
  addChartTables(document, SHARE_CLASS, liveViews(SNAPSHOT));
  const [risk, compTable] = [main.querySelector('.table.header-row-column'), main.querySelector('.table.header-column')];
  decorate(risk);
  decorate(compTable);
  assert.equal(risk.querySelector('.table-title h3').textContent, '3 years');
  assert.deepEqual([...risk.querySelectorAll('tr:first-child th')].map((t) => t.textContent), ['', 'Annualized net strategy return', 'Annualized net standard deviation']);
  assert.equal(risk.querySelector('tr:nth-child(2) th[scope=row]').textContent, 'Sample Fixed Income Strategy (Net)');
  assert.equal(risk.querySelector('tr:nth-child(2) td').dataset.title, 'Annualized net strategy return');
  assert.equal(risk.querySelector('.table-caption').textContent, 'as of 9/30/2026');
  assert.equal(compTable.querySelector('.table-title h3').textContent, 'Sector');
  assert.deepEqual([...compTable.querySelectorAll('tr')].map((r) => [...r.children].map((c) => `${c.tagName}:${c.textContent}`).join(' ')), [
    'TH:Corporate TD:48.45%', 'TH:Provincial TD:34.64%', 'TH:Federal TD:16.59%', 'TH:Cash & Cash Equivalents TD:0.32%',
  ]);
});
