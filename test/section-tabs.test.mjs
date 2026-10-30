/* scripts/section-tabs.js + blocks/tabs variant sections (node --test + jsdom, no browser). */
/* global globalThis */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function setup(hash = '') {
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>', { url: `https://main--manulifeim--cloudadoption.aem.page/x${hash}` });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom;
}

let n = 0;
const fresh = async () => {
  n += 1;
  const [{ default: build, tabGroups, tabLabel }, { default: decorate }] = await Promise.all([
    import(`../scripts/section-tabs.js?t=${n}`),
    import(`../blocks/tabs/tabs.js?t=${n}`),
  ]);
  return {
    build, tabGroups, tabLabel, decorate,
  };
};

// sections as Edge Delivery renders them: Section Metadata Tab -> data-tab, Layout -> data-layout
const PAGE = `
  <div><h2>Our asset allocation views</h2></div>
  <div data-tab="Developed markets" class="centered"><div class="table"><div><div>Equities</div></div></div></div>
  <div data-tab="Emerging markets" data-layout="6-6"><div class="columns"><div><div>EM</div><div>Asia</div></div></div></div>
  <div data-tab="Emerging markets"><p id="em-note">Source: team views.</p></div>
  <div data-tab="Fixed income"><div class="cards"><div><div>Bonds</div></div></div></div>
  <div><p>After the tabs.</p></div>
  <div data-tab="Lonely"><p>One tab only.</p></div>`;

function page() {
  const main = document.querySelector('main');
  main.innerHTML = PAGE;
  return main;
}

/* what decorateSections + loadBlock would do for the tabs block: section/wrapper classes */
function decorateBlock(main, decorate) {
  const block = main.querySelector('.tabs.sections');
  block.parentElement.classList.add('section', 'tabs-container');
  decorate(block);
  return block;
}

test('consecutive Tab sections form one set; same label = one panel; a lone Tab section stays', async () => {
  setup();
  const { build, tabGroups } = await fresh();
  const main = page();
  assert.deepEqual(tabGroups(main).map((g) => g.map((p) => `${p.label}:${p.sections.length}`)), [
    ['Developed markets:1', 'Emerging markets:2', 'Fixed income:1'],
  ]);
  assert.equal(build(main), 1);
  const sections = [...main.children];
  assert.equal(sections.length, 8, 'one new section for the tab list');
  assert.ok(sections[1].querySelector(':scope > .tabs.sections'));
  assert.deepEqual(sections.slice(2, 6).map((s) => s.hidden), [false, true, true, true]);
  assert.equal(sections[7].hidden, false, 'the lone Tab section is not a tab set');
  assert.equal(main.querySelector('[data-tab="Lonely"]').previousElementSibling.querySelector('.tabs'), null);
});

test('the block wires the tab list to the sections: roles, ids, labels, hidden panels', async () => {
  setup();
  const { build, decorate } = await fresh();
  const main = page();
  build(main);
  const block = decorateBlock(main, decorate);
  const tabs = [...block.querySelectorAll('[role=tab]')];
  assert.equal(block.querySelector('[role=tablist]').children.length, 3);
  assert.deepEqual(tabs.map((t) => t.textContent), ['Developed markets', 'Emerging markets', 'Fixed income']);
  assert.deepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false', 'false']);
  const em = [...main.querySelectorAll('[data-tab="Emerging markets"]')];
  assert.equal(tabs[1].getAttribute('aria-controls'), em.map((s) => s.id).join(' '));
  em.forEach((s) => {
    assert.equal(s.getAttribute('role'), 'tabpanel');
    assert.equal(s.getAttribute('aria-labelledby'), tabs[1].id);
    assert.equal(s.tabIndex, 0);
    assert.equal(s.hidden, true);
  });
  // the panel content (blocks, layout) is untouched
  assert.ok(em[0].querySelector('.columns'));
  assert.equal(em[0].dataset.layout, '6-6');
  assert.ok(main.querySelector('[data-tab="Fixed income"] .cards'));
});

