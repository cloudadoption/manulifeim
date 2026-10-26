/* eslint-disable */
/* global WebImporter */
/*
 * Parser: title. Live: .richTitle (rich title: section heading + optional link).
 * Project contract (block-authoring.md, blocks/title/title.js):
 *   | Title |
 *   | ## We're committed to making a positive *impact* | (opt) [Learn more about sustainability](...) |
 * The live h2 sometimes wraps its text in a styled <div>; it is flattened, <em>/<i>/<sup> kept.
 */
import {
  h, block, inlineHtml, linkFrom,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const hd = element.querySelector('.richtitle__text, h1, h2, h3');
  const level = hd && /^H[1-6]$/.test(hd.tagName) ? Number(hd.tagName[1]) : 2;
  const html = inlineHtml(hd);
  const heading = html ? h(document, `h${level}`, html) : '';
  const a = element.querySelector('.richtitle__link a');
  const link = a ? linkFrom(document, a) : null;
  const row = link ? [heading, link] : [heading];
  element.replaceWith(block(document, 'Title', [], [row]));
}
