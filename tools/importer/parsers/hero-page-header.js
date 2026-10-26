/* eslint-disable */
/* global WebImporter */
/*
 * Parser: hero-page-header. Live: .heroHeader2 (viewpoints, strategies, team, resources,
 * case-study listing header) and .pressReleaseRoot__header (press listing, heroHeader).
 * Project contract (block-authoring.md, blocks/hero/hero.js):
 *   | Hero (page-header[, dark]) |
 *   | (opt) icon image 48px | # Title / (opt) p subtitle / (opt) link CTA |
 */
import {
  h, image, linkFrom, text, block,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const banner = element.querySelector('.heroHeader2__banner, .heroHeader__banner') || element;
  const variants = ['page-header'];
  if (/--dark\b|theme-dark/.test(banner.className) || banner.getAttribute('data-theme') === 'dark') variants.push('dark');
  const icon = image(document, banner.querySelector('.heroHeader2__icon, .heroHeader__icon'));
  const content = [];
  const title = banner.querySelector('.heroHeader2__title, .heroHeader__title, h1');
  if (text(title)) content.push(h(document, 'h1', title.innerHTML.trim()));
  const sub = banner.querySelector('.heroHeader2__subtitle, .heroHeader__subtitle');
  if (sub) {
    const clone = sub.cloneNode(true);
    clone.querySelectorAll('a.heroHeader2__cta, a.heroHeader__cta').forEach((a) => a.remove());
    if (text(clone)) content.push(h(document, 'p', clone.innerHTML.trim()));
  }
  banner.querySelectorAll('a.heroHeader2__cta, a.heroHeader__cta').forEach((a) => content.push(linkFrom(document, a)));
  const rows = icon ? [[icon, content.filter(Boolean)]] : [[content.filter(Boolean)]];
  element.replaceWith(block(document, 'Hero', variants, rows));
}
