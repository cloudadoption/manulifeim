/*
 * Pure (DOM-free) listing and search logic shared by blocks/listing and blocks/search.
 * Index rows come from the query indices defined in tools/importer/query.yaml
 * (see tools/importer/QUERY-INDEX.md). Unit-tested in node: tools/importer/test/listing.test.mjs.
 */

export const SITE_ROOT = '/institutional/tw/en';

/* one index per listing type (content-bus indices are single sheet, so one target each) */
export const INDEX_URLS = {
  all: `${SITE_ROOT}/query-index.json`,
  viewpoints: `${SITE_ROOT}/query-index-viewpoints.json`,
  press: `${SITE_ROOT}/query-index-press.json`,
  'case-studies': `${SITE_ROOT}/query-index-case-studies.json`,
  documents: `${SITE_ROOT}/query-index-resources.json`,
  people: `${SITE_ROOT}/query-index-people.json`,
};

export const PAGE_SIZES = {
  viewpoints: 10, press: 10, 'case-studies': 9, documents: 10, people: 0,
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Same rule as aem.js toClassName. */
export function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^0-9a-z]/gi, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Splits a multi-value index cell: array, JSON array string, "a | b" or "a, b".
 * @param {*} value
 * @param {string} [sep] force a separator
 * @returns {string[]}
 */
export function splitValues(value, sep) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const str = String(value).trim();
  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) return arr.map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean);
    } catch (e) {
      // not JSON, fall through
    }
  }
  let s = sep;
  if (!s) s = str.includes('|') ? '|' : ',';
  return str.split(s).map((v) => v.trim()).filter(Boolean);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

/** ISO date (YYYY-MM-DD) -> unix seconds (UTC), or 0. */
export function isoToSeconds(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000;
}

