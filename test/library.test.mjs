/* eslint-disable import/extensions */
/* tools/library: block library builder and Block Inspector contract (node --test, no network). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, describeBlockDiv, rowShape, editableFields,
} from '../tools/library/structure.mjs';
import {
  selectTemplates, buildLibrary, indexSheet, verifyLibraryDocument, unknownBlocks, MAX_ITEMS,
} from '../tools/library/build-library.mjs';
import { decide, normalizeSheet } from '../tools/library/upload-library.mjs';

const BLOCKS = new Set(['cards', 'promo', 'disclosure', 'section-nav', 'article-list']);
const page = (body) => `<body><header></header><main><div>${body}</div></main><footer></footer></body>`;
const img = (n) => `<picture><img src="https://content.da.live/cloudadoption/manulifeim/media-da/${n}.jpg" alt=""></picture>`;
const card = (t) => `<div><div>${img(t)}</div><div><h3>${t}</h3><p>Text ${t}</p></div></div>`;

test('DA keeps a picture and the text after it in one paragraph: one image field', () => {
  const doc = parse(`<div class="columns"><div><div>${img('a')} Asia outlook</div></div></div>`);
  const d = describeBlockDiv(doc.querySelector('.columns'));
  assert.equal(rowShape(d.rows[0]), 'i');
});

test('a cell with fewer fields than the template edits none of that cell (fields.js fieldCount)', () => {
  const tpl = describeBlockDiv(parse('<div class="disclosure"><div><div>T</div><div><p>a</p><p>b</p></div></div></div>').body.firstElementChild);
  const one = describeBlockDiv(parse('<div class="disclosure"><div><div>T</div><div><p>a</p></div></div></div>').body.firstElementChild);
  assert.equal(editableFields(tpl, one, false), 1);
  assert.equal(editableFields({ rows: [tpl.rows[0]] }, one, true), 1);
});

test('select picks the template that lets authors edit the most fields', () => {
  const pages = [
    { page: '/a', html: page('<div class="disclosure"><div><div>T</div><div><p>a</p></div></div></div>') },
    { page: '/b', html: page('<div class="disclosure"><div><div>T</div><div><p>a</p></div></div></div>') },
    { page: '/c', html: page('<div class="disclosure"><div><div>T</div><div><p>a</p><p>b</p><p>c</p></div></div></div>') },
  ];
  const [v] = selectTemplates(pages, BLOCKS);
  assert.equal(v.key, 'disclosure');
  assert.equal(v.shape, 't|t');
  assert.equal(v.editableFields, 6);
  assert.deepEqual(v.samples.map((s) => s.page), ['/a', '/b']);
});

test('class names without a block folder are reported, not offered', () => {
  const pages = [{ page: '/x', html: page('<div class="asia-small-cap"><div><div>1</div></div></div><div class="cards"><div><div>a</div></div></div>') }];
  assert.deepEqual(selectTemplates(pages, BLOCKS).map((v) => v.key), ['cards']);
  assert.deepEqual(unknownBlocks(pages, BLOCKS), { 'asia-small-cap': ['/x'] });
});

test('build: multi block keeps MAX_ITEMS items and one item row of fields', () => {
  const cards = `<div class="cards"><div><div>${img('x')}</div><div><p>no heading</p></div></div>${[1, 2, 3, 4, 5].map((n) => card(`c${n}`)).join('')}</div>`;
  const pages = [{ page: '/p', html: page(cards) }];
  const variants = selectTemplates(pages, BLOCKS);
  const { docs, problems } = buildLibrary(variants, () => page(cards));
  assert.deepEqual(problems, []);
  const doc = parse(docs.cards);
  const block = doc.querySelector('main .cards');
  assert.equal(block.children.length, MAX_ITEMS);
  assert.equal(rowShape(describeBlockDiv(block).rows[0]), variants[0].shape, 'the template item comes first');
  const rows = [...doc.querySelectorAll('.library-metadata table tr')];
  assert.equal(rows.length, 2);
  assert.deepEqual([...rows[1].children].map((td) => td.textContent), ['Image', 'HeadingText']);
  assert.equal(doc.querySelector('main h2').textContent, 'Cards');
});

test('build: key/value rows hide the key, promo names its colour cell', () => {
  const list = '<div class="article-list"><div><div>Source</div><div>/viewpoints</div></div><div><div>Limit</div><div>3</div></div></div>';
  const promo = `<div class="promo navy"><div><div>${img('p')}</div><div><h2>Title</h2><p><a href="/x">More</a></p></div><div>navy</div></div></div>`;
  const pages = [{ page: '/p', html: page(list + promo) }];
  const { docs, problems } = buildLibrary(selectTemplates(pages, BLOCKS), () => page(list + promo));
  assert.deepEqual(problems, []);
  const labels = (html) => [...parse(html).querySelectorAll('.library-metadata table tr')].slice(1)
    .map((tr) => [...tr.children].map((td) => [...td.children].map((p) => p.textContent).join('+')));
  assert.deepEqual(labels(docs['article-list']), [['IGNORE', 'Source'], ['IGNORE', 'Limit']]);
  assert.deepEqual(labels(docs.promo), [['Image', 'Heading+Link', 'Colour']]);
  assert.match(docs.promo, /<h2>Promo \(navy\)<\/h2>/);
});

test('build: an empty block (filled by the page) gets no fields metadata', () => {
  const html = page('<div class="section-nav anchors"></div>');
  const { docs, problems } = buildLibrary(selectTemplates([{ page: '/s', html }], BLOCKS), () => html);
  assert.deepEqual(problems, []);
  assert.doesNotMatch(docs['section-nav'], />fields</);
  assert.match(docs['section-nav'], />description</);
});

test('build: falls back to the next sample when a page\'s DA source changed', () => {
  const ok = page('<div class="disclosure"><div><div>T</div><div><p>a</p></div></div></div>');
  const changed = page('<div class="disclosure"><div><div>T</div></div></div>');
  const variants = selectTemplates([{ page: '/a', html: ok }, { page: '/b', html: ok }], BLOCKS);
  const { docs, problems } = buildLibrary(variants, (p) => (p === '/a' ? changed : ok));
  assert.deepEqual(problems, []);
  assert.equal(variants[0].sample.page, '/b');
  assert.ok(docs.disclosure);
  const none = buildLibrary(selectTemplates([{ page: '/a', html: ok }], BLOCKS), () => changed);
  assert.match(none.problems[0], /no sample page matches/);
});

test('verify catches metadata the Inspector would reject', () => {
  const doc = (fields) => page(`<div class="disclosure"><div><div>T</div><div><p>a</p></div></div></div><div class="library-metadata"><div><div><p>fields</p></div><div><table><tbody>${fields}</tbody></table></div></div></div>`);
  assert.deepEqual(verifyLibraryDocument(doc('<tr><td colspan="2"><p>Fields</p></td></tr><tr><td><p>Title</p></td><td><p>Text</p></td></tr>')), []);
  assert.match(verifyLibraryDocument(doc('<tr><td colspan="2"><p>Fields</p></td></tr><tr><td><p>Title</p></td><td><p>Text</p><p>More</p></td></tr>'))[0], /2 labels for 1 fields/);
  assert.match(verifyLibraryDocument(doc('<tr><td><p>Fields</p></td></tr>'))[0], /1 rows, the template needs 2/);
  assert.match(verifyLibraryDocument(doc('<tr><td>Fields</td><td></td></tr>'))[0], /one-cell Fields header/);
});

test('index sheet: block rows, multi editor rows, empty options', () => {
  const idx = indexSheet(['cards', 'disclosure']);
  assert.deepEqual(idx[':names'], ['blocks', 'editor', 'options']);
  assert.deepEqual(idx.blocks.data[0], { name: 'Cards', path: 'https://content.da.live/cloudadoption/manulifeim/library/blocks/cards' });
  assert.deepEqual(idx.editor.data, [{ block: 'cards', property: 'multi' }]);
  assert.equal(idx.options.total, 0);
});

test('upload never overwrites a library document someone else changed', () => {
  assert.equal(decide({ remoteStatus: 404, localSha: 'l' }), 'create');
  assert.equal(decide({ remoteStatus: 200, remoteSha: 'l', localSha: 'l' }), 'skip');
  assert.equal(decide({
    remoteStatus: 200, remoteSha: 'old', localSha: 'l', lastUploadedSha: 'old',
  }), 'replace');
  assert.equal(decide({
    remoteStatus: 200, remoteSha: 'author', localSha: 'l', lastUploadedSha: 'old',
  }), 'hold');
  assert.equal(decide({ remoteStatus: 200, remoteSha: 'author', localSha: 'l' }), 'hold');
  assert.equal(decide({ remoteStatus: 500, localSha: 'l' }), 'error');
});

test('a sheet saved by DA\'s sheet editor (preview) counts as unchanged', () => {
  const ours = indexSheet(['cards']);
  const saved = JSON.parse(JSON.stringify(ours));
  saved.blocks[':colWidths'] = [300, 300];
  saved.options = {
    total: 1, limit: 1, offset: 0, data: [{}], ':colWidths': [],
  };
  assert.deepEqual(normalizeSheet(saved), normalizeSheet(ours));
  saved.blocks.data[0].name = 'Card';
  assert.notDeepEqual(normalizeSheet(saved), normalizeSheet(ours));
});
