/* eslint-disable */
/* global WebImporter */
/*
 * Parser: figure. Live: .landingImage2 (LandingImageCard) and .landingimage (older
 * articles): chart / image with a title above and a source caption below.
 * Project contract (block-authoring.md, blocks/figure/figure.js), single column:
 *   | Figure[ (card)][ (left|right)] |
 *   | rich text above the image (rows before the image row) |
 *   | image (+ optional mobile image in the same cell) |
 *   | caption (rows after the image row) |
 * --showCard -> card; --left / --right -> left / right. Content placed before the image in
 * the live DOM is text, content after it (and the figcaption) is the caption.
 */
import {
  image, block, richText, h, text, bestSrc,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const inner = element.querySelector('.landingImage2__inner, .landingimage__inner') || element;
  const cls = inner.className;
  const variants = [];
  if (/--showCard/.test(cls)) variants.push('card');
  if (/--left\b/.test(cls)) variants.push('left');
  if (/--right\b/.test(cls)) variants.push('right');

  const before = [];
  const after = [];
  let pictures = [];
  let seenImage = false;
  const walk = (node) => {
    [...node.children].forEach((c) => {
      if (/__card$/.test(c.className.split(' ')[0])) {
        walk(c);
        return;
      }
      if (c.querySelector('img') || c.tagName === 'IMG') {
        seenImage = true;
        const imgs = [...(c.tagName === 'IMG' ? [c] : c.querySelectorAll('img'))];
        const seen = new Set();
        pictures = imgs.map((i) => {
          const src = bestSrc(i);
          if (!src || seen.has(src)) return null;
          seen.add(src);
          return image(document, i);
        }).filter(Boolean);
        c.querySelectorAll('figcaption').forEach((fc) => {
          if (text(fc)) after.push(h(document, 'p', fc.innerHTML.trim()));
        });
        return;
      }
      const nodes = richText(document, c);
      (seenImage ? after : before).push(...nodes);
    });
  };
  walk(inner);
  const rows = [];
  if (before.length) rows.push([before]);
  if (pictures.length) rows.push([pictures]);
  if (after.length) rows.push([after]);
  element.replaceWith(block(document, 'Figure', variants, rows));
}
