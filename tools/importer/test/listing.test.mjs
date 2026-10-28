/* eslint-disable import/no-unresolved, import/extensions, no-console, max-len */
/*
 * Browser-free tests for the listing / search logic and blocks.
 *
 *   node --test tools/importer/test/listing.test.mjs
 *
 * Data: tools/importer/test/fixtures/ (committed, so `npm test` runs on a fresh clone):
 * query-index.json and query-index-people.json copied from migration-work/fake-index
 * (node tools/importer/build-fake-index.mjs), live-fixed-income-order.json read once from
 * the live snapshot. Synthetic rows for press, case studies, documents and people (the
 * snapshots hold one page of each). DOM tests run the real blocks in jsdom (devDependency)
 * with fetch served from those rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const FIXTURES = join(here, 'fixtures');

const core = await import(pathToFileURL(join(repo, 'scripts/listing-core.js')).href);

const ROOT = '/institutional/tw/en';
const readJson = (f) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf-8'));
const allRows = readJson('query-index.json').data;
// query-index-viewpoints.json is the viewpoint subset of the main index, in the same order
const vpRows = allRows.filter((r) => r.template === 'viewpoint');
const viewpoints = vpRows.map(core.normalizeEntry).filter(core.VARIANT_BASE.viewpoints);

/* ---------- synthetic rows for the thin snapshot types ---------- */
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const pressRows = Array.from({ length: 25 }, (_, i) => ({
  path: `${ROOT}/about-us/press-releases/release-${i + 1}`,
  title: `Release ${i + 1}`,
  template: 'press-release',
  publicationDate: iso(2026, 1 + (i % 12), 1 + i),
  publicationTimestamp: core.isoToSeconds(iso(2026, 1 + (i % 12), 1 + i)),
  category: i < 15 ? 'press-releases' : 'archive',
}));
const csThemes = ['natural-resources', 'timber', 'agriculture', 'biodiversity'];
const csTopics = ['environmental', 'social', 'governance'];
const label = (s) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const csRows = Array.from({ length: 20 }, (_, i) => {
  const theme = csThemes[i % 4];
  const topic = csTopics[i % 3];
  return {
    path: `${ROOT}/sustainable-investing-case-studies/${topic}/case-${i + 1}`,
    title: `Case ${i + 1}`,
    template: 'case-study-detail',
    image: `/img/case-${i + 1}.jpg`,
    tags: JSON.stringify([label(theme), label(topic)]),
    tagSlugs: `themes/${theme}, topics/${topic}`,
    theme: topic,
    topic,
    lastModified: 1700000000 + i * 1000,
  };
});
const docRows = [
  ...Array.from({ length: 8 }, (_, i) => ({
    path: `${ROOT}/resources/documents/doc-${i + 1}`, title: `Global macro outlook ${i + 1}`, template: 'plain', documentUrl: `https://www.manulifeim.com/content/dam/doc-${i + 1}.pdf`, lastModified: 1700000000 + i,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    path: `${ROOT}/resources/fact-sheets/fs-${i + 1}`, title: `Equity fact sheet ${i + 1}`, template: 'plain', lastModified: 1600000000 + i,
  })),
];
const peopleRows = readJson('query-index-people.json').data.concat([
  { path: `${ROOT}/consultant-team/greg-thompson`, title: 'Greg Thompson', position: 'Head of Consultant Relations', template: 'plain' },
  { path: `${ROOT}/consultant-team/brian-torrisi`, title: 'Brian Torrisi', position: 'Consultant Relations', template: 'plain' },
]);

const SOURCES = {
  'query-index.json': allRows,
  // + one synthetic article by Frances Donald (she has a person page with a bio in the snapshots)
  'query-index-viewpoints.json': vpRows.concat([{
    path: `${ROOT}/viewpoints/market-outlook/synthetic-frances-donald`,
    title: 'Synthetic outlook',
    template: 'viewpoint',
    publicationDate: '2024-01-10',
    authorDetails: JSON.stringify([{
      name: 'Frances Donald', title: 'Global Chief Economist and Strategist', company: 'Manulife Investment Management', photo: '', slug: 'frances-donald',
    }]),
    categorySlug: 'market-outlook',
  }]),
  'query-index-press.json': pressRows,
  'query-index-case-studies.json': csRows,
  'query-index-resources.json': docRows,
  'query-index-people.json': peopleRows,
};

