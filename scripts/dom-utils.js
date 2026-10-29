/*
 * DOM helpers without imports (header and attestation load before the listing / index code).
 * Re-exported by scripts/block-utils.js.
 */

/**
 * Whether a path is a site part rather than a visitor page: nav, footer, fragments and the block
 * library (/library/**, shown in DA's Insert block preview). These get no investor disclaimer.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isChromePath(pathname) {
  return /^\/(nav|footer)$|\/fragments\/|^\/library\//.test(pathname);
}

/**
 * Creates an element.
 * @param {string} tag
 * @param {object|string} [attrs] attributes (`class`, `text`, others as attributes; `true` =
 *   empty attribute; `false`, `null`, `undefined` skipped) or a class name
 * @param {...(Node|string|Array)} children nodes or text; `null`, `undefined`, `false` and ''
 *   are skipped
 * @returns {HTMLElement}
 */
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

/**
 * Splits a block's rows into settings rows and content rows. A settings row has a known key in
 * its first cell and a value cell; it stays in the block, marked `data-config` (hidden on pages,
 * shown in quick edit, styles.css), so authors can still edit it in Canvas.
 * @param {Element} block
 * @param {string[]} keys lower-case keys
 * @param {object} [options]
 * @param {string[]} [options.hrefKeys] keys whose value is the cell's link href, when the cell
 *   has a link outside a list (default: all keys)
 * @param {(cells: Element[]) => boolean} [options.accept] extra test a settings row must pass
 * @returns {{ config: Object<string, string>, cells: Object<string, Element>,
 *   settings: Element[], items: Element[] }} values, value cells and rows by kind
 */
export function readRows(block, keys, { hrefKeys = keys, accept } = {}) {
  const config = {};
  const cells = {};
  const settings = [];
  const items = [];
  [...block.children].forEach((row) => {
    const rowCells = [...row.children];
    const key = rowCells[0]?.textContent.trim().toLowerCase();
    if (rowCells.length >= 2 && keys.includes(key) && (!accept || accept(rowCells))) {
      const [, cell] = rowCells;
      const link = hrefKeys.includes(key) && !cell.querySelector('li') ? cell.querySelector('a[href]') : null;
      config[key] = (link ? link.getAttribute('href') : cell.textContent).trim();
      cells[key] = cell;
      row.dataset.config = key;
      settings.push(row);
    } else {
      items.push(row);
    }
  });
  return {
    config, cells, settings, items,
  };
}
