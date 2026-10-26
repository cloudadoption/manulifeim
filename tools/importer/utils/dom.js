/* global WebImporter */
/*
 * DOM helpers shared by parsers and transformers. Everything here works on the
 * snapshot DOM loaded with page.setContent (document.location is about:blank), so
 * URLs are always read with getAttribute and resolved against the live origin.
 */
import { absoluteAssetUrl } from './links.js';

export const norm = (s) => (s || '').replace(/[\s\u00a0]+/g, ' ').trim();

/** Text of an element with whitespace collapsed. */
export const text = (el) => norm(el ? el.textContent : '');

/** Best image source of an <img>: src, else lazy-load attributes; never data: placeholders. */
export function bestSrc(img) {
  if (!img) return '';
  const candidates = [
    img.getAttribute('src'),
    img.getAttribute('data-src'),
    img.getAttribute('data-lazy-src'),
    (img.getAttribute('srcset') || img.getAttribute('data-srcset') || '').split(',').pop().trim().split(/\s+/)[0],
  ].filter((s) => s && !/^data:/i.test(s));
  return candidates.length ? absoluteAssetUrl(candidates[0]) : '';
}

/** A clean <img> (absolute src, alt) built from a source <img>, or null. */
export function image(document, img, altOverride) {
  const src = bestSrc(img);
  if (!src) return null;
  const out = document.createElement('img');
  out.setAttribute('src', src);
  const alt = altOverride !== undefined ? altOverride : (img.getAttribute('alt') || '');
  if (alt) out.setAttribute('alt', norm(alt));
  return out;
}

/** <img> from a plain URL. */
export function imageFromUrl(document, src, alt = '') {
  if (!src) return null;
  const out = document.createElement('img');
  out.setAttribute('src', absoluteAssetUrl(src));
  if (alt) out.setAttribute('alt', alt);
  return out;
}

/** Creates an element with optional innerHTML / children. */
export function h(document, tag, content) {
  const e = document.createElement(tag);
  if (typeof content === 'string') e.innerHTML = content;
  else if (Array.isArray(content)) content.filter(Boolean).forEach((c) => e.append(c));
  else if (content) e.append(content);
  return e;
}

/** Paragraph with a single link: [text](href), optionally bold / italic. */
export function linkParagraph(document, href, label, { bold = false, italic = false } = {}) {
  if (!href) return null;
  const a = document.createElement('a');
  a.setAttribute('href', href);
  a.textContent = norm(label) || href;
  let node = a;
  if (italic) node = h(document, 'em', node);
  if (bold) node = h(document, 'strong', node);
  return h(document, 'p', node);
}

/** Paragraph built from a source link element (keeps target-free href and text). */
export function linkFrom(document, a, opts) {
  if (!a) return null;
  const href = a.getAttribute('href');
  if (!href) return null;
  const clone = a.cloneNode(true);
  clone.querySelectorAll('svg, em.share-links__loading').forEach((s) => s.remove());
  return linkParagraph(document, href, clone.textContent, opts);
}

/** Removes decorative / UI-only nodes from a cloned fragment. */
export function stripUi(root) {
  root.querySelectorAll('svg, script, style, noscript, button, select, input, textarea, .visuallyhidden, .cc-select, [aria-hidden="true"]:not(img)')
    .forEach((n) => n.remove());
  return root;
}

/** Removes <br> / whitespace at the start and end of an element, also inside inline wrappers. */
export function trimBreaks(el) {
  ['firstChild', 'lastChild'].forEach((side) => {
    let node = el;
    let guard = 0;
    while (node && node[side] && guard < 50) {
      guard += 1;
      const c = node[side];
      if ((c.nodeType === 3 && !c.textContent.replace(/[\s\u00a0]+/g, ''))
        || (c.nodeType === 1 && c.tagName === 'BR')) {
        c.remove();
      } else if (c.nodeType === 1 && /^(EM|I|STRONG|B|SPAN|U|SUP|SUB|SMALL|A)$/.test(c.tagName)) {
        node = c;
      } else {
        node = null;
      }
    }
  });
  return el;
}

/**
 * Inline HTML of an element for use inside a heading or paragraph:
 * block children (<p>, <div>) are joined with <br>, empty ones dropped,
 * leading/trailing <br> and &nbsp; trimmed.
 */
export function inlineHtml(el) {
  if (!el) return '';
  const clone = trimBreaks(stripUi(el.cloneNode(true)));
  const blocks = [...clone.children].filter((c) => /^(P|DIV|H[1-6])$/.test(c.tagName));
  let parts;
  if (blocks.length && blocks.length === clone.children.length) {
    parts = blocks.map((b) => b.innerHTML);
  } else {
    parts = [clone.innerHTML];
  }
  return parts
    .map((p) => p.replace(/&nbsp;/g, ' ').replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '').trim())
    .filter((p) => (p && norm(p.replace(/<(?!img)[^>]+>/g, '')) !== '') || /<img/i.test(p))
    .join('<br>');
}

