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
 */
import {
  image, block, text, norm, linkParagraph,
} from '../utils/dom.js';

function isoFromMs(ms) {
  const n = Number(ms);
  if (!n) return '';
  return new Date(n).toISOString().slice(0, 10);
}

export default function parse(element, { document }) {
  const rows = [];
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
        rows.push([
          tab,
          photo || '',
          a ? linkParagraph(document, a.getAttribute('href'), name) : name,
          text(li.querySelector('.browseBar__authorDetailsSubtitle')),
          li.getAttribute('data-viewpoints-count') || '',
          isoFromMs(li.getAttribute('data-last-posted')),
        ]);
      } else {
        const a = li.querySelector('a[href]');
        if (a) rows.push([tab, linkParagraph(document, a.getAttribute('href'), text(a))]);
      }
    });
  });
  element.replaceWith(block(document, 'Browse By', [], rows));
}
