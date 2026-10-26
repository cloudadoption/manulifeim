/* eslint-disable */
/* global WebImporter */
/*
 * Parser: feature-kicker. Live: .featureKicker__component-wrapper (FeatureKicker),
 * viewpoints featured article and landing-page video teasers.
 * Project contract (block-authoring.md, blocks/feature/feature.js):
 *   | Feature (kicker) |
 *   | ## Title / authors list / p summary / [Read more](...) | image |
 * Authors list items: [photo] **Name**, Position. Video links (data-videomodal) become
 * Brightcove player URLs in the links transformer.
 */
import {
  h, image, block, text, linkFrom, inlineHtml, parseAuthorContainer, authorsList,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const content = [];
  const title = element.querySelector('.featureKicker__title');
  const html = inlineHtml(title);
  if (html) content.push(h(document, 'h2', html));
  const authors = [...element.querySelectorAll('.author-container')].map(parseAuthorContainer).filter((a) => a.name);
  if (authors.length) content.push(authorsList(document, authors));
  const sub = element.querySelector('.featureKicker__subtitle');
  if (text(sub)) content.push(h(document, 'p', sub.innerHTML.trim()));
  element.querySelectorAll('a.featureKicker__link').forEach((a) => {
    const p = linkFrom(document, a);
    if (p && a.getAttribute('data-videomodal')) {
      const link = p.querySelector('a');
      ['data-videomodal', 'data-brightcoveid', 'data-playerid'].forEach((k) => {
        if (a.getAttribute(k)) link.setAttribute(k, a.getAttribute(k));
      });
    }
    content.push(p);
  });
  const pic = image(document, element.querySelector('.featureKicker__image img'));
  element.replaceWith(block(document, 'Feature', ['kicker'], [[content.filter(Boolean), pic || '']]));
}
