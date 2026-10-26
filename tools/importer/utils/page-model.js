/* eslint-disable no-use-before-define */
/*
 * Page model: turns the live template root into an ordered list of EDS sections.
 *
 * Rules (see migration-work/analysis/blocks.md §0 and block-authoring.md):
 * - one live component per section (component-root templates); article and press
 *   release bodies are a flow (one section, split only at dividers)
 * - sectionBreak -> Section Metadata Id + Nav Title of the next section
 * - divider -> Section Metadata Style: divider on the next section
 * - column-container qw-8 -> Style: centered
 * - multi-column column-container with default content in 2+ columns -> Columns block;
 *   nested components (simpleBanner, marketoForm, disclosures, ...) cannot nest in DA
 *   and follow as their own sections; otherwise the columns are flattened in order
 * - junk components are dropped
 *
 * The model is rendered as <div class="mim-section" data-mim="{json}"> wrappers holding
 * default-content nodes (already cleaned) and the original block components (parsed
 * later by the parsers). transformers/sections.js flattens them into <hr> + Section
 * Metadata after parsing.
 */
import {
  h, text, isEmpty, richText, image, linkFrom, linkParagraph, norm, stripUi,
} from './dom.js';

/* live components that are not content */
const DROP = [
  'ghost', 'trending-topics2', 'consentModal', 'subscribe', 'strategyDetail', 'sort-viewpoints',
  'imageToggle', 'strategyTag', 'caseStudyDetail__bottom', 'pagination',
  'share-controls', 'viewpoint-detail__print-authors', 'videoModal', 'xfpage',
];

/* live component class -> block parser name */
export const BLOCK_COMPONENTS = {
  rotatingBanner: 'hero-carousel',
  extendedHeroBanner2: 'hero-banner',
  heroHeader2: 'hero-page-header',
  pressReleaseRoot__header: 'hero-page-header',
  infoContainer: 'cards-tiles',
  articleGroup: 'cards-articles',
  'latest-news': 'cards-news',
  pressItems: 'listing',
  pressReleaseRoot__content: 'listing',
  caseStudyList__app: 'listing',
  caseStudyResults: 'listing',
  'resources-listing': 'listing',
  teamListing: 'listing',
  richTitle: 'title',
  disclosures: 'disclosure',
  viewpointDisclaimer: 'disclosure',
  marketingSection: 'feature-marketing',
  'featureKicker__component-wrapper': 'feature-kicker',
  featureBanner: 'feature-banner',
  simpleBanner: 'promo',
  innerNavigationBar: 'section-nav-anchors',
  pressCategories__inner: 'section-nav-links',
  latestViewpoints: 'article-list',
  viewpointsList: 'listing',
  moreInsights: 'link-list-inline',
  linkList2: 'link-list',
  'viewpoint-links': 'link-list',
  browseBar: 'browse-by',
  'viewpoint-tags__component-wrapper': 'tag-list',
  'related-viewpoints': 'related-articles',
  social: 'social-links',
  table2: 'table',
  teamMembers: 'team',
  landingImage2: 'figure',
  landingimage: 'figure',
  marketoForm: 'form',
  caseStudyDetail__sidebar: 'case-study-sidebar',
  'mim-authors': 'author',
  search: 'search',
};

const DEFAULT_COMPONENTS = [
  'text', 'title', 'image', 'keyTakeaways', 'quote2', 'iframe-wrapper', 'landingCta',
  'navigationTabs', 'resourceDetail', 'documentsList', 'pressReleaseRoot__sidebar', 'pressSidebar',
];

/**
 * Classifies a live component element.
 * @returns {{kind: 'drop'|'block'|'default'|'columns'|'sectionBreak'|'divider', name?: string}}
 */
export function classify(el) {
  if (!el || el.nodeType !== 1) return { kind: 'drop' };
  const cl = [...el.classList];
  if (el.tagName === 'H1' || el.tagName === 'H2') return { kind: 'default', name: 'heading' };
  if (cl.some((c) => DROP.includes(c))) return { kind: 'drop' };
  if (cl.includes('sectionBreak')) return { kind: 'sectionBreak' };
  if (cl.includes('divider')) return { kind: 'divider' };
  if (cl.includes('column-container')) return { kind: 'columns' };
  if (cl.includes('table') && cl.includes('parbase')) return { kind: 'block', name: 'table' };
  if (cl.includes('search') && !cl.includes('search-mim')) return { kind: 'block', name: 'search' };
  const blockClass = cl.find((c) => BLOCK_COMPONENTS[c] && c !== 'search');
  if (blockClass) return { kind: 'block', name: BLOCK_COMPONENTS[blockClass] };
  if (cl.some((c) => DEFAULT_COMPONENTS.includes(c))) return { kind: 'default', name: cl.find((c) => DEFAULT_COMPONENTS.includes(c)) };
  if (el.tagName === 'TIME') return { kind: 'default', name: 'time' };
  return { kind: 'default', name: 'unknown' };
}

