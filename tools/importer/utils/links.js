/* eslint-disable no-console */
/*
 * Central link rewriting for every import script. The rules are documented in
 * tools/importer/LINKS.md; keep both in sync.
 *
 * rewriteHref(href, { livePath }) -> { href, rule, live }
 *   href  the rewritten value to write into the document
 *   rule  name of the rule that matched (for reports and the dry run)
 *   live  true when the result points at www.manulifeim.com (unmigrated link)
 */
// plain JSON import: esbuild bundles it; dry-run.mjs registers a loader hook for Node
// eslint-disable-next-line import/extensions
import LINK_MAP from '../link-map.json';

export const LIVE_ORIGIN = 'https://www.manulifeim.com';
export const SITE_ROOT = '/institutional/tw/en';
const AEM_ROOT = '/content/mim-institutional/tw/en';
const LIVE_HOSTS = ['www.manulifeim.com', 'manulifeim.com'];

/* live path -> EDS path, plus a lowercase index for links that differ only in case */
const LOWER_MAP = Object.fromEntries(
  Object.entries(LINK_MAP).map(([live, eds]) => [live.toLowerCase(), eds]),
);

/* single-segment pages under /viewpoints that are real pages (category listings) */
const VIEWPOINT_PAGES = new Set(
  Object.keys(LINK_MAP)
    .filter((p) => p.startsWith(`${SITE_ROOT}/viewpoints/`) && p.split('/').length === 6)
    .map((p) => p.split('/').pop().toLowerCase()),
);

const LOGIN_AREA = /^\/institutional\/tw\/en\/(login|register|registration|dashboard|secured)(\/|$)/i;

