/* eslint-disable */
/* global WebImporter */
/*
 * Parser: cards-articles. Live: .articleGroup > article.article-kicker--featured-small.
 * Project contract (block-authoring.md, blocks/cards/cards.js); library Cards row shape
 * (image cell + text cell):
 *   | Cards[ (two|four)] |
 *   | image | (opt) p date / ## Title / (opt) authors list / p text / [Read more](...) |
 * articleGroup__column-fw3 -> 3 columns (no variant); fw2 -> two; fw4 -> four.
 * Authors list items: [photo] **Name, CFA**, Position<br>Company
 */
import {
  h, image, linkFrom, block, text, inlineHtml, parseAuthorContainer, authorsList,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const container = element.querySelector('.articleGroup__container');
  const variants = [];
  const m = container && container.className.match(/column-fw(\d)/);
  if (m && m[1] === '2') variants.push('two');
  if (m && m[1] === '4') variants.push('four');

  const rows = [...element.querySelectorAll('article.article-kicker')].map((art) => {
    const img = image(document, art.querySelector('.article-kicker__image img'));
    const content = [];
    const date = art.querySelector('.article__date');
    if (text(date)) content.push(h(document, 'p', text(date)));
    const title = inlineHtml(art.querySelector('.article__title'));
    if (title) content.push(h(document, 'h2', title));
    const authors = [...art.querySelectorAll('.article__author .author-container')].map(parseAuthorContainer)
      .filter((a) => a.name);
    if (authors.length) content.push(authorsList(document, authors));
    const desc = art.querySelector('.article__text');
    if (text(desc)) content.push(h(document, 'p', desc.innerHTML.trim()));
    const link = art.querySelector('.article__link a');
    if (link) content.push(linkFrom(document, link));
    return [img || '', content.filter(Boolean)];
  });
  element.replaceWith(block(document, 'Cards', variants, rows));
}