/** True when a block component carries no content worth importing. */
function emptyBlock(el, name) {
  if (name === 'search' || name === 'section-nav-anchors' || name === 'listing') return false;
  if (name === 'tag-list') return !el.querySelector('a[href]');
  return isEmpty(el);
}

/**
 * Converts a default-content component into clean nodes. Figures inside
 * navigationTabs stay as live elements so the figure parser picks them up.
 * @returns {Element[]}
 */
export function toDefault(document, el, name) {
  switch (name) {
    case 'heading': {
      const html = stripUi(el.cloneNode(true)).innerHTML.trim();
      const hd = h(document, el.tagName.toLowerCase(), html);
      return text(hd) ? [hd] : [];
    }
    case 'time': return [h(document, 'p', text(el))];
    case 'quote2': {
      const q = el.querySelector('blockquote') || el;
      const bq = h(document, 'blockquote', richText(document, q));
      return text(bq) ? [bq] : [];
    }
    case 'iframe-wrapper': {
      const url = el.getAttribute('data-desktop-url') || (el.querySelector('iframe') || { getAttribute: () => '' }).getAttribute('src');
      const lp = url && url !== 'undefined' ? linkParagraph(document, url, url) : null;
      return lp ? [lp] : [];
    }
    case 'landingCta': {
      const out = [];
      const img = image(document, el.querySelector('img'));
      if (img) out.push(h(document, 'p', img));
      out.push(...richText(document, el.querySelector('.cta-module__content')));
      const a = el.querySelector('.cta-module__link');
      if (a) out.push(linkFrom(document, a));
      return out.filter(Boolean);
    }
    case 'navigationTabs': {
      const out = [];
      const title = el.querySelector('.navigationTabs__title');
      if (text(title)) out.push(h(document, 'h2', text(title)));
      el.querySelectorAll('.navigationTabs__contentItem').forEach((item) => {
        const t = item.querySelector('.navigationTabs__contentTitle');
        if (text(t)) out.push(h(document, 'h3', text(t)));
        const inner = item.querySelector('.navigationTabs__contentInner') || item;
        [...inner.children].forEach((c) => {
          const k = classify(c);
          if (k.kind === 'block') out.push(c);
          else if (k.kind === 'default') out.push(...toDefault(document, c, k.name));
        });
      });
      return out;
    }
    case 'resourceDetail': {
      const out = [];
      const img = image(document, el.querySelector('.resourceDetail__img'));
      if (img) out.push(h(document, 'p', img));
      const t = el.querySelector('.resourceDetail__title');
      if (text(t)) out.push(h(document, 'h1', text(t)));
      ['.resourceDetail__tagline', '.resourceDetail__desc'].forEach((s) => {
        const p = el.querySelector(s);
        if (text(p)) out.push(h(document, 'p', p.innerHTML.trim()));
      });
      el.querySelectorAll('.resourceDetail__link').forEach((a) => out.push(linkFrom(document, a)));
      return out.filter(Boolean);
    }
    case 'pressReleaseRoot__sidebar':
    case 'pressSidebar': {
      const out = [];
      el.querySelectorAll('.pressSidebar__info').forEach((info) => {
        [...info.children].forEach((c) => {
          if (/^H[1-6]$/.test(c.tagName)) out.push(h(document, c.tagName.toLowerCase(), text(c)));
          else if (c.tagName === 'A') out.push(linkFrom(document, c));
          else if (text(c)) out.push(h(document, 'p', c.innerHTML.trim()));
        });
      });
      return out.filter(Boolean);
    }
    default:
      return richText(document, el);
  }
}

/* nested components that can sit inside a column-container column */
function columnItems(col) {
  return [...col.children].map((c) => ({ el: c, ...classify(c) })).filter((i) => i.kind !== 'drop');
}

function widthOf(col) {
  const m = col.className.match(/--(fw|qw)-(\d+)/);
  return m ? Number(m[2]) : 12;
}

const LAYOUTS = {
  '8,4': '8-4', '6,6': '6-6', '4,4,4': '4-4-4', '3,3,3,3': '3-3-3-3',
};

/**
 * Expands a column-container into model items:
 * [{type:'columns', el}] | [{type:'default', nodes}] | [{type:'block', el}] | [{type:'divider'}]
 */