/** Normalises a live path: no .html suffix, no trailing slash, no double slashes. */
export function normalizePath(pathname) {
  let p = pathname.replace(/\/{2,}/g, '/');
  p = p.replace(/\.html?$/i, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/** EDS path for a live path in pages.csv, or null. */
export function lookupEdsPath(livePath) {
  const p = normalizePath(livePath);
  if (LINK_MAP[p]) return LINK_MAP[p];
  let decoded = p;
  try {
    decoded = decodeURI(p);
  } catch (e) {
    // keep p
  }
  return LINK_MAP[decoded] || LOWER_MAP[p.toLowerCase()]
    || LOWER_MAP[decoded.toLowerCase()] || null;
}

/**
 * EDS-safe path for a live path that is not in pages.csv (same rule as pages.csv):
 * lowercase, `_` -> `-`, repeated `-` collapse, no leading/trailing `-` in a segment.
 */
export function sanitizeEdsPath(livePath) {
  return normalizePath(livePath).split('/').map((seg) => {
    let s;
    try {
      s = decodeURIComponent(seg);
    } catch (e) {
      s = seg;
    }
    return s.toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9.-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }).join('/');
}

/** Document path for the page being imported: pages.csv eds_path, else sanitized. */
export function documentPathFor(livePath) {
  return lookupEdsPath(livePath) || sanitizeEdsPath(livePath);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|tiff?)$/i;

function liveUrl(u) {
  return `${LIVE_ORIGIN}${u.pathname}${u.search}${u.hash}`;
}

function withQuery(path, params, hash) {
  const qs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${path}${qs ? `?${qs}` : ''}${hash || ''}`;
}

/**
 * Rewrites one href.
 * @param {string} href raw attribute value
 * @param {{livePath?: string}} [opts] live path of the current page (to resolve relative links)
 * @returns {{href: string, rule: string, live: boolean}}
 */
export function rewriteHref(href, opts = {}) {
  const raw = (href || '').trim();
  if (!raw) return { href: raw, rule: 'empty', live: false };
  if (/^(#|mailto:|tel:|sms:|data:)/i.test(raw)) return { href: raw, rule: 'keep-scheme', live: false };
  if (/^javascript:/i.test(raw)) return { href: '', rule: 'javascript', live: false };

  let u;
  try {
    u = new URL(raw, `${LIVE_ORIGIN}${opts.livePath || SITE_ROOT}`);
  } catch (e) {
    return { href: raw, rule: 'invalid', live: false };
  }
  if (!/^https?:$/.test(u.protocol)) return { href: raw, rule: 'keep-scheme', live: false };
  if (!LIVE_HOSTS.includes(u.hostname.toLowerCase())) {
    return { href: raw, rule: 'external', live: false };
  }

  let path = u.pathname;
  // AEM-internal content paths -> public paths
  if (path === AEM_ROOT || path.startsWith(`${AEM_ROOT}/`) || path.startsWith(`${AEM_ROOT}.`)) {
    if (/\/jcr:content|\/_jcr_content/.test(path)) {
      return { href: liveUrl(u), rule: 'aem-servlet', live: true };
    }
    path = SITE_ROOT + path.slice(AEM_ROOT.length);
  }
  // DAM assets (documents and images) stay on the live site
  if (path.startsWith('/content/dam/')) {
    return { href: liveUrl(u), rule: IMAGE_EXT.test(path) ? 'dam-image' : 'dam-document', live: true };
  }
  if (path.startsWith('/content/')) return { href: liveUrl(u), rule: 'aem-other', live: true };

  path = normalizePath(path);
  const { search, hash } = u;

  if (path !== SITE_ROOT && !path.startsWith(`${SITE_ROOT}/`)) {
    return { href: liveUrl(u), rule: 'outside-tree', live: true };
  }
  if (LOGIN_AREA.test(path)) return { href: liveUrl(u), rule: 'login-area', live: true };

  const rel = path.slice(SITE_ROOT.length); // '' or '/...'
  let m;

  // viewpoints tag / asset manager selector pages
  m = rel.match(/^\/viewpoints\/tag\/([^/]+)$/i);
  if (m) return { href: withQuery(`${SITE_ROOT}/viewpoints/all`, { tag: decodeURIComponent(m[1]) }, hash), rule: 'viewpoints-tag', live: false };
  m = rel.match(/^\/viewpoints\/assetManager\/([^/]+)$/i);
  if (m) return { href: withQuery(`${SITE_ROOT}/viewpoints/all`, { assetManager: decodeURIComponent(m[1]) }, hash), rule: 'viewpoints-asset-manager', live: false };

  // press release categories and paging
  m = rel.match(/^\/about-us\/press-releases\/category\/([^/]+)(?:\/page\/(\d+))?$/i);
  if (m) {
    return {
      href: withQuery(lookupEdsPath(`${SITE_ROOT}/about-us/press-releases`) || `${SITE_ROOT}/about-us/press-releases`, { category: m[1], page: m[2] }, hash),
      rule: 'press-category',
      live: false,
    };
  }

  // viewpoints category paging /viewpoints/<category>/page/<n>
  m = rel.match(/^\/viewpoints\/([^/]+)\/page\/(\d+)$/i);
  if (m && VIEWPOINT_PAGES.has(m[1].toLowerCase())) {
    return { href: withQuery(lookupEdsPath(`${SITE_ROOT}/viewpoints/${m[1]}`), { page: m[2] }, hash), rule: 'viewpoints-paging', live: false };
  }

  // case-study theme / topic filters: ?en/case-studies/themes/<x>
  if (/^\/sustainable-investing-case-studies$/i.test(rel) && search) {
    const q = decodeURIComponent(search.slice(1));
    m = q.match(/(?:^|&)[^=&]*case-studies\/(themes|topics)\/([^/&=]+)/i);
    if (m) {
      const key = m[1].toLowerCase() === 'topics' ? 'topic' : 'theme';
      return { href: withQuery(lookupEdsPath(path) || path, { [key]: m[2] }, hash), rule: `case-study-${key}`, live: false };
    }
  }

  // pages in pages.csv
  const eds = lookupEdsPath(path);
  if (eds) return { href: `${eds}${search}${hash}`, rule: 'page', live: false };

  // author "Read bio" pages: one segment under /viewpoints that is not a category page
  m = rel.match(/^\/viewpoints\/([^/]+)$/i);
  if (m && !VIEWPOINT_PAGES.has(m[1].toLowerCase())) {
    return { href: withQuery(`${SITE_ROOT}/viewpoints/all`, { author: decodeURIComponent(m[1]) }, hash), rule: 'viewpoints-author', live: false };
  }

  return { href: liveUrl(u), rule: 'not-in-scope', live: true };
}

/** Absolute live URL for an image or asset src (never rewritten to EDS). */
export function absoluteAssetUrl(src) {
  if (!src) return '';
  try {
    const u = new URL(src.trim(), `${LIVE_ORIGIN}/`);
    if (!/^https?:$/.test(u.protocol)) return src;
    return u.href;
  } catch (e) {
    return src;
  }
}

/** Author bio slug from a "Read bio" link (/viewpoints/<slug>), or ''. */
export function authorSlugFromHref(href) {
  try {
    const u = new URL(href, `${LIVE_ORIGIN}/`);
    const p = normalizePath(u.pathname).replace(AEM_ROOT, SITE_ROOT);
    const m = p.match(/\/viewpoints\/([^/]+)$/i);
    return m ? decodeURIComponent(m[1]) : '';
  } catch (e) {
    return '';
  }
}

/** Last path segment of a link, e.g. /viewpoints/tag/fixed-income -> fixed-income. */
export function lastSegment(href) {
  try {
    const u = new URL(href, `${LIVE_ORIGIN}/`);
    return decodeURIComponent(normalizePath(u.pathname).split('/').pop());
  } catch (e) {
    return '';
  }
}

/**
 * Rewrites all links in a root element and records links left on the live site.
 * @param {Element} root
 * @param {{livePath: string, unmigrated: Map<string,string>, rules?: object}} ctx
 */
/**
 * Original URL of an Outlook SafeLinks wrapper (https://*.safelinks.protection.outlook.com/
 * ?url=<encoded>&data=<recipient, tracking>), else the href unchanged.
 */
export function unwrapSafeLink(href) {
  try {
    const u = new URL(href);
    if (!/(^|\.)safelinks\.protection\.outlook\.com$/i.test(u.hostname)) return href;
    const target = u.searchParams.get('url');
    return target && /^https?:\/\//i.test(target) ? target : href;
  } catch (e) {
    return href;
  }
}

/* inline wrappers a link can sit in alone (<p><strong><a href="#">…</a></strong></p>) */
const INLINE_WRAPPERS = ['STRONG', 'B', 'EM', 'I', 'U', 'SPAN'];

/**
 * A link to "#" goes nowhere on live (every live "#" link was checked in the snapshots on
 * 2026-10-30: author "Read bio", tile and promo CTAs, list items, a richTitle link). A paragraph or
 * list item that holds only such a link goes, and a list left empty with it; inside other text,
 * or around an image, the content stays without the link.
 * @param {Element} a link whose href is "#"
 * @returns {'removed'|'unwrapped'}
 */
export function dropDeadLink(a) {
  const label = a.textContent.trim();
  let box = a;
  while (box.parentElement && INLINE_WRAPPERS.includes(box.parentElement.tagName)
    && box.parentElement.textContent.trim() === label) box = box.parentElement;
  const holder = box.parentElement;
  const alone = holder && ['P', 'LI'].includes(holder.tagName)
    && holder.textContent.trim() === label && !holder.querySelector('img, picture');
  if (!alone) {
    a.replaceWith(...a.childNodes);
    return 'unwrapped';
  }
  const list = holder.tagName === 'LI' ? holder.parentElement : null;
  holder.remove();
  if (list && ['UL', 'OL'].includes(list.tagName) && !list.querySelector('li')) list.remove();
  return 'removed';
}

export function rewriteLinks(root, ctx) {
  root.querySelectorAll('a').forEach((a) => {
    if (!root.contains(a)) return; // went with a dead link's paragraph
    // a title with line breaks (Outlook "Original URL: … Click to follow link.") breaks the
    // importer's markdown link syntax and leaks the raw link into the text; links need no title
    const title = a.getAttribute('title');
    if (title !== null && (/[\r\n]/.test(title) || /^original url:/i.test(title.trim()))) a.removeAttribute('title');
    if (a.hasAttribute('href')) {
      const unwrapped = unwrapSafeLink(a.getAttribute('href'));
      if (unwrapped !== a.getAttribute('href')) a.setAttribute('href', unwrapped);
    }
    // live video modal links (Brightcove) -> player URL
    const video = a.getAttribute('data-videomodal');
    if (video && (!a.getAttribute('href') || a.getAttribute('href') === '#')) {
      const account = a.getAttribute('data-brightcoveid');
      const player = a.getAttribute('data-playerid') || 'default';
      if (account) {
        a.setAttribute('href', `https://players.brightcove.net/${account}/${player}_default/index.html?videoId=${video}`);
      }
    }
    if (!a.hasAttribute('href')) return;
    // a live video button keeps its "#" (it opens a player on live; parsers/video.js resolves it)
    if (a.getAttribute('href').trim() === '#' && !video) {
      const how = dropDeadLink(a);
      if (ctx.rules) ctx.rules[`dead-link-${how}`] = (ctx.rules[`dead-link-${how}`] || 0) + 1;
      return;
    }
    const res = rewriteHref(a.getAttribute('href'), ctx);
    if (ctx.rules) ctx.rules[res.rule] = (ctx.rules[res.rule] || 0) + 1;
    if (res.rule === 'javascript') {
      a.replaceWith(...a.childNodes);
      return;
    }
    a.setAttribute('href', res.href);
    if (res.live && ctx.unmigrated) {
      if (!ctx.unmigrated.has(res.href)) ctx.unmigrated.set(res.href, (a.textContent || '').replace(/\s+/g, ' ').trim());
    }
  });
}
