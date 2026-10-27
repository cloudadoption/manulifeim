#!/usr/bin/env node
/*
 * Remediation 5b: replaces each Title block with its heading (+ the link as <p><a>) and gives
 * its section the `title-row` style (an existing Section Metadata keeps its other rows).
 * Works on content/<path>.plain.html in place; DA upload / preview is a separate step.
 *
 *   node tools/importer/migrate-title-row.mjs [--check] [<eds path> ...]   (default: every page)
 *
 * --check only reports what would change (pages, title blocks, sections that hold more than
 * the title block, which are left alone).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const NM = '/home/node/.excat-marketplaces/excat-marketplace/excat/skills/excat-content-import/scripts/node_modules';
const { JSDOM } = await import(pathToFileURL(`${NM}/jsdom/lib/api.js`).href);

const args = process.argv.slice(2);
const check = args.includes('--check');
const list = (d, out = []) => {
  readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (f === 'media-da') return;
    if (statSync(p).isDirectory()) list(p, out);
    else if (f.endsWith('.plain.html')) out.push(p);
  });
  return out;
};
const given = args.filter((a) => a.startsWith('/'));
const files = given.length ? given.map((p) => `content${p}.plain.html`) : list('content');

let pages = 0;
let blocks = 0;
const shared = [];
files.forEach((f) => {
  const html = readFileSync(f, 'utf-8');
  if (!html.includes('class="title"')) return;
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;
  let changed = false;
  doc.querySelectorAll('div.title').forEach((title) => {
    const section = title.parentElement;
    const others = [...section.children].filter((c) => c !== title && !c.classList.contains('section-metadata'));
    if (others.length) {
      shared.push(`${f.replace(/^content|\.plain\.html$/g, '')}: ${others.map((o) => o.className || o.tagName).join(', ')}`);
      return;
    }
    const cells = [...title.querySelectorAll(':scope > div > div')];
    const nodes = [];
    cells.forEach((cell) => {
      const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) {
        nodes.push(heading);
        return;
      }
      const a = cell.querySelector('a[href]');
      if (a) {
        const p = doc.createElement('p');
        p.append(a);
        nodes.push(p);
      } else if (cell.textContent.trim()) {
        const h2 = doc.createElement('h2');
        h2.innerHTML = cell.innerHTML;
        nodes.push(h2);
      }
    });
    title.replaceWith(...nodes);
    // section style
    let meta = section.querySelector(':scope > .section-metadata');
    if (!meta) {
      meta = doc.createElement('div');
      meta.className = 'section-metadata';
      section.append(meta);
    }
    const styleRow = [...meta.children].find((r) => r.children[0]?.textContent.trim().toLowerCase() === 'style');
    if (styleRow) {
      const cell = styleRow.children[1];
      const styles = cell.textContent.split(',').map((s) => s.trim()).filter(Boolean);
      if (!styles.includes('title-row')) cell.textContent = [...styles, 'title-row'].join(', ');
    } else {
      const row = doc.createElement('div');
      row.innerHTML = '<div>Style</div><div>title-row</div>';
      meta.prepend(row);
    }
    blocks += 1;
    changed = true;
  });
  if (changed) {
    pages += 1;
    if (!check) writeFileSync(f, doc.body.innerHTML);
  }
  dom.window.close();
});
console.log(`${check ? 'would change' : 'changed'} ${blocks} title blocks on ${pages} pages`);
if (shared.length) console.log(`left alone (section holds more than the title):\n  ${shared.join('\n  ')}`);
