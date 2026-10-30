/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline tests for parsers/team.js: the live per-member "Read more" option (TeamMemberReadMore,
 * authored in the server HTML) becomes variant read-more when every member has it, a third cell
 * "Read more" / empty per row when some have it, and nothing when none has it.
 * Fixture: tools/importer/test/fixtures/team-read-more.html (real markup of agriculture/team and
 * canadian-core-fixed-income, bios cut short). No browser, no network.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const team = (await import(pathToFileURL(join(here, '..', 'parsers', 'team.js')).href)).default;
const FIXTURE = readFileSync(join(here, 'fixtures', 'team-read-more.html'), 'utf-8');
let document;

function createBlock(doc, { name, variants = [], cells }) {
  const table = doc.createElement('table');
  const head = doc.createElement('tr');
  head.innerHTML = `<th>${variants.length ? `${name} (${variants.join(', ')})` : name}</th>`;
  table.append(head);
  cells.forEach((row) => {
    const tr = doc.createElement('tr');
    row.forEach((v) => {
      const td = doc.createElement('td');
      [].concat(v).forEach((x) => { if (x !== '' && x !== null && x !== undefined) td.append(typeof x === 'string' ? doc.createTextNode(x) : x); });
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

const parse = (id) => {
  team(document.querySelector(`#${id} .teamMembers`), { document });
  const table = document.querySelector(`#${id} table`);
  return {
    name: table.querySelector('th').textContent,
    rows: [...table.querySelectorAll('tr')].slice(1).map((tr) => [...tr.children].map((td, i) => (i === 1 ? td.querySelector('h4').textContent : td.textContent.trim()))),
  };
};

test('every member with read-more on live: Team (read-more), two cells per row', () => {
  const { name, rows } = parse('fx-all');
  assert.equal(name, 'Team (read-more)');
  assert.deepEqual(rows.map((r) => r.length), [2, 2, 2]);
  assert.deepEqual(rows.map((r) => r[1]), ['Brent McGowan', 'Oliver S. Williams IV, CFA', 'Hugues Rinfret, CFA, FRM']);
});

test('some members with read-more: plain Team, a third cell "Read more" only for them', () => {
  const { name, rows } = parse('fx-some');
  assert.equal(name, 'Team');
  assert.deepEqual(rows.map((r) => [r[1], r[2]]), [['Danielle Harris, CAIA, AFM', 'Read more'], ['Carl B. Evers, Jr., AFM', ''], ['Corbitt Simmons', '']]);
});

test('no member with read-more (strategy "Managed by"): plain Team, bios in full', () => {
  const { name, rows } = parse('fx-none');
  assert.equal(name, 'Team');
  assert.deepEqual(rows.map((r) => r.length), [2, 2, 2]);
  assert.ok(document.querySelector('#fx-none table').textContent.includes('Roshan is the head of the Canadian fixed-income team'));
});
