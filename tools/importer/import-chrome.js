/* eslint-disable */
/* global WebImporter */
/*
 * Import script for the site chrome. Run on the homepage snapshot
 * (https://www.manulifeim.com/institutional/tw/en); the header, rail, site banner, region /
 * attestation dialog and footer are identical on every live page.
 *
 * Output documents (structure: migration-work/analysis/chrome.md):
 *   /nav                                          blocks/header
 *   /footer                                       blocks/footer
 *   /institutional/tw/en/fragments/attestation    blocks/attestation (Taiwan disclaimer)
 *   /institutional/tw/en/fragments/region-select  blocks/attestation ("Select a location")
 *
 * transform() returns all four as an array of { element, path, report } (helix-importer
 * html2md / dry run). The excat bulk importer writes only one result per URL, so a `doc`
 * query parameter selects one document per run, e.g.
 *   https://www.manulifeim.com/institutional/tw/en?doc=nav   (nav | footer | attestation | region-select)
 * The snapshot lookup ignores the query, so all four URLs read the homepage snapshot.
 *
 * The parsers run in preprocess(): the importer's own preProcess (before transform) strips
 * <hr>, nbsp-only paragraphs and classless spans from the page, which the footer columns need.
 * Links: utils/links.js rules (LINKS.md); data-live-href pins CPS auth links to the live site.
 */
import parseNav from './parsers/chrome-nav.js';
import parseFooter from './parsers/chrome-footer.js';
import parseAttestation from './parsers/chrome-attestation.js';
import parseRegionSelect from './parsers/chrome-region-select.js';

import { rewriteLinks, absoluteAssetUrl, normalizePath, LIVE_ORIGIN } from './utils/links.js';

const DOCS = [
  { id: 'nav', path: '/nav', parse: parseNav },
  { id: 'footer', path: '/footer', parse: parseFooter },
  { id: 'attestation', path: '/institutional/tw/en/fragments/attestation', parse: parseAttestation },
  { id: 'region-select', path: '/institutional/tw/en/fragments/region-select', parse: parseRegionSelect },
];

const cache = new WeakMap();

function pageUrl(url, params) {
  try {
    return new URL((params && params.originalURL) || url, LIVE_ORIGIN);
  } catch (e) {
    return new URL(LIVE_ORIGIN);
  }
}

function finalize(element, ctx) {
  rewriteLinks(element, ctx);
  element.querySelectorAll('[data-live-href]').forEach((a) => {
    const href = a.getAttribute('data-live-href');
    a.setAttribute('href', href);
    a.removeAttribute('data-live-href');
    if (href.startsWith(LIVE_ORIGIN)) ctx.unmigrated.set(href, (a.textContent || '').trim());
  });
  element.querySelectorAll('img').forEach((img) => {
    img.setAttribute('src', absoluteAssetUrl(img.getAttribute('src')));
  });
  return element;
}

function build(document, url, params) {
  const u = pageUrl(url, params);
  const livePath = normalizePath(u.pathname);
  return DOCS.map((d) => {
    const ctx = { livePath, unmigrated: new Map(), rules: {} };
    let element;
    try {
      element = finalize(d.parse(document), ctx);
    } catch (e) {
      console.error(`[import-chrome] ${d.id} failed:`, e);
      element = document.createElement('div');
    }
    return { ...d, element, ctx, livePath };
  });
}

export default {
  preprocess: ({ document, url, params }) => {
    cache.set(document, build(document, url, params));
  },

  transform: ({ document, url, params }) => {
    const docs = cache.get(document) || build(document, url, params);
    const wanted = (pageUrl(url, params).searchParams.get('doc') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const selected = wanted.length ? docs.filter((d) => wanted.includes(d.id)) : docs;
    if (!selected.length) throw new Error(`[import-chrome] unknown doc "${wanted.join(',')}" (nav, footer, attestation, region-select)`);
    return selected.map((d) => {
      const unmigrated = [...d.ctx.unmigrated.keys()];
      return {
        element: d.element,
        path: d.path,
        report: {
          title: d.id,
          template: 'chrome',
          'live-path': d.livePath,
          'eds-path': d.path,
          blocks: '',
          sections: d.element.querySelectorAll(':scope > hr').length + 1,
          'unmigrated-link-count': unmigrated.length,
          'unmigrated-links': JSON.stringify(unmigrated),
        },
      };
    });
  },
};
