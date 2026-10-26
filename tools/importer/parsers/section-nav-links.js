/* eslint-disable */
/* global WebImporter */
/*
 * Parser: section-nav-links. Live: .pressCategories__inner (PressCategories) on the
 * press-release listing; the static bar is used (the "stuckable" copy is dropped).
 * Project contract (block-authoring.md, blocks/section-nav/section-nav.js):
 *   | Section Nav (links) |
 *   | list: [Press releases](...category/press-releases), [Archive](...), [Other](...) |
 * Category links are rewritten to ?category=<c> by the links transformer.
 */
import { block, text } from '../utils/dom.js';

export default function parse(element, { document }) {
  const bar = element.querySelector('.pressCategories__wrapper--static') || element;
  const ul = document.createElement('ul');
  bar.querySelectorAll('.pressCategories__list a').forEach((a) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.setAttribute('href', a.getAttribute('href'));
    link.textContent = text(a);
    li.append(link);
    ul.append(li);
  });
  element.replaceWith(block(document, 'Section Nav', ['links'], [[ul]]));
}
