/* eslint-disable */
/* global WebImporter */
/*
 * Parser: article-list. Live: .latestViewpoints (LatestViewpointsV3; homepage, viewpoints:
 * the N newest viewpoints, not curated). The rows keep the live items 1:1 and add a
 * `Source` row, so the block refreshes them from the query index ("latest N" stays current).
 * Viewpoints category pages (.list.viewpointsList) are imported by the listing parser
 * (Listing (viewpoints)); the branch below is kept for reference / older template maps.
 * Project contract (block-authoring.md, blocks/article-list/article-list.js):
 *   | Article List |
 *   | Source | /institutional/tw/en/query-index-viewpoints.json |   (latestViewpoints: newest first)
 *   | Title  | Latest viewpoints |          (only when the live header text is not empty)
 *   | Link   | [All viewpoints](...) |
 *   | Filter | category=<slug> |            (category pages; reserved for the index feed)
 *   | Limit  | 3 |
 *   | View   | list | card |
 *   | image  | p date / ### [Title](...) / authors list / p description |   (one row per item)
 */
import {
  h, image, block, text, linkFrom, parseAuthorContainer, authorsList,
} from '../utils/dom.js';
import { lastSegment, SITE_ROOT } from '../utils/links.js';

function teaser(document, item, sel) {
  const img = image(document, item.querySelector(sel.img));
  const content = [];
  const date = item.querySelector(sel.date);
  if (text(date)) content.push(h(document, 'p', text(date)));
  const a = item.querySelector(sel.title);
  if (a) {
    const link = document.createElement('a');
    link.setAttribute('href', a.getAttribute('href'));
    link.textContent = text(a);
    content.push(h(document, 'h3', link));
  }
  const authors = [...item.querySelectorAll('.author-container')].map(parseAuthorContainer).filter((x) => x.name);
  if (authors.length) content.push(authorsList(document, authors));
  const desc = item.querySelector(sel.desc);
  if (text(desc)) content.push(h(document, 'p', desc.innerHTML.trim()));
  return [img || '', content.filter(Boolean)];
}

export default function parse(element, { document, livePath }) {
  const rows = [];
  if (element.classList.contains('viewpointsList')) {
    const slug = lastSegment(livePath || '');
    if (slug && slug !== 'viewpoints') rows.push(['Filter', `category=${slug}`]);
    const items = [...element.querySelectorAll('.viewpointList__item')];
    rows.push(['Limit', String(items.length || 10)], ['View', 'list']);
    items.forEach((it) => rows.push(teaser(document, it, {
      img: '.viewpointList__img, .viewpointList__imgWrap img',
      date: '.viewpointList__date time, .viewpointList__date',
      title: '.viewpointList__titleLink, .viewpointList__title a',
      desc: '.viewpointList__desc',
    })));
  } else {
    rows.push(['Source', `${SITE_ROOT}/query-index-viewpoints.json`]);
    const headerText = element.querySelector('.latestViewpoints__headerText');
    if (text(headerText)) rows.push(['Title', text(headerText)]);
    const viewAll = element.querySelector('.latestViewpoints__headerViewAll a');
    if (viewAll) rows.push(['Link', linkFrom(document, viewAll)]);
    const items = [...element.querySelectorAll('.latestViewpoints__item')];
    rows.push(['Limit', String(items.length || 3)]);
    const cardActive = element.querySelector('.latestViewpoints__headerControlsItem--card.latestViewpoints__headerControlsItem--active');
    rows.push(['View', cardActive ? 'card' : 'list']);
    items.forEach((it) => rows.push(teaser(document, it, {
      img: '.latestViewpoints__img',
      date: '.latestViewpoints__date time, .latestViewpoints__date',
      title: '.latestViewpoints__titleLink, .latestViewpoints__title a',
      desc: '.latestViewpoints__description',
    })));
  }
  element.replaceWith(block(document, 'Article List', [], rows));
}