/** New heading <hN> with the inline content of el (or '' -> null). */
export function heading(document, level, el) {
  const html = typeof el === 'string' ? el : inlineHtml(el);
  if (!html || !norm(html.replace(/<[^>]+>/g, ''))) return null;
  return h(document, `h${level}`, html);
}

/** True if the element has no text and no image. */
export function isEmpty(el) {
  if (!el) return true;
  return !text(el) && !el.querySelector('img, picture, iframe, video, table');
}

/**
 * Cleans rich text in place (text.parbase / rtf containers): unwraps AEM wrapper
 * divs, drops empty paragraphs and UI nodes, turns figures into image + caption
 * paragraphs and headings that only hold an image into image paragraphs.
 * @returns {Element[]} the cleaned top-level nodes (moved out of the container)
 */
export function richText(document, container) {
  if (!container) return [];
  const root = stripUi(container.cloneNode(true));
  // unwrap generic wrappers (one pass: querySelectorAll already holds nested ones)
  [...root.querySelectorAll('div, section, article, header, figure, span[class]')].forEach((d) => {
    if (d.closest('table')) return;
    d.replaceWith(...d.childNodes);
  });
  root.querySelectorAll('figcaption').forEach((fc) => {
    const p = h(document, 'p', fc.innerHTML);
    fc.replaceWith(p);
  });
  root.querySelectorAll('h1, h2, h3, h4, h5, h6, p').forEach((hd) => {
    trimBreaks(hd);
    if (hd.tagName === 'P') return;
    if (!text(hd) && hd.querySelector('img')) {
      const p = h(document, 'p');
      hd.querySelectorAll('img').forEach((i) => p.append(i));
      hd.replaceWith(p);
    } else if (!text(hd)) hd.remove();
  });
  root.querySelectorAll('img').forEach((img) => {
    const clean = image(document, img);
    if (clean) img.replaceWith(clean);
    else img.remove();
  });
  root.querySelectorAll('[style]').forEach((e) => e.removeAttribute('style'));
  root.querySelectorAll('p').forEach((p) => {
    if (isEmpty(p)) p.remove();
  });
  // wrap loose inline content (text nodes, inline elements, images) into paragraphs
  const out = [];
  let inline = null;
  [...root.childNodes].forEach((n) => {
    const isBlock = n.nodeType === 1 && /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|DL)$/.test(n.tagName);
    if (isBlock) {
      inline = null;
      if (n.tagName !== 'HR') out.push(n);
      return;
    }
    if (n.nodeType === 3 && !norm(n.textContent)) {
      if (inline) inline.append(n);
      return;
    }
    if (n.nodeType === 1 && n.tagName === 'BR' && !inline) return;
    if (n.nodeType !== 1 && n.nodeType !== 3) return;
    if (!inline) {
      inline = document.createElement('p');
      out.push(inline);
    }
    inline.append(n);
  });
  return out.filter((n) => !(n.tagName === 'P' && isEmpty(n)));
}

/** Parses an AEM author-container into {name,title,company,photo,link}. */
export function parseAuthorContainer(c) {
  const q = (s) => c.querySelector(s);
  const name = text(q('.author-container__name, .author-container__text--name')).replace(/,\s*$/, '');
  const title = text(q('.author-container__title, .author-container__text--position'));
  const company = text(q('.author-container__company, .author-container__text--company'));
  const img = q('img');
  const linkEl = q('a.author-container__link, a.author-container__text-container--personal-data, a[href*="/viewpoints/"]');
  return {
    name,
    title,
    company,
    photo: bestSrc(img),
    photoAlt: img ? norm(img.getAttribute('alt')) : '',
    link: linkEl ? linkEl.getAttribute('href') : '',
  };
}

/** Authors list (<ul>) in the block-authoring shape: [photo] **Name**, Position<br>Company */
export function authorsList(document, authors) {
  if (!authors.length) return null;
  const ul = document.createElement('ul');
  authors.forEach((a) => {
    const li = document.createElement('li');
    if (a.photo) li.append(imageFromUrl(document, a.photo, a.photoAlt || a.name), document.createTextNode(' '));
    li.append(h(document, 'strong', document.createTextNode(a.name)));
    if (a.title) li.append(document.createTextNode(`, ${a.title}`));
    if (a.company) li.append(document.createElement('br'), document.createTextNode(a.company));
    ul.append(li);
  });
  return ul;
}

/** Block table via the importer helper. cells: array of rows, each an array of cells. */
export function block(document, name, variants, cells) {
  return WebImporter.Blocks.createBlock(document, {
    name,
    variants: (variants || []).filter(Boolean),
    cells,
  });
}

/** Cell value from a list of nodes (filters null). */
export const cell = (...nodes) => nodes.flat().filter(Boolean);

/** Parses "Month D, YYYY" (or ISO) into YYYY-MM-DD, or ''. */
export function isoDate(value) {
  const s = norm(value);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (m) {
    const mi = months.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return '';
}
