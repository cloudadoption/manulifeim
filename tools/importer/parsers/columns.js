/* eslint-disable */
/* global WebImporter */
/*
 * Parser: columns. Live: multi-column .column-container with default content in two or
 * more columns (the page model marks it with data-mim-columns and has already moved
 * nested components such as simpleBanner / marketoForm / disclosures out of the cells,
 * because blocks must not nest; figures stay in their cell as text + image + caption).
 * Project contract (block-authoring.md, blocks/columns/columns.js); library Columns shape
 * (one row, one cell per live column, empty columns kept so the layout matches):
 *   | Columns[ (8-4|6-6|4-4-4|3-3-3-3)] |
 *   | default content | default content | ... |
 */
import { block, h } from '../utils/dom.js';
import { classify, toDefault } from '../utils/page-model.js';
import { figureParts } from './figure.js';

/* a figure inside a column stays in its cell as default content: text, image, caption */
function figureContent(document, el) {
  const { before, pictures, after } = figureParts(el, document);
  const out = [...before];
  if (pictures.length) out.push(h(document, 'p', pictures[0]));
  return [...out, ...after];
}

export default function parse(element, { document }) {
  const variant = element.getAttribute('data-mim-columns') || '';
  const cols = [...element.querySelectorAll(':scope > .column-container__container > .column-container__column')];
  const cells = cols.map((col) => [...col.children].flatMap((c) => {
    const k = classify(c);
    if (k.kind === 'block' && k.name === 'figure') return figureContent(document, c);
    return k.kind === 'default' ? toDefault(document, c, k.name) : [];
  }));
  element.replaceWith(block(document, 'Columns', variant ? [variant] : [], [cells.map((c) => (c.length ? c : ''))]));
}
