/* eslint-disable */
/* global WebImporter */
/*
 * Parser: browse-by. Live: .browseBar (BrowseBar) on /viewpoints: Authors (server-rendered
 * with data-name / data-viewpoints-count / data-last-posted), Categories, Tags.
 * Project contract (block-authoring.md, blocks/browse-by/browse-by.js):
 *   | Browse By |
 *   | Title      | Browse by |
 *   | Authors    | (opt) photo | [data-name](/viewpoints/<slug>) | company | count | ISO last posted |
 *   | Categories | [Alternative credit](/viewpoints/alternative-credit) |
 *   | Tags       | [Asset allocation](/viewpoints/tag/asset-allocation) |
 *
 * Author fragments: a page may hold at most 200 images (preview fails beyond) and /viewpoints
 * lists ~210 author photos. When the import script passes `fragments: []`, the author rows go
 * to fragment documents of at most AUTHORS_MAX_IMAGES images each (balanced), each holding a
 * Browse By block with those rows, and the page block keeps one row per fragment:
 *   | Authors | [#browse-by-fragment-authors-1](#browse-by-fragment-authors-1) |
 * The import script sets each fragment's path and swaps the placeholder href for it
 * (import-viewpoints.js: /institutional/tw/en/fragments/viewpoints-authors-N). Without
 * `fragments` the rows stay inline. Same split rule: tools/importer/split-browse-by.mjs.
 */
import {
  image, block, text, norm, linkParagraph,
} from '../utils/dom.js';

export const AUTHORS_MAX_IMAGES = 150;
export const FRAGMENT_PLACEHOLDER = '#browse-by-fragment-';

function isoFromMs(ms) {
  const n = Number(ms);
  if (!n) return '';
  return new Date(n).toISOString().slice(0, 10);
}

/** Splits rows into the fewest balanced chunks with at most `max` distinct images each. */
export function splitByImages(rows, max) {
  const srcs = rows.map((r) => r.src).filter(Boolean);
  const parts = Math.max(1, Math.ceil(new Set(srcs).size / max));
  const size = Math.ceil(rows.length / parts);
  const chunks = [];
  let current = [];
  let seen = new Set();
  rows.forEach((r) => {
    const grows = r.src && !seen.has(r.src);
    if (current.length && (current.length >= size || (grows && seen.size >= max))) {
      chunks.push(current);
      current = [];
      seen = new Set();
    }
    current.push(r);
    if (r.src) seen.add(r.src);
  });
  if (current.length) chunks.push(current);
  return chunks;
}

export default function parse(element, { document, fragments }) {
  const rows = [];
  const authorRows = [];
  let authorsAt = -1;
  let authorsTab = 'Authors';
  const title = text(element.querySelector('.browseBar__title'));
  if (title) rows.push(['Title', title]);
  const tabName = (pane) => {
    const id = pane.getAttribute('data-tab') || '';
    const btn = element.querySelector(`.browseBar__tabButton[data-toggle="${id}"]`);
    return text(btn) || (id.charAt(0).toUpperCase() + id.slice(1));
  };
  element.querySelectorAll('.browseBar__tabContent').forEach((pane) => {
    const tab = tabName(pane);
    const isAuthors = /authors/.test(pane.className);
    pane.querySelectorAll('.browseBar__item').forEach((li) => {
      if (isAuthors) {
        const a = li.querySelector('a.browseBar__authorDetailsLink, a[href]');
        // displayed text ("Name, Position" for some authors) keeps the tile 1:1; data-name is its start
        const name = text(li.querySelector('.browseBar__authorDetailsTitle')) || norm(li.getAttribute('data-name'));
        const photo = image(document, li.querySelector('img.browseBar__image, img'));
        const cells = [
          tab,
          photo || '',
          a ? linkParagraph(document, a.getAttribute('href'), name) : name,
          text(li.querySelector('.browseBar__authorDetailsSubtitle')),
          li.getAttribute('data-viewpoints-count') || '',
          isoFromMs(li.getAttribute('data-last-posted')),
        ];
        if (authorsAt === -1) {
          authorsAt = rows.length;
          authorsTab = tab;
        }
        authorRows.push({ cells, src: photo ? photo.getAttribute('src') : '' });
      } else {
        const a = li.querySelector('a[href]');
        if (a) rows.push([tab, linkParagraph(document, a.getAttribute('href'), text(a))]);
      }
    });
  });

  let authorBlockRows = authorRows.map((r) => r.cells);
  if (Array.isArray(fragments) && authorRows.length) {
    authorBlockRows = splitByImages(authorRows, AUTHORS_MAX_IMAGES).map((chunk, i) => {
      const id = `authors-${i + 1}`;
      const doc = document.createElement('div');
      doc.append(block(document, 'Browse By', [], chunk.map((r) => r.cells)));
      fragments.push({ id, element: doc, images: new Set(chunk.map((r) => r.src).filter(Boolean)).size, rows: chunk.length });
      return [authorsTab, linkParagraph(document, `${FRAGMENT_PLACEHOLDER}${id}`, `${FRAGMENT_PLACEHOLDER}${id}`)];
    });
  }
  if (authorsAt !== -1) rows.splice(authorsAt, 0, ...authorBlockRows);
  element.replaceWith(block(document, 'Browse By', [], rows));
}