/* ---------- pure logic ---------- */

test('normalizeEntry: viewpoint row from the fake index', () => {
  const it = viewpoints.find((v) => v.path.endsWith('/india-bonds-from-specialist-exposure-to-strategic-allocation'));
  assert.ok(it, 'india bonds article in fake index');
  assert.equal(it.categorySlug, 'fixed-income');
  assert.equal(it.authors.length, 2);
  assert.equal(it.authors[1].slug, 'Dylan-Ngai-CFA');
  assert.equal(it.authors[0].title, 'Head of Asia Fixed Income, Senior Portfolio Manager');
  assert.deepEqual(it.tags.slice(0, 2), ['Emerging markets', 'Fixed income']);
  assert.equal(it.tagSlugs.length, it.tags.length);
  assert.equal(core.formatLongDate(it.ts), 'September 23, 2026');
  assert.equal(core.formatShortDate(it.ts), '23/09/2026');
});

test('filters: category, tag, assetManager, author (case-insensitive slug), path', () => {
  const fi = core.applyFilters(viewpoints, core.parseFilter('category=fixed-income'));
  assert.ok(fi.length > 50 && fi.every((v) => v.categorySlug === 'fixed-income'));
  const asia = core.applyFilters(viewpoints, { tag: ['asia'] });
  assert.ok(asia.length > 0 && asia.every((v) => v.tagSlugs.includes('asia')));
  const both = core.applyFilters(viewpoints, core.parseFilter('category=fixed-income&tag=asia'));
  assert.ok(both.length <= Math.min(fi.length, asia.length) && both.length > 0);
  const dylan = core.applyFilters(viewpoints, { author: ['dylan-ngai-cfa'] });
  assert.ok(dylan.length >= 1 && dylan.every((v) => v.authors.some((a) => a.name.startsWith('Dylan Ngai'))));
  const am = core.applyFilters(viewpoints, { assetManager: ['manulife-investment-management'] });
  assert.ok(am.length > 0);
  const none = core.applyFilters(viewpoints, { tag: ['no-such-tag'] });
  assert.equal(none.length, 0);
  const params = new URLSearchParams('?Tag=asia&author=x&foo=1&assetManager=a,b');
  assert.deepEqual(core.filtersFromParams(params, ['tag', 'assetManager']), { tag: ['asia'], assetManager: ['a', 'b'] });
});

test('sort newest + paging match the live fixed-income page order', () => {
  const sorted = core.sortItems(core.applyFilters(viewpoints, { category: ['fixed-income'] }), 'newest');
  for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i - 1].sortTs >= sorted[i].sortTs);
  // live page 1 (10 newest) restricted to the articles we have snapshots of keeps its order
  const live = readJson('live-fixed-income-order.json').paths.map((p) => p.toLowerCase());
  assert.equal(live.length, 10);
  const ours = sorted.map((v) => v.path.toLowerCase()).filter((p) => live.includes(p));
  const liveKnown = live.filter((p) => ours.includes(p));
  assert.deepEqual(ours.slice(0, liveKnown.length), liveKnown, 'relative order equals live');
  const page = core.paginate(sorted, 1, 10);
  assert.equal(page.items.length, 10);
  assert.equal(page.pages, Math.ceil(sorted.length / 10));
  assert.equal(core.paginate(sorted, 999, 10).page, page.pages, 'page clamps to last');
  assert.equal(core.paginate([], 3, 10).page, 1);
});

