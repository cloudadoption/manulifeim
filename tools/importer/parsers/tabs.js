/* eslint-disable */
/* global WebImporter */
/*
 * Parser: tabs. Live: .navigationTabs (NavigationTabs) whose panels hold only text and
 * figures (utils/page-model.js decides; other tab sets are flattened to headings).
 * Project contract (blocks/tabs/tabs.js; EDS library Tabs: 2 columns, one row per tab):
 *   | Tabs                                                              |
 *   | Tab label (cell 1)  | Tab content (cell 2)                          |
 *   | Inflation targets   | #### Is 2% the right target? / text / image   |
 * A figure in a panel becomes its text, image and caption in the content cell.
 */
import { h, block, text } from '../utils/dom.js';
import { classify, toDefault } from '../utils/page-model.js';
import { figureParts } from './figure.js';

export default function parse(element, { document }) {
  const rows = [];
  element.querySelectorAll('.navigationTabs__contentItem').forEach((item) => {
    const label = text(item.querySelector('.navigationTabs__contentTitle'));
    const inner = item.querySelector('.navigationTabs__contentInner') || item;
    const content = [];
    [...inner.children].forEach((c) => {
      const k = classify(c);
      if (k.kind === 'block' && k.name === 'figure') {
        const { before, pictures, after } = figureParts(c, document);
        content.push(...before, ...pictures, ...after);
      } else if (k.kind === 'default') {
        content.push(...toDefault(document, c, k.name));
      }
    });
    // tab label (mandatory) | tab content (mandatory)
    if (label && content.length) rows.push([label, content]);
  });
  const title = text(element.querySelector('.navigationTabs__title'));
  const out = [];
  if (title) out.push(h(document, 'h2', title));
  if (rows.length) out.push(block(document, 'Tabs', [], rows));
  if (out.length) element.replaceWith(...out);
  else element.remove();
}
