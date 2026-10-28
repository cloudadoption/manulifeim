/*
 * Shared helpers for manulifeim blocks (cards, article-list, feature, author,
 * related-articles, browse-by, tag-list). Blocks import from /scripts/ only.
 */
import { createOptimizedPicture } from './aem.js';
import {
  INDEX_URLS, MONTHS, readIndexJson, normalizeEntry, isoDate, splitValues,
} from './listing-core.js';

export { el, readRows } from './dom-utils.js';

/**
 * True for an authored cell that holds only an image (with or without its <p>).
 * @param {Element} cell
 * @returns {boolean}
 */
export const isMediaCell = (cell) => !!cell.querySelector('picture, img') && cell.textContent.trim() === '';

/**
 * Parses a date from ISO strings, "Month D, YYYY", unix seconds / ms or
 * spreadsheet serial numbers.
 * @param {*} value
 * @returns {Date|null}
 */
export function parseDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str);
    let d;
    if (n < 100000) d = new Date(Math.round((n - 25569) * 86400 * 1000)); // spreadsheet serial
    else if (n < 1e11) d = new Date(n * 1000); // unix seconds
    else d = new Date(n); // unix ms
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO date only: treat as local date to avoid timezone shifts
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a date like the live site: "August 3, 2026".
 * Unparseable values are returned as authored.
 * @param {*} value
 * @returns {string}
 */
export function formatDate(value) {
  const d = parseDate(value);
  if (!d) return value ? String(value) : '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * @param {string} text
 * @returns {boolean} true when the text looks like a date
 */
export function looksLikeDate(text) {
  const t = (text || '').trim();
  if (!t || t.length > 40) return false;
  return /^[A-Z][a-z]+\.? \d{1,2},? \d{4}$/.test(t) || /^\d{4}-\d{2}-\d{2}/.test(t)
    || /^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(t);
}

/**
 * Builds a picture for a src string (same-origin → optimized picture,
 * external → plain img) or returns a picture element as-is.
 * @param {string|Element} image
 * @param {string} alt
 * @param {string} width
 * @returns {Element|null}
 */
export function toPicture(image, alt = '', width = '750') {
  if (!image) return null;
  if (typeof image !== 'string') return image;
  try {
    const url = new URL(image, window.location.href);
    if (url.origin === window.location.origin) {
      return createOptimizedPicture(url.pathname + url.search, alt, false, [{ width }]);
    }
  } catch (e) {
    // fall through
  }
  const img = document.createElement('img');
  img.src = image;
  img.alt = alt;
  img.loading = 'lazy';
  return img;
}

/**
 * Hides an avatar wrapper when its image fails (live `fallbackImage--hidden`).
 * @param {Element} wrapper
 */
export function hideOnError(wrapper) {
  wrapper.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => wrapper.classList.add('image-hidden'));
    if (img.complete && img.naturalWidth === 0 && img.src) wrapper.classList.add('image-hidden');
  });
}

/**
 * Parses an authored author line (a list item or paragraph):
 *   [picture] **Name** , Position <br> Company
 * Without bold, the text before the first comma is the name.
 * @param {Element} el
 * @returns {{name:string,title:string,company:string,image:(Element|null),link:string}}
 */
export function parseAuthorElement(el) {
  const clone = el.cloneNode(true);
  const picture = el.querySelector('picture, img');
  clone.querySelectorAll('picture, img').forEach((p) => p.remove());
  const a = clone.querySelector('a[href]');
  const link = a ? a.getAttribute('href') : '';
  const strong = clone.querySelector('strong, b');
  let name = '';
  if (strong) {
    name = strong.textContent.trim();
    strong.remove();
  }
  // split on <br>
  const html = clone.innerHTML.split(/<br\s*\/?>/i);
  const tmp = document.createElement('div');
  const lines = html.map((h) => {
    tmp.innerHTML = h;
    return tmp.textContent.replace(/\s+/g, ' ').trim();
  }).filter((l) => l);
  let title = (lines[0] || '').replace(/^[,\s]+/, '').trim();
  let company = (lines.slice(1).join(' ') || '').trim();
  if (!name) {
    const idx = title.indexOf(',');
    if (idx > -1) {
      name = title.slice(0, idx).trim();
      title = title.slice(idx + 1).trim();
    } else {
      name = title;
      title = '';
    }
  }
  if (!company && lines.length === 1 && !strong && title.includes(' | ')) {
    [title, company] = title.split(' | ');
  }
  return {
    name: name.replace(/,\s*$/, ''),
    title,
    company,
    image: picture ? (picture.closest('picture') || picture) : null,
    link,
  };
}

/**
 * Renders the inline author line used in teasers:
 * avatar 40px + "Name, Position" + company on its own line.
 * @param {{name:string,title?:string,company?:string,image?:(string|Element)}} author
 * @param {string} prefix class prefix (block name)
 * @returns {Element}
 */
export function buildAuthorInline(author, prefix) {
  const wrap = document.createElement('div');
  wrap.className = `${prefix}-author`;
  if (author.image) {
    const photo = document.createElement('div');
    photo.className = `${prefix}-author-photo`;
    const pic = toPicture(author.image, author.name || '', '100');
    if (pic) {
      photo.append(pic);
      hideOnError(photo);
      wrap.append(photo);
    }
  }
  const text = document.createElement('p');
  text.className = `${prefix}-author-text`;
  const name = document.createElement('span');
  name.className = `${prefix}-author-name`;
  name.textContent = author.title || author.company ? `${author.name},\u00a0` : author.name;
  text.append(name);
  if (author.title) {
    const pos = document.createElement('span');
    pos.className = `${prefix}-author-position`;
    pos.textContent = author.title;
    text.append(pos);
  }
  if (author.company) {
    const comp = document.createElement('span');
    comp.className = `${prefix}-author-company`;
    comp.textContent = author.company;
    text.append(comp);
  }
  wrap.append(text);
  return wrap;
}

