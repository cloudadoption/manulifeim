/* global WebImporter */
/*
 * Metadata transformer.
 *
 * beforeTransform: reads the page metadata from <head> and the live DOM (before the
 *   parsers replace the components) into payload.ctx.metadata.
 * afterTransform: appends the Metadata block to the last section.
 *
 * Fields (values kept exactly as live):
 *   all pages     Title (<title> without " | Manulife Investment Management"; press releases
 *                 keep the full live title), Description, Template, Image (og:image),
 *                 Canonical (only when the live canonical is not the page itself)
 *   articles      Publication Date (time[datetime]), Authors, Author Details (JSON array of
 *                 {name,title,company,photo,slug}), Asset Manager + Asset Manager Slug,
 *                 Category + Category Slug, Tags, Tag Slugs
 *   press release Publication Date (ISO, parsed from the "Month D, YYYY" <time> text),
 *                 Category (archive | press-releases)
 *   case study    Tags, Tag Slugs (AEM tag ids: themes/x, topics/y), Topic (topic slugs),
 *                 Theme (path segment)
 *   strategies    Asset Class (path segment after /strategies/)
 * Robots (noindex) is set site-wide in the bulk metadata sheet, not per page.
 */
import {
  text, norm, parseAuthorContainer, isoDate, imageFromUrl,
} from '../utils/dom.js';
import {
  LIVE_ORIGIN, normalizePath, lastSegment, authorSlugFromHref,
} from '../utils/links.js';

const SUFFIX = / \| Manulife Investment Management$/;

function headMeta(document, attr, key, raw = false) {
  const m = document.querySelector(`head meta[${attr}="${key}"]`) || document.querySelector(`meta[${attr}="${key}"]`);
  if (!m) return '';
  // a URL keeps its inner whitespace: DAM names can hold double spaces ("Viewpoint -  How …")
  return raw ? (m.getAttribute('content') || '').trim() : norm(m.getAttribute('content'));
}

function pageTitle(document) {
  const t = document.querySelector('head > title') || document.querySelector('title');
  return t ? norm(t.textContent) : '';
}

function articleFields(document, meta) {
  const time = document.querySelector('.viewpoint-detail__header time[datetime], .viewpoint-date time[datetime]');
  if (time) meta['Publication Date'] = time.getAttribute('datetime').slice(0, 10);
  else {
    const t = document.querySelector('.viewpoint-detail__header time');
    if (t) meta['Publication Date'] = isoDate(text(t));
  }
  const sidebar = document.querySelector('section.viewpoint-detail__sidebar');
  if (!sidebar) return;
  const authors = [...sidebar.querySelectorAll(':scope > .author-container')].map(parseAuthorContainer)
    .filter((a) => a.name);
  if (authors.length) {
    meta.Authors = authors.map((a) => a.name).join(', ');
    meta['Author Details'] = JSON.stringify(authors.map((a) => ({
      name: a.name,
      title: a.title,
      company: a.company,
      photo: a.photo,
      slug: authorSlugFromHref(a.link),
    })));
  }
  const manager = sidebar.querySelector('.manager-logo a[href*="assetManager"], .manager-logo a');
  if (manager) {
    const img = manager.querySelector('img');
    const name = norm(img ? img.getAttribute('alt') : '') || text(manager);
    if (name) meta['Asset Manager'] = name;
    meta['Asset Manager Slug'] = lastSegment(manager.getAttribute('href'));
  }
  const category = sidebar.querySelector('section.viewpoint-links[aria-label="Category"] a');
  if (category) {
    meta.Category = text(category);
    meta['Category Slug'] = lastSegment(category.getAttribute('href'));
  }
  const tags = [...sidebar.querySelectorAll('section.viewpoint-links[aria-label="Tags"] a')];
  if (tags.length) {
    meta.Tags = tags.map(text).join(', ');
    meta['Tag Slugs'] = tags.map((a) => lastSegment(a.getAttribute('href'))).join(', ');
  }
}