test('pageWindow / pagerWindow', () => {
  assert.deepEqual(core.pageWindow(1, 13), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(core.pageWindow(10, 40), [1, '…', 8, 9, 10, 11, 12, '…', 40]);
  assert.deepEqual(core.pageWindow(2, 40), [1, 2, 3, 4, '…', 40]);
  assert.deepEqual(core.pagerWindow(1, 169), [1, 2, 3, 4, 5]);
  assert.deepEqual(core.pagerWindow(169, 169), [165, 166, 167, 168, 169]);
  assert.deepEqual(core.pagerWindow(2, 3), [1, 2, 3]);
});

test('press: category filter + paging', () => {
  const items = pressRows.map(core.normalizeEntry).filter(core.VARIANT_BASE.press);
  const pr = core.sortItems(core.applyFilters(items, { category: ['press-releases'] }), 'newest');
  assert.equal(pr.length, 15);
  assert.equal(core.paginate(pr, 2, 10).items.length, 5);
  assert.equal(core.applyFilters(items, { category: ['archive'] }).length, 10);
  assert.equal(core.applyFilters(items, { category: ['other'] }).length, 0);
});

test('case studies: theme / topic via AEM tag ids, groups, oldest sort', () => {
  const real = core.normalizeEntry(allRows.find((r) => r.template === 'case-study-detail'));
  assert.deepEqual(real.groups.themes, ['natural-resources', 'timber', 'biodiversity', 'agriculture']);
  assert.ok(core.matchFilter(real, 'theme', ['timber']));
  assert.ok(core.matchFilter(real, 'topic', ['environmental']));
  assert.ok(!core.matchFilter(real, 'topic', ['social']));
  const items = csRows.map(core.normalizeEntry);
  assert.equal(core.applyFilters(items, { theme: ['timber'] }).length, 5);
  assert.equal(core.applyFilters(items, { theme: ['timber'], topic: ['social'] }).length, 2);
  assert.equal(core.applyFilters(items, core.parseFilter(`path=${ROOT}/sustainable-investing-case-studies/governance`)).length, 6);
  const themes = core.groupValues(items, 'themes');
  assert.deepEqual(themes.map((t) => t.label), ['Agriculture', 'Biodiversity', 'Natural resources', 'Timber']);
  assert.equal(themes.find((t) => t.value === 'timber').count, 5);
  const oldest = core.sortItems(items, 'oldest');
  assert.equal(oldest[0].title, 'Case 1');
});

test('documents: type and free text', () => {
  const items = docRows.map(core.normalizeEntry).filter(core.VARIANT_BASE.documents);
  assert.equal(items.length, 12);
  assert.equal(core.applyFilters(items, { type: ['fact-sheets'] }).length, 4);
  assert.equal(core.applyFilters(items, { q: ['macro outlook'] }).length, 8);
  assert.equal(core.applyFilters(items, { q: ['equity'], type: ['documents'] }).length, 0);
});

test('search: relevance, facets, dependent facets, paging', () => {
  const items = allRows.map(core.normalizeEntry);
  const r = core.runSearch(items, { q: 'india bonds', size: 10 });
  assert.ok(r.total >= 1);
  assert.match(r.items[0].title, /India bonds/);
  const all = core.runSearch(items, { q: '' });
  assert.equal(all.total, items.length);
  assert.ok(all.counts.type.find((c) => c.value === 'Viewpoint').count >= 150);
  assert.equal(all.counts.author, undefined, 'author facet only after a page type is chosen');
  const typed = core.runSearch(items, { q: '', facets: { type: ['Viewpoint'] } });
  assert.ok(typed.counts.author.length > 10);
  assert.ok(typed.items.every((it) => core.pageType(it) === 'Viewpoint'));
  const byAuthor = core.runSearch(items, { q: '', facets: { type: ['Viewpoint'], author: ['Dylan Ngai'] } });
  assert.ok(byAuthor.total >= 1 && byAuthor.items.every((it) => it.authors.some((a) => a.name.startsWith('Dylan Ngai'))));
  const az = core.runSearch(items, { q: 'fixed income', sort: 'title' });
  for (let i = 1; i < az.items.length; i += 1) assert.ok(az.items[i - 1].title.localeCompare(az.items[i].title, 'en', { sensitivity: 'base' }) <= 0);
  assert.equal(core.runSearch(items, { q: 'zzzxqv' }).total, 0);
  const p2 = core.runSearch(items, { q: '', page: 2, size: 25 });
  assert.equal(p2.start, 26);
  assert.equal(p2.items.length, 25);
});

/* ---------- DOM: the real blocks in jsdom ---------- */

let aemReady = false;
async function setupDom(url, bodyHtml) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`, { url: `http://localhost${url}`, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  // the blocks use the window's AbortController (event listener `signal`), not Node's
  globalThis.AbortController = w.AbortController;
  globalThis.fetch = async (input) => {
    const u = new URL(String(input), 'http://localhost');
    const rows = SOURCES[u.pathname.split('/').pop()];
    if (!rows) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ total: rows.length, offset: 0, limit: rows.length, data: rows }) };
  };
  if (!aemReady) {
    w.hlx = { codeBasePath: '' };
    aemReady = true;
  }
  return w;
}