/**
 * Where index-driven blocks read their rows (docs/DECISIONS.md, ADR-001). `native`: the query
 * indices AEM builds from published pages (tools/importer/query.yaml). `stand-in`: the
 * preview-index sheet built from previewed pages (tools/importer/build-preview-index.mjs), for a
 * site that is not published yet.
 */
export const INDEX_SOURCE = 'native';

const indexCache = {};
const PREVIEW_INDEX = '/institutional/tw/en/preview-index.json';
const PREVIEW_SHEETS = {
  [INDEX_URLS.all]: 'default',
  [INDEX_URLS.viewpoints]: 'viewpoints',
  [INDEX_URLS.press]: 'press',
  [INDEX_URLS['case-studies']]: 'case-studies',
  [INDEX_URLS.documents]: 'resources',
  [INDEX_URLS.people]: 'people',
};
const PAGE = 1000; // rows per request (JSON sheets answer at most 1000 rows by default)

async function fetchAllRows(path) {
  const url = new URL(path, window.location.href);
  const sheet = url.searchParams.get('sheet') || '';
  const rows = [];
  let offset = 0;
  // page through offset/limit until total is reached (static files answer everything at once)
  for (let i = 0; i < 50; i += 1) {
    url.searchParams.set('offset', offset);
    url.searchParams.set('limit', PAGE);
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(url.href);
    if (!resp.ok) break;
    // eslint-disable-next-line no-await-in-loop
    const { rows: chunk, total } = readIndexJson(await resp.json(), sheet);
    rows.push(...chunk);
    offset += chunk.length;
    if (!chunk.length || offset >= total) break;
  }
  return rows;
}

/**
 * Fetches all rows of a query index (cached per path), from the source INDEX_SOURCE names.
 * Default: the site index /institutional/tw/en/query-index.json. `?sheet=` works for
 * multi-sheet JSON files.
 * @param {string} path
 * @returns {Promise<object[]>}
 */
export async function fetchIndex(path = INDEX_URLS.all) {
  if (!indexCache[path]) {
    const sheet = INDEX_SOURCE === 'stand-in' && PREVIEW_SHEETS[new URL(path, window.location.href).pathname];
    indexCache[path] = fetchAllRows(sheet ? `${PREVIEW_INDEX}?sheet=${sheet}` : path).catch(() => []);
  }
  return indexCache[path];
}

/**
 * Splits a multi-value index cell ("a | b", "a, b" or JSON array).
 * @param {*} value
 * @returns {string[]}
 */
export function splitList(value) {
  // arrays as they are (author objects); strings like the index helper
  return Array.isArray(value) ? value : splitValues(value);
}

/**
 * Maps a query-index row to the teaser item shape
 * {path,title,date,authors:[{name,title,company,image}],summary,image}.
 * @param {object} entry
 * @returns {object}
 */
export function indexEntryToItem(entry) {
  const n = normalizeEntry(entry);
  return {
    path: n.path || entry.path,
    title: n.title,
    date: entry.date || isoDate(n.ts) || entry.publicationDate || '',
    authors: n.authors.map((a) => ({
      name: a.name, title: a.title, company: a.company, image: a.image,
    })),
    summary: entry.summary || n.description,
    image: n.image,
    category: n.category,
    tags: n.tags,
    template: n.template,
  };
}

/**
 * Sorts items by date, newest first.
 * @param {object[]} items
 * @returns {object[]}
 */
export function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = parseDate(a.date);
    const db = parseDate(b.date);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  });
}

/**
 * Returns the pathname of a link (for comparing with index paths).
 * @param {string} href
 * @returns {string}
 */
export function toPath(href) {
  try {
    return new URL(href, window.location.href).pathname.replace(/\.html$/, '').replace(/\/$/, '');
  } catch (e) {
    return href;
  }
}

/**
 * Parses an authored teaser row into a plain item.
 * @param {Element} row
 * @returns {object|null}
 */
export function parseTeaserRow(row) {
  const item = {
    path: '', title: '', date: '', authors: [], summary: '', image: null,
  };
  const body = document.createElement('div');
  [...row.children].forEach((cell) => {
    if (cell.querySelector('picture') && !cell.textContent.trim()) {
      if (!item.image) item.image = cell.querySelector('picture');
    } else {
      body.append(...cell.childNodes);
    }
  });
  const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
  let seenHeading = false;
  const summary = [];
  [...body.children].forEach((el) => {
    if (el === heading) {
      seenHeading = true;
      const a = el.querySelector('a[href]');
      item.title = el.textContent.trim();
      if (a) item.path = a.getAttribute('href');
      return;
    }
    if (['UL', 'OL'].includes(el.tagName) && seenHeading && !item.authors.length) {
      item.authors = [...el.children].map((li) => parseAuthorElement(li));
      return;
    }
    if (el.tagName === 'P' && el.querySelector('picture') && !el.textContent.trim()) {
      if (!item.image) item.image = el.querySelector('picture');
      return;
    }
    const text = el.textContent.trim();
    if (!text) return;
    if (!seenHeading && !item.date && (looksLikeDate(text) || heading)) {
      item.date = text;
      return;
    }
    if (!heading && !item.title && el.querySelector('a[href]')) {
      const a = el.querySelector('a[href]');
      item.title = a.textContent.trim();
      item.path = a.getAttribute('href');
      seenHeading = true;
      return;
    }
    summary.push(text);
  });
  item.summary = summary.join(' ');
  return item.title ? item : null;
}
