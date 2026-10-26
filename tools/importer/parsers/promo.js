/* eslint-disable */
/* global WebImporter */
/*
 * Parser: promo. Live: .simpleBanner (SimpleBanner), one or two coloured items.
 * Project contract (block-authoring.md, blocks/promo/promo.js):
 *   | Promo (<colour>[, double]) |
 *   | image | ## Title / p / [Learn more](...) | (opt) colour |   (one row per item)
 * Colour of the first item is the block variant; each row carries its own colour.
 * A title made of several <p>s (e.g. "Latest asset allocation views" + <sup>June 2026</sup>)
 * is joined with <br>.
 */
import {
  h, image, block, text, linkFrom, inlineHtml,
} from '../utils/dom.js';

const COLOURS = ['green', 'navy', 'blue', 'gold', 'violet', 'white'];

export default function parse(element, { document }) {
  const items = [...element.querySelectorAll('.simpleBanner__item')];
  const colourOf = (it) => COLOURS.find((c) => it.classList.contains(`simpleBanner__item--${c}`)) || '';
  const variants = [colourOf(items[0]) || 'green'];
  const main = element.querySelector('.simpleBanner__main');
  if (items.length > 1 || (main && main.classList.contains('simpleBanner__main--double'))) variants.push('double');
  const rows = items.map((it) => {
    const content = [];
    const title = it.querySelector('.simpleBanner__title');
    const html = inlineHtml(title);
    if (html) content.push(h(document, title && /^H[1-6]$/.test(title.tagName) ? title.tagName.toLowerCase() : 'h2', html));
    const sub = it.querySelector('.simpleBanner__subtitle');
    if (sub) {
      const paras = [...sub.children].filter((c) => text(c));
      if (paras.length) paras.forEach((p) => content.push(h(document, 'p', p.innerHTML.trim())));
      else if (text(sub)) content.push(h(document, 'p', sub.innerHTML.trim()));
    }
    it.querySelectorAll('a.simpleBanner__link').forEach((a) => content.push(linkFrom(document, a)));
    const img = image(document, it.querySelector('.simpleBanner__image img'));
    return [img || '', content.filter(Boolean), colourOf(it)];
  });
  element.replaceWith(block(document, 'Promo', variants, rows));
}