function blockHtml(name, variant, rows) {
  const r = rows.map(([k, v]) => `<div><div>${k}</div><div>${v}</div></div>`).join('');
  return `<main><div class="section"><div class="default-content-wrapper"><h1>All viewpoints</h1></div><div class="${name}-wrapper"><div class="${name} ${variant}">${r}</div></div></div></main>`;
}

const listing = async () => (await import(pathToFileURL(join(repo, 'blocks/listing/listing.js')).href)).default;
const search = async () => (await import(pathToFileURL(join(repo, 'blocks/search/search.js')).href)).default;

test('DOM listing (viewpoints): ?tag= filter, heading, pagination with replaceState', async () => {
  const w = await setupDom(`${ROOT}/viewpoints/all?tag=asia`, blockHtml('listing', 'viewpoints', [['Source', `${ROOT}/query-index-viewpoints.json`], ['Limit', '10']]));
  const decorate = await listing();
  const block = w.document.querySelector('.listing');
  await decorate(block);
  const items = block.querySelectorAll('.listing-vp-item');
  assert.equal(items.length, 10);
  assert.equal(w.document.querySelector('h1').textContent, 'Asia');
  const first = items[0].querySelector('.listing-vp-title-link').getAttribute('href');
  assert.ok(items[0].querySelector('.listing-vp-date time').getAttribute('datetime'));
  assert.ok(block.querySelector('.listing-vp-info .listing-author-name'));
  const next = [...block.querySelectorAll('.listing-pagination-direction')].find((a) => a.textContent === 'Next');
  assert.equal(next.getAttribute('href'), `${ROOT}/viewpoints/all?tag=asia&page=2`);
  next.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(w.location.search, '?tag=asia&page=2');
  assert.notEqual(block.querySelector('.listing-vp-title-link').getAttribute('href'), first);
  assert.equal(block.querySelector('.listing-pagination-item.current').textContent, '2');
});

test('DOM listing (viewpoints): ?author= header, category filter, empty state', async () => {
  let w = await setupDom(`${ROOT}/viewpoints/all?author=Dylan-Ngai-CFA`, blockHtml('listing', 'viewpoints', []));
  let decorate = await listing();
  let block = w.document.querySelector('.listing');
  await decorate(block);
  const header = w.document.querySelector('.listing-author-header');
  assert.ok(header, 'author header');
  assert.equal(header.querySelector('.listing-author-header-name').textContent, 'Dylan Ngai');
  assert.match(header.querySelector('.listing-author-header-title').textContent, /Client Portfolio Manager/);
  assert.ok(block.querySelectorAll('.listing-vp-item').length >= 1);

  w = await setupDom(`${ROOT}/viewpoints/all?author=frances-donald`, blockHtml('listing', 'viewpoints', []));
  decorate = await listing();
  block = w.document.querySelector('.listing');
  await decorate(block);
  // bio from the people index when the author has a person page
  const bio = w.document.querySelector('.listing-author-header-bio');
  assert.ok(bio && /forecasting/.test(bio.textContent), 'bio from the people index');
  assert.equal(w.document.querySelector('.listing-author-header-more').getAttribute('href'), `${ROOT}/authors/frances-donald`);
  assert.equal(w.document.querySelector('h1').textContent, 'Frances Donald');

  w = await setupDom(`${ROOT}/viewpoints/equity?tag=no-such-tag`, blockHtml('listing', 'viewpoints', [['Filter', 'category=equity'], ['Empty', 'Nothing here']]));
  decorate = await listing();
  block = w.document.querySelector('.listing');
  await decorate(block);
  assert.equal(block.querySelector('.listing-empty').textContent, 'Nothing here');
  assert.equal(block.querySelector('.listing-pagination'), null);
});

