/* eslint-disable */
/* global WebImporter */
/*
 * Parser: feature-banner. Live: .featureBanner (about-us "Local insight, global reach").
 * Project contract (block-authoring.md, blocks/feature/feature.js):
 *   | Feature (banner[, overlap]) |
 *   | ## **Local insight, global reach** / p body | desktop illustration / (opt) mobile image |
 * On live the title and the body both sit inside the h2: the first paragraph becomes the h2,
 * the following paragraphs become body paragraphs.
 */
import {
  h, image, block, text, bestSrc,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const wrap = element.querySelector('.featureBanner__wrap') || element;
  const variants = ['banner'];
  if (wrap.classList.contains('featureBanner__wrap--overlay')) variants.push('overlap');
  const content = [];
  const title = wrap.querySelector('.featureBanner__title');
  if (title) {
    const paras = [...title.children].filter((c) => c.tagName === 'P' && text(c));
    if (paras.length) {
      content.push(h(document, 'h2', paras[0].innerHTML.trim()));
      paras.slice(1).forEach((p) => content.push(h(document, 'p', p.innerHTML.trim())));
    } else if (text(title)) content.push(h(document, 'h2', title.innerHTML.trim()));
  }
  wrap.querySelectorAll('.featureBanner__content > p, .featureBanner__description').forEach((p) => {
    if (text(p)) content.push(h(document, 'p', p.innerHTML.trim()));
  });
  const desktop = wrap.querySelector('.featureBanner__image__src');
  const mobile = wrap.querySelector('.featureBanner__mobileImage');
  const pics = [image(document, desktop)];
  if (mobile && bestSrc(mobile) !== bestSrc(desktop)) pics.push(image(document, mobile));
  element.replaceWith(block(document, 'Feature', variants, [[content, pics.filter(Boolean)]]));
}
