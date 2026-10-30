/* eslint-disable */
/* global WebImporter */
/*
 * Import script for the EDS template "press-release" (pages.csv groups: see page-templates.json).
 * Shape: excat-import-script (transform() one input / one output, parsers + transformers).
 * Runs in the bulk importer browser on the snapshot DOM (page.setContent, so
 * document.location is about:blank: all URLs are resolved against www.manulifeim.com).
 *
 * Flow:
 *   beforeTransform  metadata (collect) -> cleanup (chrome, junk) -> sections (page model)
 *   parsers          one per PAGE_TEMPLATE.blocks[].name, on the live component selectors
 *   afterTransform   metadata (append) -> sections (flatten: <hr> + Section Metadata) -> links
 * Result path: the page's eds_path from pages.csv (link-map.json).
 */
import PAGE_TEMPLATES from './page-templates.json';

import heroCarouselParser from './parsers/hero-carousel.js';
import heroBannerParser from './parsers/hero-banner.js';
import heroPageHeaderParser from './parsers/hero-page-header.js';
import sectionNavAnchorsParser from './parsers/section-nav-anchors.js';
import sectionNavLinksParser from './parsers/section-nav-links.js';
import columnsParser from './parsers/columns.js';
import cardsTilesParser from './parsers/cards-tiles.js';
import cardsArticlesParser from './parsers/cards-articles.js';
import cardsNewsParser from './parsers/cards-news.js';
import cardsCaseStudiesParser from './parsers/cards-case-studies.js';
import disclosureParser from './parsers/disclosure.js';
import featureMarketingParser from './parsers/feature-marketing.js';
import featureKickerParser from './parsers/feature-kicker.js';
import featureBannerParser from './parsers/feature-banner.js';
import promoParser from './parsers/promo.js';
import articleListParser from './parsers/article-list.js';
import browseByParser from './parsers/browse-by.js';
import tagListParser from './parsers/tag-list.js';
import linkListInlineParser from './parsers/link-list-inline.js';
import linkListParser from './parsers/link-list.js';
import authorParser from './parsers/author.js';
import figureParser from './parsers/figure.js';
import tableParser from './parsers/table.js';
import teamParser from './parsers/team.js';
import socialLinksParser from './parsers/social-links.js';
import relatedArticlesParser from './parsers/related-articles.js';
import caseStudySidebarParser from './parsers/case-study-sidebar.js';
import formParser from './parsers/form.js';
import searchParser from './parsers/search.js';
import listingParser from './parsers/listing.js';
import tabsParser from './parsers/tabs.js';
import strategySectionParser from './parsers/strategy-section.js';
import videoParser from './parsers/video.js';

import metadataTransformer from './transformers/metadata.js';
import cleanupTransformer from './transformers/cleanup.js';
import sectionsTransformer from './transformers/sections.js';
import linksTransformer from './transformers/links.js';

import { documentPathFor, normalizePath, LIVE_ORIGIN } from './utils/links.js';
import { markStrategyPanels } from './utils/page-model.js';

const TEMPLATE_NAME = 'press-release';
const PAGE_TEMPLATE = PAGE_TEMPLATES.templates.find((t) => t.name === TEMPLATE_NAME);

const parsers = {
  'hero-carousel': heroCarouselParser,
  'hero-banner': heroBannerParser,
  'hero-page-header': heroPageHeaderParser,
  'section-nav-anchors': sectionNavAnchorsParser,
  'section-nav-links': sectionNavLinksParser,
  columns: columnsParser,
  'cards-tiles': cardsTilesParser,
  'cards-articles': cardsArticlesParser,
  'cards-news': cardsNewsParser,
  'cards-case-studies': cardsCaseStudiesParser,
  disclosure: disclosureParser,
  'feature-marketing': featureMarketingParser,
  'feature-kicker': featureKickerParser,
  'feature-banner': featureBannerParser,
  promo: promoParser,
  'article-list': articleListParser,
  'browse-by': browseByParser,
  'tag-list': tagListParser,
  'link-list-inline': linkListInlineParser,
  'link-list': linkListParser,
  author: authorParser,
  figure: figureParser,
  table: tableParser,
  team: teamParser,
  'social-links': socialLinksParser,
  'related-articles': relatedArticlesParser,
  'case-study-sidebar': caseStudySidebarParser,
  form: formParser,
  search: searchParser,
  listing: listingParser,
  tabs: tabsParser,
  'strategy-section': strategySectionParser,
  video: videoParser,
};

