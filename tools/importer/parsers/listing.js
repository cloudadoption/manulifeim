/* eslint-disable */
/* global WebImporter */
/*
 * Parser: listing. Live server/React lists that page through many items are imported as a
 * config-only `Listing (<variant>)` block; the block reads the query index on EDS
 * (tools/importer/query.yaml, QUERY-INDEX.md) and renders filters, sort and paging itself.
 *
 *   .list.viewpointsList        viewpoints category pages                    -> Listing (viewpoints)
 *   .viewpointsList2__content   /viewpoints/all (React, "N listings" + list) -> Listing (viewpoints)
 *   .pressReleaseRoot__content  press listing (sidebar + pressItems + pages) -> Listing (press)
 *   .caseStudyList__app         case-study list and theme pages (React)     -> Listing (case-studies)
 *   .resources-listing          resources / documents / fact sheets (React) -> Listing (documents)
 *   .teamListing                people listing (consultant team)            -> Listing (people)
 *
 * Contract (block-authoring.md "listing"):
 *   | Listing (viewpoints) |                                                   |
 *   | Source  | /institutional/tw/en/query-index-viewpoints.json             |
 *   | Filter  | category=fixed-income                                         |  (opt)
 *   | Limit   | 10                                                            |  (page size)
 *   | Sort    | newest                                                        |  (opt)
 *   | Empty   | Sorry, no results match this criteria                         |  (opt)
 *   | Count   | {count} listings                                              |  (opt, viewpoints)
 *   | Sidebar | rich text (press: Media relations)                            |  (opt)
 */
import { block } from '../utils/dom.js';
import { toDefault } from '../utils/page-model.js';
import { SITE_ROOT, normalizePath, lookupEdsPath } from '../utils/links.js';

const INDEX = {
  viewpoints: `${SITE_ROOT}/query-index-viewpoints.json`,
  press: `${SITE_ROOT}/query-index-press.json`,
  'case-studies': `${SITE_ROOT}/query-index-case-studies.json`,
  documents: `${SITE_ROOT}/query-index-resources.json`,
  people: `${SITE_ROOT}/query-index-people.json`,
};

function edsPath(livePath) {
  return lookupEdsPath(livePath) || normalizePath(livePath).toLowerCase();
}

function viewpointsRows(element, livePath) {
  const rows = [['Source', INDEX.viewpoints]];
  const m = normalizePath(livePath || '').match(/\/viewpoints\/([^/]+)$/i);
  const slug = m ? m[1].toLowerCase() : '';
  if (slug && slug !== 'all') rows.push(['Filter', `category=${slug}`]);
  rows.push(['Limit', String(element.querySelectorAll('.viewpointList__item').length > 10 ? element.querySelectorAll('.viewpointList__item').length : 10)]);
  rows.push(['Sort', 'newest']);
  // /viewpoints/all: the live "9 listings" line, the number becomes the filtered result count
  const count = element.querySelector('.viewpointsList2__listing');
  const countText = count ? count.textContent.replace(/\s+/g, ' ').trim() : '';
  if (/\d/.test(countText)) rows.push(['Count', countText.replace(/[\d,.]+/, '{count}')]);
  return rows;
}

function pressRows(document, element) {
  const rows = [['Source', INDEX.press]];
  // the root listing is the "Press releases" category on live (active tab, page 2 = /category/press-releases/page/2)
  rows.push(['Filter', 'category=press-releases']);
  rows.push(['Limit', String(Math.max(10, element.querySelectorAll('.pressItems__item').length))]);
  rows.push(['Sort', 'newest']);
  const sidebar = element.querySelector('.pressSidebar, .pressReleaseRoot__sidebar');
  if (sidebar) {
    const nodes = toDefault(document, sidebar, 'pressSidebar');
    if (nodes.length) rows.push(['Sidebar', nodes]);
  }
  return rows;
}

function caseStudyRows(element, livePath) {
  const rows = [['Source', INDEX['case-studies']]];
  const app = element.matches('[data-page-path]') ? element : element.querySelector('[data-page-path]');
  let pagePath = app ? app.getAttribute('data-page-path') : '';
  pagePath = pagePath ? pagePath.replace('/content/mim-institutional/tw/en', SITE_ROOT) : normalizePath(livePath || '');
  const base = `${SITE_ROOT}/sustainable-investing-case-studies`;
  const eds = edsPath(pagePath);
  if (eds && eds.toLowerCase() !== base) rows.push(['Filter', `path=${eds}`]);
  rows.push(['Limit', '9'], ['Sort', 'newest']);
  return rows;
}

function documentRows(element, livePath) {
  const rows = [['Source', INDEX.documents]];
  const m = normalizePath(livePath || '').match(/\/resources\/([^/]+)$/i);
  if (m) rows.push(['Filter', `type=${m[1].toLowerCase()}`]);
  rows.push(['Limit', '10'], ['Sort', 'newest']);
  const app = element.querySelector('[data-emptytext]') || element;
  const empty = app.getAttribute && app.getAttribute('data-emptytext');
  if (empty) rows.push(['Empty', empty]);
  return rows;
}

function peopleRows(element, livePath) {
  const rows = [['Source', INDEX.people]];
  const p = edsPath(livePath || '');
  if (p) rows.push(['Filter', `path=${p}`]);
  rows.push(['Sort', 'name']);
  return rows;
}

export default function parse(element, { document, livePath }) {
  let variant = 'viewpoints';
  let rows;
  if (element.matches('.pressReleaseRoot__content, ul.pressItems')) {
    variant = 'press';
    rows = pressRows(document, element);
  } else if (element.matches('.caseStudyList__app, .caseStudyResults')) {
    variant = 'case-studies';
    rows = caseStudyRows(element, livePath);
  } else if (element.matches('.resources-listing')) {
    variant = 'documents';
    rows = documentRows(element, livePath);
  } else if (element.matches('.teamListing')) {
    variant = 'people';
    rows = peopleRows(element, livePath);
  } else {
    rows = viewpointsRows(element, livePath);
  }
  element.replaceWith(block(document, 'Listing', [variant], rows));
}
