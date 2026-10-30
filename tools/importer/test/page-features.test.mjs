/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests for the held-page features (video, tabs, strategy data, SafeLinks):
 * page model (utils/page-model.js), parsers video / promo / tabs / strategy-section and the
 * link rules (utils/links.js), on tools/importer/test/fixtures/page-features.html (trimmed live
 * markup built from the snapshots). WebImporter.Blocks.createBlock is a small fake that builds
 * the same block table shape. No browser, no network.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
// utils/links.js imports link-map.json without import attributes (esbuild style)
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const mod = (p) => import(pathToFileURL(join(here, '..', p)).href);
const { classify, itemsFor, markStrategyPanels } = await mod('utils/page-model.js');
const { rewriteLinks, unwrapSafeLink } = await mod('utils/links.js');
const video = (await mod('parsers/video.js')).default;
const promo = (await mod('parsers/promo.js')).default;
const tabs = (await mod('parsers/tabs.js')).default;
const strategy = (await mod('parsers/strategy-section.js')).default;

const FIXTURE = readFileSync(join(here, 'fixtures', 'page-features.html'), 'utf-8');
const PLAYER = 'https://players.brightcove.net/640445594001/1QVD66lj_default/index.html?videoId=6241932992001';
let document;

/* block table like the importer's: header row = name (variants), one row per cells entry */
function createBlock(doc, { name, variants = [], cells }) {
  const table = doc.createElement('table');
  const head = doc.createElement('tr');
  const th = doc.createElement('th');
  th.textContent = variants.length ? `${name} (${variants.join(', ')})` : name;
  head.append(th);
  table.append(head);
  cells.forEach((row) => {
    const tr = doc.createElement('tr');
    row.forEach((value) => {
      const td = doc.createElement('td');
      [].concat(value).forEach((v) => {
        if (v === null || v === undefined || v === '') return;
        td.append(typeof v === 'string' ? doc.createTextNode(v) : v);
      });
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

beforeEach(() => {
  ({ document } = new JSDOM(FIXTURE, { virtualConsole: new VirtualConsole() }).window);
  globalThis.WebImporter = { Blocks: { createBlock } };
});

const blockName = (table) => table.querySelector('tr th').textContent;
const rows = (table) => [...table.querySelectorAll(':scope > tr')].slice(1);

test('page model: videoKicker -> video block; tab sets with figure panels -> tabs, others -> Tab sections; strategyDetail -> its panels', () => {
  assert.deepEqual(classify(document.querySelector('#fx-video .videoKicker')), { kind: 'block', name: 'video' });
  assert.deepEqual(classify(document.querySelector('#fx-tabs .navigationTabs')), { kind: 'block', name: 'tabs' });
  assert.deepEqual(classify(document.querySelector('#fx-tabs-table .navigationTabs')), { kind: 'tabSections' });
  assert.deepEqual(classify(document.querySelector('#fx-strategy .strategyDetail')), { kind: 'strategy' });
  const items = itemsFor(document, [document.querySelector('#fx-strategy .strategyDetail')]);
  // every <hr> is a divider item (repeats collapse into one Style: divider in toSections)
  assert.deepEqual(items.map((i) => i.type).filter((t) => t !== 'divider'), ['sectionBreak', 'block', 'sectionBreak', 'block', 'block']);
  items.forEach((it, k) => {
    if (it.type === 'block') assert.equal(items[k - 1].type, 'divider', 'a divider before each panel');
  });
  assert.deepEqual(items.filter((i) => i.type === 'block').map((i) => i.name), ['strategy-section', 'strategy-section', 'strategy-section']);
  assert.equal(items[0].el.getAttribute('data-section'), 'Key facts');
});

test('strategy panel breaks and dividers survive the importer preProcess (it drops <hr> and empty <a>)', () => {
  markStrategyPanels(document);
  // what helix-importer's preProcess does before the transform: cleanup + reviewInlineElement('a')
  document.querySelectorAll('hr').forEach((n) => n.remove());
  document.querySelectorAll('a').forEach((a) => { if (a.textContent === '') a.remove(); });
  assert.equal(document.querySelectorAll('#fx-strategy a.sectionBreak, #fx-strategy hr').length, 0);
  const items = itemsFor(document, [document.querySelector('#fx-strategy .strategyDetail')]);
  const kinds = items.map((i) => i.type).filter((t, k, a) => !(t === 'divider' && a[k - 1] === 'divider'));
  assert.deepEqual(kinds, ['divider', 'sectionBreak', 'block', 'divider', 'sectionBreak', 'block', 'divider', 'block', 'divider']);
  const breaks = items.filter((i) => i.type === 'sectionBreak').map((i) => [i.el.id, i.el.getAttribute('data-section')]);
  assert.deepEqual(breaks, [['key-facts', 'Key facts'], ['performance', 'Performance']]);
});

test('video parser: poster, Brightcove player URL and caption in one cell (EDS library Video)', () => {
  const el = document.querySelector('#fx-video .videoKicker');
  video(el, { document });
  const table = document.querySelector('#fx-video table');
  assert.equal(blockName(table), 'Video');
  const [row] = rows(table);
  assert.equal(rows(table).length, 1);
  assert.equal(row.children.length, 1);
  const cell = row.firstElementChild;
  assert.ok(cell.querySelector('img'), 'poster');
  assert.equal(cell.querySelector('a').getAttribute('href'), PLAYER);
  assert.equal(cell.querySelectorAll('p')[1].textContent, 'Building the case for healthy real estate webinar');
});

test('video parser: without a video id the component stays default content', () => {
  const el = document.querySelector('#fx-video .videoKicker');
  el.querySelector('[data-videomodal]').removeAttribute('data-videomodal');
  video(el, { document });
  assert.equal(document.querySelector('#fx-video table'), null);
  assert.ok(document.querySelector('#fx-video img'));
});

test('promo parser: a video banner links "Watch now" to the player and adds the transcript', () => {
  promo(document.querySelector('#fx-promo .simpleBanner'), { document });
  const links = [...document.querySelectorAll('#fx-promo a')];
  assert.equal(links[0].textContent.trim(), 'Watch now');
  assert.equal(links[0].getAttribute('href'), 'https://players.brightcove.net/640445594001/33YR0rw7vm_default/index.html?videoId=6367885612112');
  assert.equal(links[1].textContent, 'Transcript');
  assert.match(links[1].getAttribute('href'), /^https:\/\/www\.manulifeim\.com\/content\/dam\/.*\.srt$/);
});

test('tabs parser: one row per panel, label | figure text + image (EDS library Tabs)', () => {
  tabs(document.querySelector('#fx-tabs .navigationTabs'), { document });
  const table = document.querySelector('#fx-tabs table');
  assert.equal(blockName(table), 'Tabs');
  const r = rows(table);
  assert.deepEqual(r.map((tr) => tr.children[0].textContent), ['Inflation targets', 'Terminal rates']);
  assert.equal(r[0].children.length, 2);
  assert.equal(r[0].children[1].querySelector('h4').textContent, 'Is 2% the right target?');
  assert.ok(r[0].children[1].querySelector('img'));
});

test('strategy-section parser: Key facts and data tables as Table blocks, disclosure as Disclosure', () => {
  const [facts, perf] = document.querySelectorAll('#fx-strategy section.strategyDetail__section');
  strategy(facts, { document });
  strategy(perf, { document });
  const tables = [...document.querySelectorAll('#fx-strategy table')];
  const names = tables.map(blockName);
  assert.deepEqual(names, ['Table (header-column)', 'Table (header-row-column)', 'Disclosure (inset)']);
  const factRows = rows(tables[0]).map((tr) => [...tr.children].map((c) => c.textContent));
  assert.deepEqual(factRows[0], ['Style', 'Multidiscipline']);
  assert.ok(factRows.some(([k]) => k === 'Benchmark'));
  const perfRows = rows(tables[1]);
  assert.equal(perfRows[0].children[1].textContent.trim(), '3 Month');
  assert.equal(perfRows[1].children[0].textContent.trim(), 'Strategy composite gross');
  assert.equal(tables[1].querySelector('i'), null, 'legend swatches dropped');
  const disc = rows(tables[2])[0];
  assert.equal(disc.children[0].textContent, 'Important Disclosures');
  assert.match(disc.children[1].textContent, /Past performance is not indicative of future results/);
  const headings = [...document.querySelectorAll('#fx-strategy h2')].map((h) => h.textContent);
  assert.deepEqual(headings, ['Key facts', 'Performance']);
});

test('strategy-section parser: a chart-only panel keeps heading, date and disclosure, no table', () => {
  const sections = document.querySelectorAll('#fx-strategy section.strategyDetail__section');
  const chart = sections[sections.length - 1];
  strategy(chart, { document });
  const root = document.querySelector('#fx-strategy .strategyDetail__root');
  const h2 = [...root.querySelectorAll('h2')].find((h) => h.textContent === 'Risk and return');
  assert.ok(h2);
  assert.match(h2.nextElementSibling.textContent, /^as of /);
  const after = [...root.querySelectorAll('table')].filter((t) => h2.compareDocumentPosition(t) & 4); // eslint-disable-line no-bitwise
  assert.deepEqual(after.map(blockName), ['Disclosure (inset)']);
});

test('links: SafeLinks unwrapped to the original URL; multi-line Outlook titles dropped, other titles kept', () => {
  assert.equal(unwrapSafeLink('https://can01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1&data=x'), 'https://example.org/a?b=1');
  assert.equal(unwrapSafeLink('https://example.org/?url=https%3A%2F%2Fevil.example'), 'https://example.org/?url=https%3A%2F%2Fevil.example');
  assert.equal(unwrapSafeLink('https://eur01.safelinks.protection.outlook.com/?url=javascript%3Aalert(1)'), 'https://eur01.safelinks.protection.outlook.com/?url=javascript%3Aalert(1)');
  const root = document.querySelector('#fx-safelinks');
  rewriteLinks(root, { unmigrated: new Map(), rules: {} });
  const [power, kept] = root.querySelectorAll('a');
  assert.equal(power.getAttribute('href'), 'https://milkeninstitute.org/events/asia-summit-2024/power-of-ideas');
  assert.equal(power.hasAttribute('title'), false);
  assert.equal(power.textContent, 'Power of Ideas');
  assert.equal(kept.getAttribute('title'), 'Plain title');
});