// order matters: metadata reads <head> and the live sidebar before cleanup / sections
const transformers = [metadataTransformer, cleanupTransformer, sectionsTransformer, linksTransformer];

PAGE_TEMPLATE.blocks.forEach((b) => {
  if (!parsers[b.name]) throw new Error(`[import-${TEMPLATE_NAME}] missing parser for block "${b.name}"`);
});

function executeTransformers(hookName, element, payload) {
  const enhancedPayload = { ...payload, template: PAGE_TEMPLATE };
  transformers.forEach((fn) => {
    try {
      fn(hookName, element, enhancedPayload);
    } catch (e) {
      console.error(`Transformer failed at ${hookName}:`, e);
    }
  });
}

function findBlocksOnPage(document, template) {
  const pageBlocks = [];
  template.blocks.forEach((blockDef) => {
    blockDef.instances.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        pageBlocks.push({ name: blockDef.name, selector, element });
      });
    });
  });
  return pageBlocks;
}

function livePathOf(url, params) {
  try {
    return normalizePath(new URL((params && params.originalURL) || url, LIVE_ORIGIN).pathname);
  } catch (e) {
    return '/';
  }
}

// body chrome removed before the importer's own preProcess (keeps <head> for metadata)
const PRE_CHROME = ['#auth-container', 'div.xfpage', 'dialog#region-modal', '#onetrust-consent-sdk', 'dialog.videoModal', 'nav.sidebar', 'header.header'];

export default {
  preprocess: ({ document }) => {
    // before the importer's preProcess drops <hr> and empty <a> (strategy panel markers)
    markStrategyPanels(document);
    PRE_CHROME.forEach((sel) => document.querySelectorAll(sel).forEach((n) => {
      if (!n.querySelector('main')) n.remove();
    }));
    // the importer's preProcess (DOMUtils.reviewHeadings) strips <strong> inside headings;
    // live bold headings (stats tiles "## **53.7%**", feature banner title) keep it as <b>
    document.querySelectorAll('h1 strong, h2 strong, h3 strong, h4 strong, h5 strong, h6 strong').forEach((s) => {
      const b = document.createElement('b');
      while (s.firstChild) b.append(s.firstChild);
      s.replaceWith(b);
    });
  },

  transform: (payload) => {
    const { document, url, params } = payload;
    const main = document.body;
    const livePath = livePathOf(url, params);
    const ctx = {
      livePath, unmigrated: new Map(), rules: {}, metadata: null,
    };
    const run = { ...payload, ctx };

    executeTransformers('beforeTransform', main, run);

    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);
    const parsed = [];
    pageBlocks.forEach((block) => {
      if (!block.element.isConnected) return;
      const parser = parsers[block.name];
      if (!parser) return;
      try {
        parser(block.element, {
          document, url, params, livePath,
        });
        parsed.push(block.name);
      } catch (e) {
        console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
      }
    });

    executeTransformers('afterTransform', main, run);

    const path = documentPathFor(livePath);
    const unmigrated = [...ctx.unmigrated.keys()];

    return [{
      element: main,
      path,
      report: {
        title: (ctx.metadata && ctx.metadata.Title) || document.title,
        template: PAGE_TEMPLATE.name,
        'live-path': livePath,
        'eds-path': path,
        blocks: [...new Set(parsed)].join(', '),
        sections: ctx.sections || 0,
        'unmigrated-link-count': unmigrated.length,
        'unmigrated-links': JSON.stringify(unmigrated),
      },
    }];
  },
};
