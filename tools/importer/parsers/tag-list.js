/* eslint-disable */
/* global WebImporter */
/*
 * Parser: tag-list. Live: .viewpoint-tags__component-wrapper > details.viewpoint-tags
 * ("All Tags" with counts) on viewpoints listings and in the article footer.
 * Project contract (block-authoring.md, blocks/tag-list/tag-list.js), static form so the
 * counts stay 1:1 with live:
 *   | Tag List[ (padded)] |
 *   | Title | All Tags |
 *   | list: [Alternative credit (10)](/viewpoints/tag/alternative-credit), ... |
 * The article footer copy (marked mim-padded by the page model) gets `padded`.
 */
import { block, text } from '../utils/dom.js';

export default function parse(element, { document }) {
  const variants = element.classList.contains('mim-padded') ? ['padded'] : [];
  const title = text(element.querySelector('.viewpoint-tags__title, summary')) || 'All Tags';
  const ul = document.createElement('ul');
  element.querySelectorAll('a.viewpoint-tags__link, .viewpoint-tags__list a').forEach((a) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.setAttribute('href', a.getAttribute('href'));
    link.textContent = text(a);
    li.append(link);
    ul.append(li);
  });
  element.replaceWith(block(document, 'Tag List', variants, [['Title', title], [ul]]));
}
