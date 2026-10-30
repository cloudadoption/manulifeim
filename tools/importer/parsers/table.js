/* eslint-disable */
/* global WebImporter */
/*
 * Parser: table. Live: .table2 (Table, card + headerRowColumn), the rich-text
 * .table.parbase tables of older articles and .strategyDetailTable (the card of strategy links on
 * the capability pages: no header row).
 * Project contract (block-authoring.md, blocks/table/table.js); library Table shape
 * (one block row per data row; "no header" variant name is the project's `no-header`):
 *   | Table (card, header-row-column) |
 *   | ## Title (optional single-cell row) |
 *   | header cells ... |
 *   | data cells ... |
 *   | Source: ... (optional single-cell caption row) |
 * data-table-style: headerRow -> header-row, headerColumn -> header-column,
 * headerRowColumn -> header-row-column, other -> no-header. table2__main--card -> card.
 */
import {
  h, block, richText, text,
} from '../utils/dom.js';

const MODES = {
  headerRow: 'header-row', headerColumn: 'header-column', headerRowColumn: 'header-row-column',
};

export default function parse(element, { document }) {
  const main = element.querySelector('.table2__main, .strategyDetailTable__main');
  const variants = [];
  if (main && /__main--card/.test(main.className)) variants.push('card');
  const style = main ? main.getAttribute('data-table-style') : '';
  const table = element.querySelector('table');
  if (!table) {
    element.remove();
    return;
  }
  const trs = [...table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
  if (MODES[style]) variants.push(MODES[style]);
  else if (trs[0] && trs[0].querySelector('th')) variants.push('header-row');
  else variants.push('no-header');

  const rows = [];
  const title = element.querySelector('.table2__title');
  if (text(title)) rows.push([h(document, 'h2', title.innerHTML.trim())]);
  trs.forEach((tr) => {
    const cells = [...tr.children].filter((c) => /^T[DH]$/.test(c.tagName)).map((c) => {
      const nodes = richText(document, c);
      return nodes.length ? nodes : '';
    });
    if (cells.length) rows.push(cells);
  });
  const caption = element.querySelector('figcaption, .table2__caption');
  if (text(caption)) rows.push([h(document, 'p', caption.innerHTML.trim())]);
  element.replaceWith(block(document, 'Table', variants, rows));
}
