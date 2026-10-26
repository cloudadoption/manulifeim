/* eslint-disable */
/* global WebImporter */
/*
 * Parser: link-list-inline. Live: .moreInsights ("More insight" bar on /viewpoints).
 * Project contract (block-authoring.md, blocks/link-list/link-list.js):
 *   | Link List (inline) |
 *   | More insight | list: [Climate Opportunities](...), [Asset Allocation Views](...) |
 */
import { block, text } from '../utils/dom.js';

export default function parse(element, { document }) {
  const title = text(element.querySelector('.more-insights__title')) || 'More insight';
  const ul = document.createElement('ul');
  element.querySelectorAll('.more-insights__link a, .more-insights__links-wrapper a').forEach((a) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.setAttribute('href', a.getAttribute('href'));
    link.textContent = text(a);
    li.append(link);
    ul.append(li);
  });
  element.replaceWith(block(document, 'Link List', ['inline'], [[title, ul]]));
}
