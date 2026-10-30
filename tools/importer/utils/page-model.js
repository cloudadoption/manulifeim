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
 * - multi-column column-container with content (default content or figures) in 2+ columns
 *   -> Columns block, figures inline in their cell; other nested components (simpleBanner,
 *   marketoForm, disclosures, ...) cannot nest in DA and follow as their own sections
 * - multi-column container where every column holds at most one item (one default-content
 *   run or one block) and the filled columns come first -> one section with Layout
 *   (e.g. text in an fw-8 column next to an empty fw-4 one, or text next to a form)
 * - otherwise the columns are flattened in order
 * - junk components are dropped
 * - richTitle (section heading, numbered heading or heading + link) -> its own section with
 *   Style title-row: the heading and the link paragraph as default content (no Title block)
 * - title (plain heading component, sized by its context on live) -> starts a section with
 *   Style section-title (in a flow the content after it stays in that section); a title in a
 *   Columns cell or a tab panel stays a plain heading
 * - navigationTabs whose panels hold only text and figures -> Tabs block; other navigationTabs
 *   with 2+ panels -> one section per panel with Section Metadata Tab: <label> (the site groups
 *   consecutive Tab sections into one tab set, scripts/section-tabs.js), blocks kept
 * - strategyDetail -> one section per data panel (Key facts, Performance, ...), with the
 *   panel's sectionBreak as Id / Nav Title and its divider (strategy-section parser)
 *
 * The model is rendered as <div class="mim-section" data-mim="{json}"> wrappers holding
 * default-content nodes (already cleaned) and the original block components (parsed
 * later by the parsers). transformers/sections.js flattens them into <hr> + Section
 * Metadata after parsing.
 */
import {
  h, text, isEmpty, richText, image, linkFrom, linkParagraph, norm, stripUi, inlineHtml,
} from './dom.js';

/* live components that are not content */
const DROP = [
  'ghost', 'trending-topics2', 'consentModal', 'subscribe', 'sort-viewpoints',
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
  videoKicker: 'video',
};

/** navigationTabs with 2+ panels that hold only text and figures can be a Tabs block. */
function tabsBlock(el) {
  const items = [...el.querySelectorAll('.navigationTabs__contentItem')];
  if (items.length < 2) return false;
  return items.every((item) => {
    const inner = item.querySelector('.navigationTabs__contentInner') || item;
    return [...inner.children].every((c) => {
      const k = classify(c);
      return k.kind === 'drop' || (k.kind === 'default' && k.name !== 'navigationTabs')
        || (k.kind === 'block' && k.name === 'figure');
    });
  });
}

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
  if (cl.includes('strategyDetail')) return { kind: 'strategy' };
  if (cl.includes('navigationTabs') && tabsBlock(el)) return { kind: 'block', name: 'tabs' };
  if (cl.includes('navigationTabs') && el.querySelectorAll('.navigationTabs__contentItem').length > 1) return { kind: 'tabSections' };
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

/* layouts of a row of small videos (two qw-4 columns of a quarter-width container = 6-6) */
const VIDEO_LAYOUTS = { ...LAYOUTS, '4,4': '6-6' };

/**
 * A row of small videos: 2+ columns of at most half the width, each empty or holding a videoKicker
 * optionally followed by a linkList2 (live "Download transcript (PDF)"), at least one video (an
 * empty column keeps the video at the left, as live). -> one section with Layout
 * whose Video blocks have the variant small; the links go into their video as a list
 * (ul[data-mim-video-links], read by the video parser). null when the columns are anything else.
 */
function videoRow(document, cols, all, centered) {
  const layout = VIDEO_LAYOUTS[cols.map(widthOf).join(',')];
  if (!layout) return null;
  // empty helpers next to the video (e.g. an html-container holding a style tag) do not count
  const blank = (el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('style, script').forEach((s) => s.remove());
    return isEmpty(c);
  };
  const items = all.map((list) => list.filter((i) => !(i.kind === 'default' && blank(i.el))));
  const isVideo = (i) => i.kind === 'block' && i.name === 'video';
  const isLinks = (i) => i.kind === 'block' && i.name === 'link-list' && i.el.classList.contains('linkList2');
  const videoColumn = (list, k) => list.length <= 2 && isVideo(list[0])
    && (list.length === 1 || isLinks(list[1])) && widthOf(cols[k]) <= 6;
  const ok = items.every((list, k) => list.length === 0 || videoColumn(list, k));
  if (!ok || !items.some((list) => list.length)) return null;
  const nodes = items.filter((list) => list.length).map(([video, links]) => {
    video.el.setAttribute('data-mim-video-small', '');
    if (links) {
      const ul = h(document, 'ul');
      ul.setAttribute('data-mim-video-links', '');
      links.el.querySelectorAll('a[href]').forEach((a) => {
        const lp = linkFrom(document, a);
        if (lp) ul.append(h(document, 'li', lp.firstElementChild));
      });
      if (ul.children.length) video.el.append(ul);
      links.el.remove();
    }
    return video.el;
  });
  return {
    type: 'section', styles: centered ? ['centered'] : [], nodes, layout, keepLayout: true,
  };
}

