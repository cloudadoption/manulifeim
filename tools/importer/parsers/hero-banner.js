/* eslint-disable */
/* global WebImporter */
/*
 * Parser: hero-banner. Live: .extendedHeroBanner2 (hub, landing pages).
 * Project contract (block-authoring.md, blocks/hero/hero.js):
 *   | Hero (banner[, light][, overlap][, tall]) |
 *   | desktop image | (opt) p <sup>eyebrow</sup> / # Title / p / **link** |
 *   | (opt) mobile image |   (only when it differs from the desktop image)
 * Variants: theme-light -> light, --overlay -> overlap, no --short -> tall.
 * The live h1 wraps <p>s: a <p> holding only a <sup> before the title becomes the eyebrow,
 * empty / &nbsp; paragraphs are dropped, the rest is flattened into one h1.
 */
import {
  h, image, linkFrom, text, block, bestSrc, norm,
} from '../utils/dom.js';

function titleParts(document, title) {
  const out = [];
  if (!title) return out;
  const paras = [...title.children].filter((c) => c.tagName === 'P');
  if (!paras.length) {
    const hd = h(document, 'h1', title.innerHTML.replace(/^(\s|<br\s*\/?>|&nbsp;)+|(\s|<br\s*\/?>|&nbsp;)+$/gi, ''));
    if (text(hd)) out.push(hd);
    return out;
  }
  const words = [];
  paras.forEach((p) => {
    if (!text(p)) return;
    const sup = p.querySelector('sup');
    const onlySup = sup && norm(sup.textContent) === text(p);
    if (onlySup && !words.length) {
      out.push(h(document, 'p', `<sup>${text(sup)}</sup>`));
    } else {
      words.push(p.innerHTML.replace(/&nbsp;/g, ' ').replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '').trim());
    }
  });
  if (words.length) out.push(h(document, 'h1', words.join('<br>')));
  return out;
}

export default function parse(element, { document }) {
  const wrap = element.querySelector('.extendedHeroBanner2__wrap') || element;
  const cls = wrap.className;
  const variants = ['banner'];
  if (/theme-light/.test(cls)) variants.push('light');
  if (/--overlay/.test(cls)) variants.push('overlap');
  if (!/--short/.test(cls)) variants.push('tall');

  const desktop = wrap.querySelector('.extendedHeroBanner2__image__src');
  const mobile = wrap.querySelector('.extendedHeroBanner2__mobileImage');
  const content = titleParts(document, wrap.querySelector('.extendedHeroBanner2__title, h1'));
  const sub = wrap.querySelector('.extendedHeroBanner2__subtitle');
  if (text(sub)) content.push(h(document, 'p', sub.innerHTML.trim()));
  wrap.querySelectorAll('.extendedHeroBanner2__buttons a, .extendedHeroBanner2__content > a').forEach((a, j) => {
    const secondary = /secondary/.test(a.className) || j > 0;
    content.push(linkFrom(document, a, { bold: !secondary, italic: secondary }));
  });

  const rows = [[image(document, desktop) || '', content.filter(Boolean)]];
  if (mobile && bestSrc(mobile) && bestSrc(mobile) !== bestSrc(desktop)) rows.push([image(document, mobile)]);
  element.replaceWith(block(document, 'Hero', variants, rows));
}
