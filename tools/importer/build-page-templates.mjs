#!/usr/bin/env node
/* eslint-disable no-console, max-len, no-restricted-syntax, no-await-in-loop, no-continue, no-nested-ternary, import/no-unresolved, import/extensions */
/*
 * Builds tools/importer/page-templates.json: one template per EDS template (the
 * `Template` metadata value), its live URLs from tools/migration-scope/pages.csv
 * (live_status 200 or unchecked) and the block parsers with their live DOM selectors.
 *
 *   node tools/importer/build-page-templates.mjs
 *
 * Every template lists every parser: the page model (utils/page-model.js) decides which
 * live components exist on a page, a selector that matches nothing is a no-op.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://www.manulifeim.com';

/* template -> pages.csv template_group(s) */
export const TEMPLATES = [
  { name: 'home', groups: ['homepage'], description: 'Homepage: carousel hero, capability tiles, news, viewpoints (route home).' },
  {
    name: 'plain',
    groups: ['hub', 'landing', 'strategy', 'strategy-listing', 'team', 'legal', 'people', 'people-listing', 'resource', 'resource-listing'],
    description: 'Plain component pages (route plain / resource): one live component per section.',
  },
  { name: 'viewpoints', groups: ['viewpoints-listing'], description: 'Viewpoints landing and category pages (route viewpoints / viewpointsCategory).' },
  { name: 'viewpoint', groups: ['article'], description: 'Viewpoint article: header section, body, sidebar section (Style: sidebar), related + tags (route viewpoint).' },
  { name: 'press-release-root', groups: ['press-release-listing'], description: 'Press release listing (route pressReleaseRoot).' },
  { name: 'press-release', groups: ['press-release'], description: 'Press release: date, archive notice, h1 and body in one flow (route pressRelease).' },
  { name: 'case-study-list', groups: ['case-study-listing'], description: 'Sustainable investing case-study listing and theme pages (route caseStudyList).' },
  { name: 'case-study-detail', groups: ['case-study'], description: 'Case study: header, ISSUE/ACTION/OUTCOME body, sidebar section (route caseStudyDetail).' },
  { name: 'search', groups: ['search'], description: 'Search page (Coveo on live, query-index search on EDS).' },
];

/* parser name -> live selectors (page model wrappers: .mim-authors, [data-mim-columns]) */
export const BLOCKS = [
  { name: 'hero-carousel', instances: ['.rotatingBanner'] },
  { name: 'hero-banner', instances: ['.extendedHeroBanner2'] },
  { name: 'hero-page-header', instances: ['.heroHeader2', '.pressReleaseRoot__header'] },
  { name: 'section-nav-anchors', instances: ['.innerNavigationBar'] },
  { name: 'section-nav-links', instances: ['.pressCategories__inner'] },
  // before figure: a Tabs block takes the figures of its panels
  { name: 'tabs', instances: ['.navigationTabs'] },
  { name: 'strategy-section', instances: ['section.strategyDetail__section'] },
  { name: 'video', instances: ['.videoKicker'] },
  { name: 'columns', instances: ['.column-container[data-mim-columns]'] },
  { name: 'cards-tiles', instances: ['.infoContainer'] },
  { name: 'cards-articles', instances: ['.articleGroup'] },
  { name: 'cards-news', instances: ['.latest-news'] },
  { name: 'cards-case-studies', instances: [] },
  { name: 'title', instances: ['.richTitle'] },
  { name: 'disclosure', instances: ['.disclosures', '.viewpointDisclaimer'] },
  { name: 'feature-marketing', instances: ['.marketingSection'] },
  { name: 'feature-kicker', instances: ['.featureKicker__component-wrapper'] },
  { name: 'feature-banner', instances: ['.featureBanner'] },
  { name: 'promo', instances: ['.simpleBanner'] },
  { name: 'article-list', instances: ['.latestViewpoints'] },
  { name: 'listing', instances: ['.list.viewpointsList', '.viewpointsList2__content', '.pressReleaseRoot__content', '.caseStudyList__app', '.resources-listing', '.teamListing'] },
  { name: 'browse-by', instances: ['.browseBar'] },
  { name: 'tag-list', instances: ['.viewpoint-tags__component-wrapper'] },
  { name: 'link-list-inline', instances: ['.moreInsights'] },
  { name: 'link-list', instances: ['.linkList2', 'section.viewpoint-links'] },
  { name: 'author', instances: ['.mim-authors'] },
  { name: 'figure', instances: ['.landingImage2', '.landingimage'] },
  { name: 'table', instances: ['.table2', '.table.parbase'] },
  { name: 'team', instances: ['.teamMembers'] },
  { name: 'social-links', instances: ['.social'] },
  { name: 'related-articles', instances: ['.related-viewpoints'] },
  { name: 'case-study-sidebar', instances: ['aside.caseStudyDetail__sidebar'] },
  { name: 'form', instances: ['.marketoForm'] },
  { name: 'search', instances: ['.search:not(.search-mim)'] },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const [header, ...rows] = parseCsv(readFileSync(join(here, '../migration-scope/pages.csv'), 'utf-8'));
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const byGroup = {};
rows.forEach((r) => {
  const status = r[col.live_status].trim();
  if (status !== '200' && status !== 'unchecked') return;
  const g = r[col.template_group].trim();
  (byGroup[g] = byGroup[g] || []).push(`${ORIGIN}${r[col.live_path].trim()}`);
});

const out = {
  generated: 'tools/importer/build-page-templates.mjs (from tools/migration-scope/pages.csv)',
  templates: TEMPLATES.map((t) => ({
    name: t.name,
    description: t.description,
    groups: t.groups,
    urls: t.groups.flatMap((g) => byGroup[g] || []),
    blocks: BLOCKS,
  })),
};
writeFileSync(join(here, 'page-templates.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(out.templates.map((t) => `${t.name}: ${t.urls.length} urls`).join('\n'));
const unknown = Object.keys(byGroup).filter((g) => !TEMPLATES.some((t) => t.groups.includes(g)));
if (unknown.length) console.warn(`groups without a template: ${unknown.join(', ')}`);