/**
 * Expands a column-container into model items:
 * [{type:'columns', el}] | [{type:'default', nodes}] | [{type:'block', el}] | [{type:'divider'}]
 */
export function expandColumns(document, cc, { noRow = false } = {}) {
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
  const isFigure = (i) => i.kind === 'block' && i.name === 'figure';
  const contentCols = items.filter((list) => list.some((i) => (i.kind === 'default' && !isEmpty(i.el)) || isFigure(i))).length;
  const nested = items.flat().filter((i) => i.kind !== 'default' && !isFigure(i));
  const out = [];

  const videos = cols.length >= 2 ? videoRow(document, cols, items, centered) : null;
  if (videos) return [videos];

  // every column filled, one holding 2+ components and a block among them (a promo under a
  // chart, a form beside a promo): one section per column with Section Metadata Column
  // (scripts/section-columns.js). toSections picks: a flow keeps the old model (row.flow).
  const rowLayout = LAYOUTS[cols.map(widthOf).join(',')];
  const plain = (i) => i.kind === 'default' || i.kind === 'divider' || (i.kind === 'block' && i.name !== 'title');
  // components of a column as the model counts them: a run of default components is one
  const runs = (list) => list.filter((i, k) => i.kind !== 'default' || k === 0 || list[k - 1].kind !== 'default').length;
  if (!noRow && rowLayout && !centered && cols.length >= 2 && items.every((list) => list.length)
    && nested.some((i) => i.kind === 'block') && items.some((list) => runs(list) > 1)
    && items.flat().every(plain)) {
    return [{
      type: 'columnRow',
      flow: () => expandColumns(document, cc, { noRow: true }),
      row: () => columnSections(document, items, rowLayout),
    }];
  }

  if (cols.length >= 2 && contentCols >= 2) {
    const widths = cols.map(widthOf).join(',');
    nested.forEach((i) => i.el.remove());
    cc.setAttribute('data-mim-columns', LAYOUTS[widths] || '');
    out.push({ type: 'columns', el: cc, centered });
    nested.forEach((i) => out.push(...itemFor(document, i)));
    return out;
  }

  const groups = items.map((list) => columnModel(document, list));
  const layout = LAYOUTS[cols.map(widthOf).join(',')];
  const filled = groups.map((g) => g.length);
  const last = filled.reduce((a, n, k) => (n ? k : a), -1);
  if (layout && !centered && last >= 0 && filled.every((n, k) => (k <= last ? n === 1 : n === 0))
    && groups.flat().every((it) => it.type === 'default' || it.type === 'block')
    && (last < cols.length - 1 || groups.flat().some((it) => it.type === 'block'))) {
    const nodes = groups.flat().flatMap((it) => (it.type === 'default' ? it.nodes : [it.el]));
    // Style section-title reaches the first column's heading only
    return [{
      type: 'section', styles: [...(groups[0][0].startStyles || [])], nodes, layout,
    }];
  }

  // sequential flatten
  let run = null;
  groups.flat().forEach((it) => {
    if (it.type === 'default') {
      if (!run || it.startStyles) {
        run = { type: 'default', nodes: [], centered };
        if (it.startStyles) run.startStyles = it.startStyles;
        out.push(run);
      }
      run.nodes.push(...it.nodes);
      return;
    }
    run = null;
    out.push({ ...it, centered });
  });
  return out;
}

/* one section per column (Column 1, 2, ...; Layout on the first): default runs and blocks in
   order; a divider inside a column is dropped */
function columnSections(document, items, layout) {
  const columns = items.map((list) => columnModel(document, list.filter((i) => i.kind !== 'divider')));
  return columns.map((col, k) => ({
    type: 'section',
    styles: [],
    nodes: col.flatMap((it) => (it.type === 'default' ? it.nodes : [it.el])),
    column: k + 1,
    ...(k ? {} : { layout }),
  }));
}