export function expandColumns(document, cc) {
  const container = cc.querySelector(':scope > .column-container__container');
  if (!container) {
    // press release date holder: <div class="column-container"><time>
    const nodes = isEmpty(cc) ? [] : [h(document, 'p', text(cc))];
    return nodes.length ? [{ type: 'default', nodes }] : [];
  }
  const centered = container.classList.contains('column-container__container--quarter-width')
    || !!container.querySelector(':scope > .column-container__column--qw-8');
  const cols = [...container.querySelectorAll(':scope > .column-container__column')];
  const items = cols.map((c) => columnItems(c));
  const defaultCols = items.filter((list) => list.some((i) => i.kind === 'default' && !isEmpty(i.el))).length;
  const nested = items.flat().filter((i) => i.kind !== 'default');
  const out = [];

  if (cols.length >= 2 && defaultCols >= 2) {
    const widths = cols.map(widthOf).join(',');
    nested.forEach((i) => i.el.remove());
    cc.setAttribute('data-mim-columns', LAYOUTS[widths] || '');
    out.push({ type: 'columns', el: cc, centered });
    nested.forEach((i) => out.push(...itemFor(document, i)));
    return out;
  }

  // sequential flatten
  let run = null;
  items.flat().forEach((i) => {
    if (i.kind === 'default') {
      const nodes = toDefault(document, i.el, i.name);
      if (!nodes.length) return;
      if (!run) {
        run = { type: 'default', nodes: [], centered };
        out.push(run);
      }
      run.nodes.push(...nodes);
      return;
    }
    run = null;
    out.push(...itemFor(document, i).map((x) => ({ ...x, centered })));
  });
  return out;
}

function itemFor(document, i) {
  if (i.kind === 'divider') return [{ type: 'divider' }];
  if (i.kind === 'sectionBreak') return [{ type: 'sectionBreak', el: i.el }];
  if (i.kind === 'columns') return expandColumns(document, i.el);
  if (i.kind === 'block') return emptyBlock(i.el, i.name) ? [] : [{ type: 'block', el: i.el, name: i.name }];
  if (i.kind === 'default') {
    const nodes = toDefault(document, i.el, i.name);
    return nodes.length ? [{ type: 'default', nodes }] : [];
  }
  return [];
}

/** Model items for a list of live component elements. */
export function itemsFor(document, elements) {
  return elements.flatMap((el) => itemFor(document, { el, ...classify(el) }));
}

/**
 * Groups model items into sections.
 * @param {object[]} items
 * @param {{flow?: boolean}} opts flow: consecutive items share a section
 *   (split at dividers / breaks)
 * @returns {{nodes: Element[], styles: string[], id?: string, navTitle?: string}[]}
 */
export function toSections(items, opts = {}) {
  const sections = [];
  let pending = { styles: [] };
  let current = null;
  const start = () => {
    current = {
      nodes: [], styles: [...pending.styles], id: pending.id, navTitle: pending.navTitle,
    };
    pending = { styles: [] };
    sections.push(current);
    return current;
  };
  items.forEach((it) => {
    if (it.type === 'divider') {
      if (!pending.styles.includes('divider')) pending.styles.push('divider');
      current = null;
      return;
    }
    if (it.type === 'sectionBreak') {
      const s = it.el.querySelector('[data-section]') || it.el;
      pending.id = s.id || '';
      pending.navTitle = norm(s.getAttribute('data-section') || '');
      current = null;
      return;
    }
    if (it.type === 'section') {
      // explicit section (e.g. article sidebar) with its own styles
      current = null;
      const sec = start();
      it.styles.forEach((st) => { if (!sec.styles.includes(st)) sec.styles.push(st); });
      sec.nodes.push(...it.nodes);
      current = null;
      return;
    }
    const centered = !!it.centered;
    let sec;
    if (opts.flow && current && !centered && !current.centered) {
      sec = current;
    } else {
      sec = start();
      if (centered) {
        sec.centered = true;
        if (!sec.styles.includes('centered')) sec.styles.push('centered');
      }
    }
    if (it.type === 'default') sec.nodes.push(...it.nodes);
    else sec.nodes.push(it.el);
    current = opts.flow && !centered ? sec : null;
  });
  return sections.filter((s) => s.nodes.length);
}

/** Same slug as aem.js toClassName (section-nav default anchor). */
export function slug(value) {
  return String(value || '').toLowerCase().replace(/[^0-9a-z]/gi, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Renders sections as <div class="mim-section" data-mim> wrappers in a new page div. */
export function renderSections(document, sections) {
  const page = document.createElement('div');
  page.className = 'mim-page';
  sections.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'mim-section';
    const meta = {};
    if (s.styles && s.styles.length) meta.Style = s.styles.join(', ');
    if (s.navTitle) meta['Nav Title'] = s.navTitle;
    if (s.id && (!s.navTitle || s.id !== slug(s.navTitle))) meta.Id = s.id;
    if (s.layout) meta.Layout = s.layout;
    div.setAttribute('data-mim', JSON.stringify(meta));
    s.nodes.forEach((n) => div.append(n));
    page.append(div);
  });
  return page;
}
