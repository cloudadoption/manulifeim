/* eslint-disable */
/* global WebImporter */
/*
 * Parser: related-articles. Live: footer.viewpoints-footer .related-viewpoints (curated).
 * Project contract (block-authoring.md, blocks/related-articles/related-articles.js),
 * static teaser rows so date, title, authors and summary stay 1:1 with live:
 *   | Related Articles |
 *   | Title | Related viewpoints |
 *   | p date / ### [Title](/viewpoints/...) / authors list / p summary |   (one row per item)
 */
import {
  h, block, text, parseAuthorContainer, authorsList,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [];
  const title = text(element.querySelector('.related-viewpoints__title'));
  if (title) rows.push(['Title', title]);
  element.querySelectorAll('.related-viewpoints__item').forEach((item) => {
    const content = [];
    const date = item.querySelector('.article__date');
    if (text(date)) content.push(h(document, 'p', text(date)));
    const a = item.querySelector('a.article-kicker__title-link, .article__title a');
    if (a) {
      const link = document.createElement('a');
      link.setAttribute('href', a.getAttribute('href'));
      link.textContent = text(a);
      content.push(h(document, 'h3', link));
    }
    const authors = [...item.querySelectorAll('.author-container')].map(parseAuthorContainer).filter((x) => x.name);
    if (authors.length) content.push(authorsList(document, authors));
    const desc = item.querySelector('.article__text');
    if (text(desc)) content.push(h(document, 'p', desc.innerHTML.trim()));
    if (content.length) rows.push([content]);
  });
  element.replaceWith(block(document, 'Related Articles', [], rows));
}