/* model items of one column: default runs merged, blocks / nested containers as items */
function columnModel(document, list) {
  const out = [];
  let run = null;
  list.forEach((i) => {
    if (i.kind === 'default') {
      const nodes = toDefault(document, i.el, i.name);
      if (!nodes.length) return;
      if (!run) {
        run = { type: 'default', nodes: [] };
        // a title opening a column run starts its section (a later one stays a plain heading)
        if (i.name === 'title') run.startStyles = ['section-title'];
        out.push(run);
      }
      run.nodes.push(...nodes);
      return;
    }
    run = null;
    out.push(...itemFor(document, i));
  });
  return out;
}

/**
 * Records the strategyDetail panel markers on the panels themselves. The importer's own
 * preProcess removes every <hr> and every empty <a> (a.sectionBreak), so the import scripts
 * call this in their preprocess: data-mim-break = {id, navTitle} of the panel's sectionBreak,
 * data-mim-divider when an <hr> precedes it, data-mim-trailing-divider on the root for an
 * <hr> after the last panel.
 */
export function markStrategyPanels(document) {
  document.querySelectorAll('.strategyDetail__root').forEach((root) => {
    let brk = null;
    let divider = false;
    [...root.children].forEach((c) => {
      if (c.classList.contains('sectionBreak')) {
        const s = c.matches('[data-section]') ? c : (c.querySelector('[data-section]') || c);
        brk = { id: s.id || c.id || '', navTitle: norm(s.getAttribute('data-section') || '') };
      } else if (c.tagName === 'HR') {
        divider = true;
      } else if (c.matches('section.strategyDetail__section')) {
        if (brk) c.setAttribute('data-mim-break', JSON.stringify(brk));
        if (divider) c.setAttribute('data-mim-divider', '');
        brk = null;
        divider = false;
      }
    });
    if (divider) root.setAttribute('data-mim-trailing-divider', '');
  });
}

/* strategyDetail panels: sectionBreak -> Id / Nav Title, hr -> divider, section -> block
   (from the data-mim-* markers when markStrategyPanels ran, else from the live elements) */
function expandStrategy(el) {
  const root = el.querySelector('.strategyDetail__root') || el;
  const marked = !!root.querySelector(':scope > [data-mim-break], :scope > [data-mim-divider]')
    || root.hasAttribute('data-mim-trailing-divider');
  const items = [...root.children].flatMap((c) => {
    if (!marked && c.classList.contains('sectionBreak')) return [{ type: 'sectionBreak', el: c }];
    if (!marked && c.tagName === 'HR') return [{ type: 'divider' }];
    if (!c.matches('section.strategyDetail__section') || isEmpty(c)) return [];
    const out = [];
    if (marked && c.hasAttribute('data-mim-divider')) out.push({ type: 'divider' });
    if (marked && c.hasAttribute('data-mim-break')) {
      let b = {};
      try {
        b = JSON.parse(c.getAttribute('data-mim-break'));
      } catch (e) {
        b = {};
      }
      const anchor = c.ownerDocument.createElement('a');
      anchor.id = b.id || '';
      anchor.setAttribute('data-section', b.navTitle || '');
      out.push({ type: 'sectionBreak', el: anchor });
    }
    out.push({ type: 'block', el: c, name: 'strategy-section' });
    return out;
  });
  if (marked && root.hasAttribute('data-mim-trailing-divider')) items.push({ type: 'divider' });
  return items;
}

let tabPanels = 0;

/* navigationTabs whose panels hold blocks: the title as default content, then every panel's
   items tagged with its label (tab) and a panel key (tabPanel); toSections gives each panel its
   own section(s) with Section Metadata Tab. Dividers and breaks inside a panel are dropped. */
function expandTabSections(document, el) {
  const out = [];
  const title = text(el.querySelector('.navigationTabs__title'));
  if (title) out.push({ type: 'default', nodes: [h(document, 'h2', title)] });
  el.querySelectorAll('.navigationTabs__contentItem').forEach((item) => {
    const label = text(item.querySelector('.navigationTabs__contentTitle'));
    const inner = item.querySelector('.navigationTabs__contentInner') || item;
    if (!label) return;
    tabPanels += 1;
    itemsFor(document, [...inner.children])
      .filter((it) => it.type !== 'divider' && it.type !== 'sectionBreak')
      .forEach((it) => out.push({ ...it, tab: label, tabPanel: tabPanels }));
  });
  return out;
}

/* richTitle -> nodes of a title-row section: its heading (live level, else h2; a styled <div>
   inside is flattened, <em>/<i>/<b>/<sup> kept) and its link as a link paragraph */
