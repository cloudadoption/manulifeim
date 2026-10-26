/* eslint-disable */
/* global WebImporter */
/*
 * Parser: search. Live: .search > atomic-search-interface (Coveo Atomic, fully
 * client-rendered; nothing to import). EDS rebuilds the page with the `search` block
 * (blocks/search), which searches the query index client-side and reads ?q= (the header
 * search form submits to /institutional/tw/en/search?q=term).
 *   | Search |                                                   |
 *   | Source | /institutional/tw/en/query-index.json             |
 *   | Limit  | 10                                                |   (results per page, live 10)
 */
import { block } from '../utils/dom.js';
import { SITE_ROOT } from '../utils/links.js';

export const QUERY_INDEX = `${SITE_ROOT}/query-index.json`;

export default function parse(element, { document }) {
  const pager = element.querySelector('atomic-results-per-page');
  const size = (pager && (pager.getAttribute('initial-choice') || pager.getAttribute('initialchoice'))) || '10';
  element.replaceWith(block(document, 'Search', [], [['Source', QUERY_INDEX], ['Limit', size]]));
}
