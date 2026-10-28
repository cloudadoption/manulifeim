/*
 * DOM helpers without imports (header and attestation load before the listing / index code).
 * Re-exported by scripts/block-utils.js.
 */

/**
 * Creates an element.
 * @param {string} tag
 * @param {object|string} [attrs] attributes (`class`, `text`, others as attributes; `true` =
 *   empty attribute; `false`, `null`, `undefined` skipped) or a class name
 * @param {...(Node|string|Array)} children nodes or text; `null`, `undefined`, `false` and ''
 *   are skipped
 * @returns {HTMLElement}
 */
// eslint-disable-next-line import/prefer-default-export
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  const props = typeof attrs === 'string' ? { class: attrs } : (attrs || {});
  Object.entries(props).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach((c) => {
    if (c === undefined || c === null || c === false || c === '') return;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}
