/* eslint-disable */
/* global WebImporter */
/*
 * Parser: cards-case-studies. Live: .caseStudyResults (React CaseStudyList, rendered DOM:
 * the 9 cards shown on load, sorted newest first). Not mapped any more: the case-study
 * list app (.caseStudyList__app) is imported as Listing (case-studies) by the listing parser.
 * Project contract (block-authoring.md, blocks/cards/cards.js); library Cards row shape:
 *   | Cards (separate, three) |
 *   | image | ### [Title](/sustainable-investing-case-studies/...) / p tag pills / [Read more](...) |
 * Card links are AEM-internal (/content/mim-institutional/...html); the links transformer
 * rewrites them to EDS paths. Pills (region, theme, asset class) become one text paragraph.
 */
import {
  h, image, linkFrom, block, text,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [...element.querySelectorAll('.caseStudyResults__article')].map((art) => {
    const img = image(document, art.querySelector('.caseStudyResults__image, img'));
    const content = [];
    const title = art.querySelector('.caseStudyResults__title');
    const a = title && title.querySelector('a');
    if (a) {
      const link = document.createElement('a');
      link.setAttribute('href', a.getAttribute('href'));
      link.textContent = text(a);
      content.push(h(document, 'h3', link));
    } else if (text(title)) content.push(h(document, 'h3', text(title)));
    const desc = art.querySelector('.caseStudyResults__description');
    if (text(desc)) content.push(h(document, 'p', desc.innerHTML.trim()));
    const pills = [...art.querySelectorAll('.caseStudyPills__link')].map(text).filter(Boolean);
    if (pills.length) content.push(h(document, 'p', pills.join(', ')));
    const more = art.querySelector('.caseStudyResults__readMore');
    if (more) content.push(linkFrom(document, more));
    return [img || '', content.filter(Boolean)];
  });
  element.replaceWith(block(document, 'Cards', ['separate', 'three'], rows));
}
