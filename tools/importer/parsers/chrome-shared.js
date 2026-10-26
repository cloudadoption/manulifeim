/* eslint-disable */
/*
 * Shared helpers for the chrome parsers (chrome-nav, chrome-footer, chrome-attestation,
 * chrome-region-select). They read the live chrome markup of a snapshot (header.header,
 * nav.sidebar, .siteBanner, footer.footer, dialog#region-modal) and build the DA documents
 * the EDS header / footer blocks and the attestation modal read (see
 * migration-work/analysis/chrome.md). Links are rewritten afterwards by import-chrome.js
 * with utils/links.js; an element with data-live-href keeps that absolute live URL.
 */
import { norm, bestSrc } from '../utils/dom.js';

export { norm };

export function el(document, tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  });
  children.flat().filter((c) => c !== null && c !== undefined && c !== '').forEach((c) => {
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

/** Visible text of a node (svg / img removed), whitespace collapsed. */
export function label(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  clone.querySelectorAll('svg, img, script, style').forEach((n) => n.remove());
  return norm(clone.textContent);
}

/** <p><img></p> from a live <img> (absolute src). */
export function imageParagraph(document, img, alt) {
  const src = bestSrc(img);
  if (!src) return null;
  const out = el(document, 'img', { src });
  const a = alt !== undefined ? alt : norm(img.getAttribute('alt'));
  if (a) out.setAttribute('alt', a);
  return el(document, 'p', {}, out);
}

/** A link, optionally bold; `live` pins the href to that absolute live URL (no rewrite). */
export function link(document, href, text, { bold = false, live = null } = {}) {
  const a = el(document, 'a', { href, 'data-live-href': live || undefined }, text);
  return bold ? el(document, 'strong', {}, a) : a;
}

/** Wraps sections (arrays of nodes) into one container, separated by <hr> (DA sections). */
export function sections(document, list) {
  const root = document.createElement('div');
  list.forEach((nodes, i) => {
    if (i > 0) root.append(document.createElement('hr'));
    nodes.filter(Boolean).forEach((n) => root.append(n));
  });
  return root;
}

/** Clean copies of the rich text children of a live container (no classes, svg, scripts). */
export function richText(document, container) {
  const out = [];
  if (!container) return out;
  [...container.children].forEach((n) => {
    if (/^(SCRIPT|STYLE|SVG)$/i.test(n.tagName)) return;
    const clone = n.cloneNode(true);
    clone.querySelectorAll('svg, script, style').forEach((x) => x.remove());
    [clone, ...clone.querySelectorAll('*')].forEach((x) => {
      ['class', 'style', 'id'].forEach((a) => x.removeAttribute(a));
    });
    out.push(clone);
  });
  return out;
}
