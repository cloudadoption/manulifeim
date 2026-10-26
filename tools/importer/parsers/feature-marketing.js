/* eslint-disable */
/* global WebImporter */
/*
 * Parser: feature-marketing. Live: .marketingSection (hub / landing pages).
 * Project contract (block-authoring.md, blocks/feature/feature.js):
 *   | Feature (marketing[, navy|purple|green|blue|white][, overlap][, short]) |
 *   | (opt) icon image (first paragraph) / ## Title / p / (opt) link | image |
 * Colour from marketingSection__wrap--<colour>, --overlay -> overlap, --short -> short.
 * Import from the rendered DOM (live JS removes duplicate hidden text).
 */
import {
  h, image, block, text, linkFrom, inlineHtml,
} from '../utils/dom.js';

const COLOURS = ['navy', 'purple', 'green', 'blue', 'white'];

export default function parse(element, { document }) {
  const wrap = element.querySelector('.marketingSection__wrap') || element;
  const variants = ['marketing'];
  const colour = COLOURS.find((c) => wrap.classList.contains(`marketingSection__wrap--${c}`));
  if (colour) variants.push(colour);
  if (wrap.classList.contains('marketingSection__wrap--overlay')) variants.push('overlap');
  if (wrap.classList.contains('marketingSection__wrap--short')) variants.push('short');

  const content = [];
  const icon = image(document, wrap.querySelector('.marketingSection__icon'));
  if (icon) content.push(h(document, 'p', icon));
  const title = wrap.querySelector('.marketingSection__title');
  const html = inlineHtml(title);
  if (html) content.push(h(document, 'h2', html));
  wrap.querySelectorAll('.marketingSection__description').forEach((d) => {
    if (text(d)) content.push(h(document, 'p', d.innerHTML.trim()));
  });
  wrap.querySelectorAll('.marketingSection__content a, a.marketingSection__link').forEach((a) => {
    if (!a.closest('.marketingSection__description')) content.push(linkFrom(document, a));
  });
  const pic = image(document, wrap.querySelector('.marketingSection__image img'));
  element.replaceWith(block(document, 'Feature', variants, [[content.filter(Boolean), pic || '']]));
}
