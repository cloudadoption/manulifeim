/* eslint-disable */
/* global WebImporter */
/*
 * Parser: hero-carousel. Live: .rotatingBanner (RotatingBanner), homepage.
 * Project contract (migration-work/analysis/block-authoring.md, blocks/hero/hero.js),
 * which replaces the generic library hero for this site:
 *   | Hero (carousel) |
 *   | Speed | 5 |                                   (optional, first row)
 *   | image | # Title / p / **link** |              (one row per slide)
 * Slide 1 holds the h1, later slides an h2.
 */
import {
  h, image, inlineHtml, linkFrom, text, block,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [];
  const speed = element.querySelector('[data-speed]');
  if (speed && speed.getAttribute('data-speed')) rows.push(['Speed', speed.getAttribute('data-speed')]);
  element.querySelectorAll('.rotatingBanner__slide').forEach((slide, i) => {
    const img = image(document, slide.querySelector('.rotatingBanner__img img, img'));
    const content = [];
    const title = slide.querySelector('.rotatingBanner__title');
    const html = inlineHtml(title);
    if (html) content.push(h(document, i === 0 ? 'h1' : 'h2', html));
    const sub = slide.querySelector('.rotatingBanner__subtitle');
    if (text(sub)) content.push(h(document, 'p', sub.innerHTML.trim()));
    slide.querySelectorAll('.rotatingBanner__buttons a').forEach((a, j) => {
      const secondary = /secondary/.test(a.className) || j > 0;
      content.push(linkFrom(document, a, { bold: !secondary, italic: secondary }));
    });
    rows.push([img || '', content.filter(Boolean)]);
  });
  element.replaceWith(block(document, 'Hero', ['carousel'], rows));
}
