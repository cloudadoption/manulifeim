/* eslint-disable */
/* global WebImporter */
/*
 * Parser: title. Live: .richTitle (rich title: section heading + optional link).
 * Project contract (block-authoring.md, blocks/title/title.js):
 *   | Title |
 *   | ## We're committed to making a positive *impact* | (opt) [Learn more about sustainability](...) |
 * The live h2 sometimes wraps its text in a styled <div>; it is flattened, <em>/<i>/<sup> kept.
 * Since remediation 5 a title that is its section's only component is imported as default
 * content (heading + link paragraph) with Section Metadata Style `title-row`.
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
  // remediation 5: default content in a `title-row` section when the title is the
  // section's only component (always so on component-root pages), else the Title block
  const sec = element.closest('.mim-section');
  if (heading && sec && [...sec.children].every((c) => c === element)) {
    let meta = {};
    try {
      meta = JSON.parse(sec.getAttribute('data-mim') || '{}');
    } catch (e) {
      meta = {};
    }
    const styles = (meta.Style || '').split(',').map((st) => st.trim()).filter(Boolean);
    if (!styles.includes('title-row')) styles.push('title-row');
    meta.Style = styles.join(', ');
    sec.setAttribute('data-mim', JSON.stringify(meta));
    element.replaceWith(...[heading, link].filter(Boolean));
    return;
  }
  const row = link ? [heading, link] : [heading];
  element.replaceWith(block(document, 'Title', [], [row]));
}