test('click and keyboard (Right, Left wraps, Home, End) switch the open sections', async () => {
  setup();
  const { build, decorate } = await fresh();
  const main = page();
  build(main);
  const block = decorateBlock(main, decorate);
  const tabs = [...block.querySelectorAll('[role=tab]')];
  const open = () => [...main.querySelectorAll('[data-tab]:not([data-tab="Lonely"])')].filter((s) => !s.hidden).map((s) => s.dataset.tab);
  tabs[1].click();
  assert.deepEqual(open(), ['Emerging markets', 'Emerging markets']);
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[0].tabIndex, -1);
  const key = (k) => {
    document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  };
  tabs[1].focus();
  key('ArrowRight');
  assert.deepEqual(open(), ['Fixed income']);
  assert.equal(document.activeElement, tabs[2]);
  key('ArrowRight');
  assert.deepEqual(open(), ['Developed markets']);
  key('ArrowLeft');
  assert.deepEqual(open(), ['Fixed income']);
  key('Home');
  assert.deepEqual(open(), ['Developed markets']);
  key('End');
  assert.deepEqual(open(), ['Fixed income']);
  key('a');
  assert.deepEqual(open(), ['Fixed income']);
});

test('a URL hash inside a later panel opens that panel', async () => {
  setup('#em-note');
  const { build, decorate } = await fresh();
  const main = page();
  build(main);
  const block = decorateBlock(main, decorate);
  assert.equal(block.querySelector('[aria-selected=true]').textContent, 'Emerging markets');
  assert.equal(document.getElementById('em-note').closest('[data-tab]').hidden, false);
  assert.equal(main.querySelector('[data-tab="Developed markets"]').hidden, true);
});

test('authored ids are kept; a block whose sections are gone is left alone', async () => {
  setup();
  const { build, decorate } = await fresh();
  const main = document.querySelector('main');
  main.innerHTML = '<div id="active" data-tab="Active"><p>A</p></div><div data-tab="Strategic"><p>S</p></div>';
  build(main);
  assert.equal(main.querySelector('.tabs.sections > div > div:last-child').textContent, 'active');
  const orphan = document.createElement('div');
  orphan.className = 'tabs sections';
  orphan.innerHTML = '<div><div>Gone</div><div>no-such-id</div></div>';
  main.append(orphan);
  decorate(orphan);
  assert.equal(orphan.querySelector('[role=tablist]'), null);
});

test('the label | content form still works next to a section tab set', async () => {
  setup();
  const { build, decorate } = await fresh();
  const main = page();
  main.insertAdjacentHTML('afterbegin', '<div><div class="tabs"><div><div>One</div><div><p>First</p></div></div><div><div>Two</div><div><p>Second</p></div></div></div></div>');
  build(main);
  const classic = main.querySelector('.tabs:not(.sections)');
  decorate(classic);
  assert.deepEqual([...classic.querySelectorAll('[role=tabpanel]')].map((p) => p.hidden), [false, true]);
  const sections = decorateBlock(main, decorate);
  assert.equal(sections.querySelectorAll('[role=tab]').length, 3);
  assert.notEqual(classic.querySelector('[role=tab]').id, sections.querySelector('[role=tab]').id);
});

test('a label with a comma reads as authored: the delivered list value gets its spaces back', async () => {
  setup();
  const { build, decorate, tabLabel } = await fresh();
  // US Econometer: DA "June 15, 2023", delivered data-tab "June 15,2023"
  assert.equal(tabLabel('June 15,2023'), 'June 15, 2023');
  assert.equal(tabLabel('June 15, 2023'), 'June 15, 2023');
  assert.equal(tabLabel('A, B,C'), 'A, B, C');
  // labels without a comma stay as they are
  ['Developed-market equites', 'Alternatives/real assets', '1985–1999', 'Consumers (ex-auto)'].forEach((l) => assert.equal(tabLabel(l), l));
  assert.equal(tabLabel('  Fixed income '), 'Fixed income');
  const main = document.querySelector('main');
  main.innerHTML = '<div data-tab="June 15,2023" class="centered"><h1>June 15, 2023</h1></div><div data-tab="May 8,2023" class="centered"><h1>May 8, 2023</h1></div>';
  build(main);
  const block = decorateBlock(main, decorate);
  assert.deepEqual([...block.querySelectorAll('[role=tab]')].map((t) => t.textContent), ['June 15, 2023', 'May 8, 2023']);
});