function titleNodes(document, el) {
  const hd = el.querySelector('.richtitle__text, h1, h2, h3, h4, h5, h6');
  const level = hd && /^H[1-6]$/.test(hd.tagName) ? Number(hd.tagName[1]) : 2;
  const html = inlineHtml(hd);
  const a = el.querySelector('.richtitle__link a');
  return [html ? h(document, `h${level}`, html) : null, a ? linkFrom(document, a) : null].filter(Boolean);
}

function itemFor(document, i) {
  if (i.kind === 'block' && i.name === 'title') {
    const nodes = titleNodes(document, i.el);
    return nodes.length ? [{ type: 'section', styles: ['title-row'], nodes }] : [];
  }
  if (i.kind === 'strategy') return expandStrategy(i.el);
  if (i.kind === 'tabSections') return expandTabSections(document, i.el);
  if (i.kind === 'divider') return [{ type: 'divider' }];
  if (i.kind === 'sectionBreak') return [{ type: 'sectionBreak', el: i.el }];
  if (i.kind === 'columns') return expandColumns(document, i.el);
  if (i.kind === 'block') return emptyBlock(i.el, i.name) ? [] : [{ type: 'block', el: i.el, name: i.name }];
  if (i.kind === 'default') {
    const nodes = toDefault(document, i.el, i.name);
    if (!nodes.length) return [];
    return [i.name === 'title' ? { type: 'default', nodes, startStyles: ['section-title'] } : { type: 'default', nodes }];
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
export function toSections(list, opts = {}) {
  // a row of column sections in a flow keeps the old model (Columns block, blocks after it)
  const items = list.flatMap((it) => (it.type === 'columnRow'
    ? (opts.flow ? it.flow() : it.row()).map((x) => ({ ...x, tab: it.tab, tabPanel: it.tabPanel }))
    : [it]));
  const sections = [];
  let pending = { styles: [] };
  let current = null;
  const start = (it = {}) => {
    current = {
      nodes: [], styles: [...pending.styles], id: pending.id, navTitle: pending.navTitle,
    };
    if (it.tab) {
      current.tab = it.tab;
      current.tabPanel = it.tabPanel;
    }
    pending = { styles: [] };
    sections.push(current);
    return current;
  };
  items.forEach((item) => {
    let it = item;
    // a tab panel never shares a section with other content or another panel
    if (current && current.tabPanel !== it.tabPanel) current = null;
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
    if (it.type === 'section' && it.layout && opts.flow && it.keepLayout) {
      // a row of small videos keeps its Layout in a flow; the article sets its width
      // (styles/templates.css), so no centered
      it = { ...it, styles: it.styles.filter((st) => st !== 'centered') };
    } else if (it.type === 'section' && it.layout && opts.flow) {
      // flow templates (article, press release body) keep column content in the flow;
      // their column widths come from styles/templates.css
      it = {
        type: 'default', nodes: it.nodes, tab: it.tab, tabPanel: it.tabPanel,
      };
    }
    if (it.type === 'section') {
      // explicit section (e.g. article sidebar) with its own styles
      current = null;
      const sec = start(it);
      const styles = it.centered ? ['centered', ...it.styles] : it.styles;
      styles.forEach((st) => { if (!sec.styles.includes(st)) sec.styles.push(st); });
      if (it.layout) sec.layout = it.layout;
      if (it.column) sec.column = it.column;
      sec.nodes.push(...it.nodes);
      current = null;
      return;
    }
    const centered = !!it.centered;
    // a title starts its section, except inside a tab panel (the panel keeps one section)
    const lead = !it.tab && it.startStyles ? it.startStyles : [];
    let sec;
    if (it.tab && current && !current.layout) {
      // the items of one panel share its section (centered when its first item is)
      sec = current;
    } else if (opts.flow && current && !centered && !current.centered && !lead.length) {
      sec = current;
    } else {
      sec = start(it);
      if (centered) {
        sec.centered = true;
        if (!sec.styles.includes('centered')) sec.styles.push('centered');
      }
      lead.forEach((st) => { if (!sec.styles.includes(st)) sec.styles.push(st); });
    }
    if (it.type === 'default') sec.nodes.push(...it.nodes);
    else sec.nodes.push(it.el);
    current = (opts.flow && !centered) || it.tab ? sec : null;
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
    if (s.tab) meta.Tab = s.tab;
    if (s.column) meta.Column = String(s.column);
    div.setAttribute('data-mim', JSON.stringify(meta));
    s.nodes.forEach((n) => div.append(n));
    page.append(div);
  });
  return page;
}