/** Unix seconds -> {y, m, d} in UTC. */
function ymd(seconds) {
  const d = new Date(seconds * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

/** "September 23, 2026" (live list dates). */
export function formatLongDate(seconds) {
  if (!seconds) return '';
  const { y, m, d } = ymd(seconds);
  return `${MONTHS[m]} ${d}, ${y}`;
}

/** "23/09/2026" (Coveo result date, format DD/MM/YYYY). */
export function formatShortDate(seconds) {
  if (!seconds) return '';
  const { y, m, d } = ymd(seconds);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d)}/${pad(m + 1)}/${y}`;
}

/** "2026-09-23" for <time datetime>. */
export function isoDate(seconds) {
  if (!seconds) return '';
  const { y, m, d } = ymd(seconds);
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Drops the credentials after the first comma: "Murray Collis, CFTe" -> "Murray Collis". */
export function baseName(name) {
  return String(name || '').split(',')[0].trim();
}

/** Strips host from same-site absolute URLs; keeps other hosts. */
function sitePath(url) {
  return String(url || '').replace(/^https?:\/\/[^/]+\.aem\.(page|live)(?=\/)/, '');
}

/**
 * Normalises a raw query-index row into the item shape the blocks use.
 * @param {object} row
 * @returns {object}
 */
export function normalizeEntry(row) {
  const e = row || {};
  const path = sitePath(e.path || '').replace(/\.html$/, '').replace(/(.)\/$/, '$1');
  const tags = splitValues(e.tags);
  const tagSlugs = splitValues(e.tagSlugs || e['tag-slugs'], ',');
  const groups = {};
  const tagLabels = {};
  tagSlugs.forEach((id, i) => {
    const [group, slug] = id.includes('/') ? id.split('/') : ['tags', id];
    (groups[group] = groups[group] || []).push(slug);
    if (tags.length === tagSlugs.length) tagLabels[id] = tags[i];
  });
  let authors = parseJson(e.authorDetails || e['author-details'], null);
  if (!Array.isArray(authors)) {
    authors = splitValues(e.authors, '|').map((name) => ({ name }));
  }
  authors = authors.filter((a) => a && a.name).map((a) => ({
    name: String(a.name).trim(),
    title: a.title || '',
    company: a.company || '',
    image: a.photo || a.image || '',
    slug: a.slug || slugify(baseName(a.name)),
  }));
  let ts = Number(e.publicationTimestamp) || 0;
  if (!ts) ts = isoToSeconds(e.publicationDate || e['publication-date'] || e.date);
  const lastModified = Number(e.lastModified) || 0;
  const image = e.image && !String(e.image).includes('default-meta-image') ? sitePath(e.image) : '';
  const description = String(e.description || '').trim();
  return {
    path,
    // some pages carry the site name in their <title> ("… | Manulife Investment Management")
    title: String(e.title || '').replace(/\s*[|\u2013-]\s*Manulife Investment (?:Management|Mgmt\.?)\s*$/, '').trim(),
    description,
    image,
    template: String(e.template || '').trim().toLowerCase(),
    ts,
    sortTs: ts || lastModified,
    lastModified,
    authors,
    assetManager: String(e.assetManager || '').trim(),
    assetManagerSlug: String(e.assetManagerSlug || '').trim() || slugify(e.assetManager),
    category: String(e.category || '').trim(),
    categorySlug: String(e.categorySlug || '').trim() || slugify(e.category),
    tags,
    tagSlugs,
    tagLabels,
    groups,
    theme: String(e.theme || '').trim().toLowerCase(),
    topics: splitValues(e.topic, ','),
    assetClass: String(e.assetClass || '').trim(),
    position: String(e.position || '').trim(),
    bio: String(e.bio || '').trim(),
    documentUrl: String(e.documentUrl || '').trim(),
    audiences: splitValues(e.audience, ','),
    robots: String(e.robots || ''),
  };
}

/**
 * Reads rows out of a (single or multi-sheet) index JSON payload.
 * @param {object} json
 * @param {string} [sheet]
 * @returns {{rows: object[], total: number}}
 */
export function readIndexJson(json, sheet) {
  if (!json || typeof json !== 'object') return { rows: [], total: 0 };
  let data = json;
  if (json[':type'] === 'multi-sheet') {
    const names = json[':names'] || Object.keys(json).filter((k) => !k.startsWith(':'));
    data = json[sheet] || json.default || json[names[0]] || {};
  }
  const rows = Array.isArray(data.data) ? data.data : [];
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : rows.length;
  return { rows, total };
}

/* ---------- listing types ---------- */

const RESOURCE_RE = /\/resources\/([^/]+)\/[^/]+$/;
const PEOPLE_RE = /\/(authors|consultant-team)\/[^/]+$/;

/** Base predicate per listing variant (what the index sheet must contain). */
export const VARIANT_BASE = {
  viewpoints: (it) => it.template === 'viewpoint' || it.template === 'article',
  press: (it) => it.template === 'press-release',
  'case-studies': (it) => it.template === 'case-study-detail' || it.template === 'case-study',
  documents: (it) => RESOURCE_RE.test(it.path),
  people: (it) => PEOPLE_RE.test(it.path),
};

/** Resource type from the path: documents | fact-sheets. */
export function resourceType(item) {
  const m = item.path.match(RESOURCE_RE);
  return m ? m[1].toLowerCase() : '';
}

export const RESOURCE_TYPE_LABELS = { documents: 'Documents', 'fact-sheets': 'Fact sheets' };

/** Page type (search facet, Coveo gwam_pagetype equivalent). */
export function pageType(item) {
  if (VARIANT_BASE.viewpoints(item)) return 'Viewpoint';
  if (VARIANT_BASE.press(item)) return 'Press release';
  if (VARIANT_BASE['case-studies'](item)) return 'Case study';
  if (RESOURCE_RE.test(item.path)) return resourceType(item) === 'fact-sheets' ? 'Fact sheet' : 'Document';
  if (PEOPLE_RE.test(item.path)) return 'Person';
  if (/\/strategies\//.test(item.path)) return 'Strategy';
  return 'Page';
}

/* ---------- filters ---------- */

/** Filter keys read from the URL query (lower-cased) -> canonical key. */
export const FILTER_KEYS = {
  category: 'category',
  tag: 'tag',
  assetmanager: 'assetManager',
  author: 'author',
  theme: 'theme',
  topic: 'topic',
  region: 'region',
  assetclass: 'assetClass',
  path: 'path',
  template: 'template',
  type: 'type',
  audience: 'audience',
  q: 'q',
};

/**
 * Parses an authored filter ("category=fixed-income&tag=asia" or "category=a, b; tag=c").
 * @param {string} text
 * @returns {Object<string,string[]>}
 */
export function parseFilter(text) {
  const out = {};
  String(text || '').split(/[&;\n]/).forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = FILTER_KEYS[part.slice(0, i).trim().toLowerCase()];
    if (!key) return;
    const values = part.slice(i + 1).split(',').map((v) => decodeURIComponent(v.trim())).filter(Boolean);
    if (values.length) out[key] = values;
  });
  return out;
}

/**
 * Reads filter values from URL search params (repeated or comma-separated).
 * @param {URLSearchParams} params
 * @param {string[]} allowed canonical keys this variant accepts
 * @returns {Object<string,string[]>}
 */
export function filtersFromParams(params, allowed) {
  const out = {};
  [...params.keys()].forEach((raw) => {
    const key = FILTER_KEYS[raw.toLowerCase()];
    if (!key || !allowed.includes(key)) return;
    const values = params.getAll(raw).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
    if (values.length) out[key] = [...new Set([...(out[key] || []), ...values])];
  });
  return out;
}

const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** Text used by the free-text filter and search. */
function haystack(item) {
  return [item.title, item.description, item.tags.join(' '), item.authors.map((a) => a.name).join(' '),
    item.category].join(' ').toLowerCase();
}

/**
 * True when the item matches one filter key (values are OR-ed).
 * @param {object} item normalised entry
 * @param {string} key canonical key
 * @param {string[]} values
 */
export function matchFilter(item, key, values) {
  if (!values || !values.length) return true;
  return values.some((value) => {
    const v = String(value).trim();
    const s = slugify(v);
    switch (key) {
      case 'category':
        return eq(item.categorySlug, v) || slugify(item.category) === s;
      case 'tag':
        return item.tagSlugs.some((t) => eq(t, v) || eq(t.split('/').pop(), v))
          || item.tags.some((t) => slugify(t) === s);
      case 'assetManager':
        return eq(item.assetManagerSlug, v) || slugify(item.assetManager) === s;
      case 'author':
        return item.authors.some((a) => eq(a.slug, v) || slugify(baseName(a.name)) === s
          || slugify(a.name) === s);
      case 'theme':
        return (item.groups.themes || []).some((t) => eq(t, v)) || eq(item.theme, v);
      case 'topic':
        return (item.groups.topics || []).some((t) => eq(t, v)) || item.topics.some((t) => eq(t, v))
          || eq(item.theme, v);
      case 'region':
        return (item.groups.regions || []).some((t) => eq(t, v));
      case 'assetClass':
        return (item.groups['asset-classes'] || []).some((t) => eq(t, v)) || eq(slugify(item.assetClass), s);
      case 'path': {
        const base = v.replace(/\/$/, '');
        return item.path === base || item.path.startsWith(`${base}/`);
      }
      case 'template':
        return eq(item.template, v);
      case 'type':
        return eq(resourceType(item), v) || slugify(pageType(item)) === s;
      case 'audience':
        return item.audiences.some((a) => slugify(a) === s);
      case 'q': {
        const terms = v.toLowerCase().split(/\s+/).filter(Boolean);
        const text = haystack(item);
        return terms.every((t) => text.includes(t));
      }
      default:
        return true;
    }
  });
}

/**
 * Applies all filters (AND across keys).
 * @param {object[]} items
 * @param {Object<string,string[]>} filters
 * @returns {object[]}
 */
export function applyFilters(items, filters) {
  const entries = Object.entries(filters || {}).filter(([, v]) => v && v.length);
  return items.filter((it) => entries.every(([k, v]) => matchFilter(it, k, v)));
}

/* ---------- sorting & paging ---------- */

const byTitle = (a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });

/**
 * Sorts items. newest (default) | oldest | title (a-z) | title-desc (z-a) | name | relevance
 * @param {object[]} items
 * @param {string} sort
 * @returns {object[]}
 */
export function sortItems(items, sort = 'newest') {
  const list = [...items];
  switch (String(sort || 'newest').toLowerCase()) {
    case 'oldest':
      return list.sort((a, b) => (a.sortTs - b.sortTs) || byTitle(a, b));
    case 'title':
    case 'a-z':
      return list.sort(byTitle);
    case 'title-desc':
    case 'z-a':
      return list.sort((a, b) => byTitle(b, a));
    case 'name': {
      const last = (it) => baseName(it.title).split(/\s+/).pop() || '';
      return list.sort((a, b) => last(a).localeCompare(last(b), 'en', { sensitivity: 'base' }) || byTitle(a, b));
    }
    case 'relevance':
      return list.sort((a, b) => ((b.score || 0) - (a.score || 0)) || (b.sortTs - a.sortTs));
    default:
      return list.sort((a, b) => (b.sortTs - a.sortTs) || byTitle(a, b));
  }
}

/**
 * Page slice. page is 1-based and clamped.
 * @returns {{items: object[], page: number, pages: number, total: number,
 *   start: number, end: number}}
 */
export function paginate(items, page, size) {
  const total = items.length;
  if (!size || size <= 0) {
    return {
      items: [...items], page: 1, pages: 1, total, start: total ? 1 : 0, end: total,
    };
  }
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, parseInt(page, 10) || 1), pages);
  const from = (p - 1) * size;
  const slice = items.slice(from, from + size);
  return {
    items: slice, page: p, pages, total, start: total ? from + 1 : 0, end: from + slice.length,
  };
}

/**
 * Page numbers to show. Live (.pagination) lists every page up to 13 pages (fixed income:
 * 13 links); beyond that first / window / last with ellipses (.pagination__ellipsis).
 * @param {number} page current (1-based)
 * @param {number} pages total pages
 * @param {number} [max] show all when pages <= max
 * @param {number} [radius] pages either side of the current one
 * @returns {(number|'…')[]}
 */
export function pageWindow(page, pages, max = 13, radius = 2) {
  if (pages <= max) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, page - radius);
  const to = Math.min(pages - 1, page + radius);
  if (from > 2) out.push('…');
  for (let i = from; i <= to; i += 1) out.push(i);
  if (to < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

/**
 * Coveo atomic-pager style window: `count` consecutive pages around the current one.
 * @returns {number[]}
 */
export function pagerWindow(page, pages, count = 5) {
  const n = Math.min(count, pages);
  let start = Math.max(1, page - Math.floor(n / 2));
  if (start + n - 1 > pages) start = pages - n + 1;
  return Array.from({ length: n }, (_, i) => start + i);
}

/* ---------- facets (case studies, documents, search) ---------- */

export const CASE_STUDY_GROUPS = [
  { group: 'topics', key: 'topic', label: 'Topic' },
  { group: 'themes', key: 'theme', label: 'Theme' },
  { group: 'regions', key: 'region', label: 'Region' },
  { group: 'asset-classes', key: 'assetClass', label: 'Asset class' },
];

/**
 * Facet values of a tag group with labels and counts.
 * @param {object[]} items
 * @param {string} group e.g. 'themes'
 * @returns {{value: string, label: string, count: number}[]}
 */
export function groupValues(items, group) {
  const map = new Map();
  items.forEach((it) => {
    (it.groups[group] || []).forEach((slug) => {
      const id = `${group}/${slug}`;
      const cur = map.get(slug) || { value: slug, label: it.tagLabels[id] || '', count: 0 };
      if (!cur.label && it.tagLabels[id]) cur.label = it.tagLabels[id];
      cur.count += 1;
      map.set(slug, cur);
    });
  });
  return [...map.values()].map((v) => ({ ...v, label: v.label || v.value.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
}

/**
 * Generic facet counts over a getter returning one or many values.
 * @param {object[]} items
 * @param {(item: object) => (string|string[])} get
 * @returns {{value: string, count: number}[]} by count desc, then value
 */
export function facetCounts(items, get) {
  const map = new Map();
  items.forEach((it) => {
    const v = get(it);
    const values = Array.isArray(v) ? v : [v];
    [...new Set(values.filter(Boolean))].forEach((x) => map.set(x, (map.get(x) || 0) + 1));
  });
  return [...map.entries()].map(([value, count]) => ({ value, count }))
    .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value, 'en', { sensitivity: 'base' }));
}

/* ---------- search ---------- */

/** Lower-cased word tokens (letters / digits, unicode aware). */
export function tokenize(q) {
  return String(q || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const WEIGHTS = {
  title: 10, tags: 4, authors: 4, category: 3, description: 2,
};

/**
 * Relevance score of an item for a query: every term must appear in one of the fields
 * (title, description, tags, authors, category); title hits and whole-word hits weigh more,
 * the full phrase in the title adds a bonus. 0 = no match.
 * @param {object} item normalised entry
 * @param {string[]} terms tokenize(q)
 * @returns {number}
 */
export function scoreItem(item, terms) {
  if (!terms.length) return 1;
  const fields = {
    title: tokenize(item.title),
    tags: tokenize(item.tags.join(' ')),
    authors: tokenize(item.authors.map((a) => a.name).join(' ')),
    category: tokenize(item.category),
    description: tokenize(item.description),
  };
  let score = 0;
  const ok = terms.every((term) => {
    let hit = 0;
    Object.entries(fields).forEach(([f, words]) => {
      const exact = words.filter((w) => w === term).length;
      const prefix = exact ? 0 : words.filter((w) => w.startsWith(term)).length;
      if (exact || prefix) hit += WEIGHTS[f] * (exact ? 2 : 1) * Math.min(3, exact + prefix);
    });
    score += hit;
    return hit > 0;
  });
  if (!ok) return 0;
  const phrase = terms.join(' ');
  if (terms.length > 1 && fields.title.join(' ').includes(phrase)) score += 20;
  return score;
}

/**
 * Searches items; returns matches with a `score` (copies, input untouched).
 * @param {object[]} items
 * @param {string} q
 * @returns {object[]}
 */
export function searchItems(items, q) {
  const terms = tokenize(q);
  return items.map((it) => ({ ...it, score: scoreItem(it, terms) })).filter((it) => it.score > 0);
}

/** Search facets: id -> label + value getter (Coveo facet ids / labels on live). */
export const SEARCH_FACETS = [
  { id: 'type', label: 'Page type', get: (it) => pageType(it) },
  {
    id: 'assetmgr', label: 'Asset Manager', get: (it) => it.assetManager, dependent: true,
  },
  {
    id: 'author', label: 'Author', get: (it) => it.authors.map((a) => baseName(a.name)), dependent: true,
  },
  {
    id: 'category',
    label: 'Category',
    get: (it) => (/^(archive|press-releases)$/.test(it.category) ? '' : it.category),
    dependent: true,
  },
  {
    id: 'tags', label: 'Viewpoint Tags', get: (it) => it.tags, dependent: true,
  },
];

/**
 * Applies selected search facet values (OR within a facet, AND across facets).
 * @param {object[]} items
 * @param {Object<string,string[]>} selected facet id -> values
 * @param {string} [skip] facet id to ignore (for its own counts)
 */
export function applyFacets(items, selected, skip) {
  return items.filter((it) => SEARCH_FACETS.every((f) => {
    if (f.id === skip) return true;
    const values = selected[f.id];
    if (!values || !values.length) return true;
    const v = f.get(it);
    const have = Array.isArray(v) ? v : [v];
    return values.some((x) => have.includes(x));
  }));
}

/**
 * Full search pipeline (pure): query, facets, sort, page.
 * @param {object[]} items normalised entries
 * @param {{q?: string, facets?: Object<string,string[]>, sort?: string, page?: number,
 *   size?: number}} state
 */
export function runSearch(items, state) {
  const {
    q = '', facets = {}, sort = 'relevance', page = 1, size = 10,
  } = state || {};
  const matched = searchItems(items, q);
  const filtered = applyFacets(matched, facets);
  let sortKey = sort;
  if (sort === 'newest' || sort === 'date') sortKey = 'newest';
  const sorted = sortItems(filtered, sortKey);
  const counts = {};
  const typeSelected = (facets.type || []).length > 0;
  SEARCH_FACETS.forEach((f) => {
    if (f.dependent && !typeSelected) return;
    counts[f.id] = facetCounts(applyFacets(matched, facets, f.id), f.get);
  });
  return { ...paginate(sorted, page, size), counts, matched: matched.length };
}
