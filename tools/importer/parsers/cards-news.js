/* eslint-disable */
/* global WebImporter */
/*
 * Parser: cards-news. Live: .latest-news (homepage, about-us; 4 newest press releases)
 * and ul.pressItems (press-release listing, first page of 10).
 * Project contract (block-authoring.md, blocks/cards/cards.js); library "Cards (no images)"
 * row shape (single text cell):
 *   | Cards (news) |
 *   | Source | /institutional/tw/en/about-us/press-releases |   (feed config, kept for the index)
 *   | Limit  | 4 |
 *   | p date / ## Title / [Read more](...) |                   (authored items, one per row)
 * latest-news is "the N newest" on live: with Source the block lists the newest index entries
 * and the authored items (live 1:1) are only the fallback when the index has none.
 * The press listing (ul.pressItems) is imported by the listing parser (Listing (press)).
 */
import {
  h, linkFrom, block, text, inlineHtml,
} from '../utils/dom.js';
import { lookupEdsPath, SITE_ROOT } from '../utils/links.js';

export default function parse(element, { document }) {
  const isPress = element.matches('ul.pressItems, .pressItems');
  const items = isPress
    ? [...element.querySelectorAll('.pressItems__item')]
    : [...element.querySelectorAll('article.article-kicker')];
  const rows = [
    ['Source', lookupEdsPath(`${SITE_ROOT}/about-us/press-releases`) || `${SITE_ROOT}/about-us/press-releases`],
    ['Limit', String(isPress ? 10 : (items.length || 4))],
  ];
  items.forEach((it) => {
    const content = [];
    const date = it.querySelector('.article__date, .pressItems__time');
    if (text(date)) content.push(h(document, 'p', text(date)));
    const title = it.querySelector('.article__title, .pressItems__title');
    const titleLink = title && title.querySelector('a');
    const html = inlineHtml(titleLink || title);
    if (html) content.push(h(document, 'h2', html));
    const desc = it.querySelector('.article__text, .pressItem__desc');
    if (text(desc)) content.push(h(document, 'p', desc.innerHTML.trim()));
    const link = it.querySelector('.article__link a, a.pressItems__link') || titleLink;
    if (link) content.push(linkFrom(document, link, {}));
    if (content.length) rows.push([content.filter(Boolean)]);
  });
  element.replaceWith(block(document, 'Cards', ['news'], rows));
}