test('DOM listing (press): sidebar, category, pages', async () => {
  const sidebar = '<h3>Media relations</h3><p>For press inquiries…</p><h4>Email</h4><p class="button-container"><a class="button" href="mailto:x@y.z">x@y.z</a></p>';
  let w = await setupDom(`${ROOT}/about-us/press-releases`, blockHtml('listing', 'press', [['Filter', 'category=press-releases'], ['Sidebar', sidebar]]));
  let decorate = await listing();
  let block = w.document.querySelector('.listing');
  await decorate(block);
  assert.equal(block.querySelectorAll('.listing-press-item').length, 10);
  assert.ok(block.querySelector('.listing-sidebar h3'));
  assert.equal(block.querySelector('.listing-sidebar a.button'), null, 'button classes stripped');
  assert.equal(block.querySelectorAll('.listing-pagination-link').length, 2);
  assert.match(block.querySelector('.listing-press-time time').textContent, /^[A-Z][a-z]+ \d{1,2}, 2026$/);

  w = await setupDom(`${ROOT}/about-us/press-releases?category=archive&page=1`, blockHtml('listing', 'press', [['Filter', 'category=press-releases']]));
  decorate = await listing();
  block = w.document.querySelector('.listing');
  await decorate(block);
  assert.equal(block.querySelectorAll('.listing-press-item').length, 10);
  assert.equal(block.querySelector('.listing-pagination'), null);
});

test('DOM listing (case-studies): count, sort dropdown, filter tabs, URL, load more', async () => {
  // without a Filters row (the TW live app) only the sorter and results render
  const plain = await setupDom(`${ROOT}/sustainable-investing-case-studies`, blockHtml('listing', 'case-studies', [['Limit', '9']]));
  const decoratePlain = await listing();
  const plainBlock = plain.document.querySelector('.listing');
  await decoratePlain(plainBlock);
  assert.equal(plainBlock.querySelector('.listing-cs-filters'), null, 'no filter bar by default');
  assert.ok(plainBlock.querySelector('.listing-cs-count'));

  const w = await setupDom(`${ROOT}/sustainable-investing-case-studies?theme=timber`, blockHtml('listing', 'case-studies', [['Limit', '9'], ['Filters', 'on']]));
  const decorate = await listing();
  const block = w.document.querySelector('.listing');
  await decorate(block);
  assert.equal(block.querySelector('.listing-cs-count').textContent, '5 results match your search');
  assert.equal(block.querySelectorAll('.listing-cs-card').length, 5);
  assert.ok(block.querySelector('.listing-cs-end'));
  assert.equal(block.querySelector('.listing-cs-selection .listing-cs-pill').textContent, 'Timber');
  // open the Topic tab and tick "Social"
  const topicTab = [...block.querySelectorAll('.listing-cs-tab')].find((b) => b.textContent === 'Topic');
  topicTab.click();
  const social = block.querySelector('#cs-topics-social');
  assert.ok(social, 'topic checkbox');
  social.checked = true;
  social.dispatchEvent(new w.Event('change'));
  assert.equal(new URLSearchParams(w.location.search).get('topic'), 'social');
  assert.equal(block.querySelector('.listing-cs-count').textContent, '2 results match your search');
  // clear all, then progressive loading in batches of 9
  block.querySelector('.listing-cs-clear').click();
  assert.equal(w.location.search, '');
  assert.equal(block.querySelectorAll('.listing-cs-card').length, 9);
  block.querySelector('.listing-cs-load-more').click();
  assert.equal(block.querySelectorAll('.listing-cs-card').length, 18);
  // sort: Oldest
  block.querySelector('.listing-dropdown-trigger').click();
  const oldest = [...block.querySelectorAll('.listing-dropdown-option')].find((b) => b.textContent === 'Oldest');
  oldest.click();
  assert.equal(new URLSearchParams(w.location.search).get('sort'), 'oldest');
  assert.equal(block.querySelector('.listing-cs-title a').textContent, 'Case 1');
});