function pressReleaseFields(document, meta) {
  const root = document.querySelector('main .component-root') || document;
  const time = root.querySelector(':scope > .column-container time') || root.querySelector('time');
  if (time) {
    const iso = time.getAttribute('datetime') ? time.getAttribute('datetime').slice(0, 10) : isoDate(text(time));
    if (iso) meta['Publication Date'] = iso;
  }
  const archived = [...root.querySelectorAll('.infoContainer')].some((ic) => /Archive section/i.test(text(ic)));
  meta.Category = archived ? 'archive' : 'press-releases';
}

function caseStudyFields(document, meta, livePath) {
  const pills = [...document.querySelectorAll('aside.caseStudyDetail__sidebar .caseStudyPills__link')];
  if (pills.length) {
    meta.Tags = pills.map(text).join(', ');
    // AEM tag ids from the pill hrefs (?en/case-studies/themes/timber): "themes/timber",
    // "topics/environmental"; same order as Tags (the listing pairs them for labels)
    const ids = pills.map((a) => {
      const m = (a.getAttribute('href') || '').match(/case-studies\/([a-z0-9-]+\/[a-z0-9-]+)/i);
      return m ? m[1].toLowerCase() : '';
    });
    if (ids.every(Boolean)) {
      meta['Tag Slugs'] = ids.join(', ');
      const topics = ids.filter((id) => id.startsWith('topics/')).map((id) => id.split('/')[1]);
      if (topics.length) meta.Topic = topics.join(', ');
    }
  }
  const m = livePath.match(/\/sustainable-investing-case-studies\/([^/]+)\//i);
  if (m) [, meta.Theme] = m;
}

function collect(document, templateName, ctx) {
  const livePath = ctx.livePath || '';
  const meta = {};
  const title = pageTitle(document);
  meta.Title = templateName === 'press-release' ? title : title.replace(SUFFIX, '');
  const desc = headMeta(document, 'name', 'description');
  if (desc) meta.Description = desc;
  meta.Template = ctx.metadataTemplate || templateName;

  if (templateName === 'viewpoint') articleFields(document, meta);
  if (templateName === 'press-release') pressReleaseFields(document, meta);
  if (templateName === 'case-study-detail') caseStudyFields(document, meta, livePath);
  const strat = livePath.match(/\/institutional\/tw\/en\/strategies\/([^/]+)/i);
  if (strat) [, meta['Asset Class']] = strat;

  // a second URL glued into the host (live "https://www.manulifeim.comhttps://author-tmp...")
  // is no image; a URL in the query string is fine
  const og = headMeta(document, 'property', 'og:image', true);
  if (og && !/^(?:https?:)?\/\/[^/?#]*?https?:?\/\//i.test(og)) meta.Image = og;

  const canonical = document.querySelector('head link[rel="canonical"]') || document.querySelector('link[rel="canonical"]');
  if (canonical && canonical.getAttribute('href')) {
    const href = canonical.getAttribute('href');
    try {
      const u = new URL(href, LIVE_ORIGIN);
      const self = normalizePath(livePath);
      const same = /(^|\.)manulifeim\.com$/i.test(u.hostname) && normalizePath(u.pathname) === self;
      if (!same) meta.Canonical = u.href;
    } catch (e) {
      // ignore
    }
  }
  return meta;
}

/** Image metadata as an <img> element (the importer downloads it like body images). */
function toCells(document, meta) {
  const cells = {};
  Object.entries(meta).forEach(([k, v]) => {
    if (!v) return;
    if (k === 'Image') cells[k] = imageFromUrl(document, v);
    else cells[k] = v;
  });
  return cells;
}

export default function transform(hookName, element, payload) {
  const { document } = payload;
  const ctx = payload.ctx || {};
  const name = payload.template && payload.template.name;
  if (hookName === 'beforeTransform') {
    ctx.metadata = collect(document, name, ctx);
  } else if (hookName === 'afterTransform' && ctx.metadata) {
    const tableEl = WebImporter.Blocks.getMetadataBlock(document, toCells(document, ctx.metadata));
    // kept apart from the sections: the sections transformer appends it at the very end
    // of the document (after the last Section Metadata), also for pages without content
    const holder = document.createElement('div');
    holder.className = 'mim-metadata';
    holder.append(tableEl);
    (document.body.querySelector(':scope > .mim-page') || document.body).append(holder);
  }
}
