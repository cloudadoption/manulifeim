/* eslint-disable */
/* global WebImporter */
/*
 * Parser: link-list. Live: .linkList2 (LinkListCard, article end links) and the article
 * sidebar section.viewpoint-links (Category, Tags).
 * Project contract (block-authoring.md, blocks/link-list/link-list.js):
 *   | Link List[ (card)] |
 *   | ## Title |            (heading-only row; sidebar "Category" / "Tags")
 *   | subtitle text |       (text-only row, optional)
 *   | [Link](...) |         (one link per row)
 */
import {
  h, block, text, linkFrom,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [];
  const variants = [];
  if (element.matches('section.viewpoint-links')) {
    const title = element.querySelector('.viewpoint-links__title, h2');
    if (text(title)) rows.push([h(document, 'h2', text(title))]);
    element.querySelectorAll('a.viewpoint-links__link, li a').forEach((a) => rows.push([linkFrom(document, a)]));
  } else {
    const inner = element.querySelector('.linkList2__inner') || element;
    if (/--card/.test(inner.className)) variants.push('card');
    const title = inner.querySelector('.linkList2__title, h2, h3');
    if (text(title)) rows.push([h(document, 'h2', text(title))]);
    const sub = inner.querySelector('.linkList2__subtitle');
    if (text(sub)) rows.push([h(document, 'p', sub.innerHTML.trim())]);
    inner.querySelectorAll('a.linkList2__link, .linkList2__list a').forEach((a) => rows.push([linkFrom(document, a)]));
  }
  element.replaceWith(block(document, 'Link List', variants, rows.filter((r) => r[0])));
}