test('DOM listing (documents + people)', async () => {
  let w = await setupDom(`${ROOT}/resources`, blockHtml('listing', 'documents', [['Empty', 'Sorry, no results match this criteria']]));
  let decorate = await listing();
  let block = w.document.querySelector('.listing');
  await decorate(block);
  const tabs = [...block.querySelectorAll('.listing-tab-trigger')].map((b) => b.textContent);
  assert.deepEqual(tabs, ['All Types (12)', 'Documents (8)', 'Fact sheets (4)']);
  assert.equal(block.querySelectorAll('.listing-doc-item').length, 10);
  assert.ok(block.querySelector('.listing-doc-link').getAttribute('href').endsWith('.pdf'));
  block.querySelector('.listing-doc-search').value = 'nothing-matches';
  block.querySelector('.listing-doc-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.equal(new URLSearchParams(w.location.search).get('q'), 'nothing-matches');
  assert.equal(block.querySelector('.listing-doc-empty').textContent, 'Sorry, no results match this criteria');

  w = await setupDom(`${ROOT}/consultant-team`, blockHtml('listing', 'people', [['Filter', `path=${ROOT}/consultant-team`]]));
  decorate = await listing();
  block = w.document.querySelector('.listing');
  await decorate(block);
  const names = [...block.querySelectorAll('.listing-person-name')].map((n) => n.textContent);
  assert.deepEqual(names, ['Greg Thompson', 'Brian Torrisi']);
});

test('DOM search: ?q=, summary, facets, sort, per page, pager', async () => {
  const w = await setupDom(`${ROOT}/search?q=fixed%20income`, blockHtml('search', '', [['Source', `${ROOT}/query-index.json`], ['Limit', '10']]));
  const decorate = await search();
  const block = w.document.querySelector('.search');
  await decorate(block);
  const summary = block.querySelector('.search-summary').textContent;
  assert.match(summary, /^Results 1-10 of [\d,]+ for fixed income$/);
  assert.equal(block.querySelectorAll('.search-result').length, 10);
  assert.ok(block.querySelector('.search-result-date').textContent.match(/^\d{2}\/\d{2}\/\d{4}$/));
  const typeBox = block.querySelector('#search-type-viewpoint');
  assert.ok(typeBox, 'page type facet');
  typeBox.checked = true;
  typeBox.dispatchEvent(new w.Event('change'));
  assert.equal(new URLSearchParams(w.location.search).get('f-type'), 'Viewpoint');
  assert.ok([...block.querySelectorAll('.search-facet-label')].some((b) => b.textContent === 'Author'), 'dependent facet appears');
  assert.equal(block.querySelector('.search-breadcrumb-value').textContent, 'Viewpoint');
  const sel = block.querySelector('.search-sort-select');
  sel.value = 'date';
  sel.dispatchEvent(new w.Event('change'));
  assert.equal(new URLSearchParams(w.location.search).get('sort'), 'date');
  [...block.querySelectorAll('.search-per-page-button')].find((b) => b.textContent === '25').click();
  assert.equal(block.querySelectorAll('.search-result').length, 25);
  block.querySelector('.search-pager-next')?.click();
  assert.equal(new URLSearchParams(w.location.search).get('page'), '2');
  // a new query from the block search box
  block.querySelector('.search-input').value = 'zzzxqv';
  block.querySelector('.search-box').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.match(block.querySelector('.search-no-results-title').textContent, /We couldn't find anything for “zzzxqv”/);
});
