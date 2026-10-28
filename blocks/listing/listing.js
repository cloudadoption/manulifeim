/*
 * Listing block: index-driven lists with the live filter UI, sorting and paging.
 * Replaces .list.viewpointsList (viewpoints category pages, /viewpoints/all, and the live
 * tag / asset-manager / author pages), the press listing (pressItems + pagination), the
 * case-study list app (CaseStudyList), the resources app and the people listing.
 *
 * DA authoring table (rows optional; first cell = key):
 * | Listing (viewpoints|press|case-studies|documents|people) |                         |
 * | Source  | /institutional/tw/en/query-index-viewpoints.json  (default per variant)    |
 * | Filter  | category=fixed-income   (key=value, & separated; keys below)               |
 * | Limit   | 10                      (page size; case studies: batch size)              |
 * | Sort    | newest | oldest | title | name                                             |
 * | Empty   | Sorry, no results match this criteria                                      |
 * | Sidebar | rich text shown left of the list (press: Media relations)                  |
 * | Count   | {count} listings  (viewpoints: result count line above the list)           |
 * | Filters | on   (case studies: Topic / Theme filter bar; the TW live app shows none)  |
 *
 * URL query parameters (kept in the URL with history.replaceState):
 *   viewpoints   ?tag= ?assetManager= ?author= ?category= ?page=
 *   press        ?category= ?page=
 *   case-studies ?theme= ?topic= ?region= ?assetClass= ?sort=
 *   documents    ?q= ?type= ?topic= ?audience= ?page=
 * Pure logic lives in scripts/listing-core.js (unit tested in node).
 * Each variant renders in its own module (viewpoints.js, press.js, case-studies.js,
 * documents.js, people.js), loaded on demand; shared DOM pieces are in listing-ui.js.
 */
import { fetchIndex, readRows } from '../../scripts/block-utils.js';
import {
  INDEX_URLS, PAGE_SIZES, VARIANT_BASE, normalizeEntry, parseFilter, filtersFromParams,
} from '../../scripts/listing-core.js';
import { el } from '../../scripts/dom-utils.js';
import { fetchPlaceholders } from '../../scripts/placeholders.js';
import {
  currentParams, updateUrl, scrollToBlock, setPlaceholders,
} from './listing-ui.js';

const VARIANTS = ['viewpoints', 'press', 'case-studies', 'documents', 'people'];
const URL_KEYS = {
  viewpoints: ['tag', 'assetManager', 'author', 'category'],
  press: ['category'],
  'case-studies': ['theme', 'topic', 'region', 'assetClass'],
  documents: ['q', 'type', 'topic', 'audience'],
  people: [],
};
const CONFIG_KEYS = ['source', 'filter', 'limit', 'sort', 'empty', 'sidebar', 'title', 'count', 'filters'];

/* ---------- config ---------- */

/** Settings rows; they stay in the block (data-config) so Canvas can edit them. */
function readConfig(block) {
  const { config, cells, settings } = readRows(block, CONFIG_KEYS, { hrefKeys: ['source'] });
  delete config.sidebar;
  if (cells.sidebar) config.sidebar = cells.sidebar;
  return { config, settings };
}

async function loadItems(config, variant) {
  const rows = await fetchIndex(config.source || INDEX_URLS[variant]);
  return rows.map(normalizeEntry).filter(VARIANT_BASE[variant]);
}

export default async function decorate(block) {
  const variant = VARIANTS.find((v) => block.classList.contains(v)) || 'viewpoints';
  block.classList.add(variant);
  const { config, settings } = readConfig(block);
  const baseFilters = parseFilter(config.filter);
  const limitCfg = parseInt(config.limit, 10);
  const pageSize = Number.isFinite(limitCfg) && limitCfg >= 0 ? limitCfg : PAGE_SIZES[variant];
  const params = currentParams();
  const state = {
    filters: filtersFromParams(params, URL_KEYS[variant]),
    page: parseInt(params.get('page'), 10) || 1,
    sort: (variant === 'case-studies' && params.get('sort')) || config.sort || (variant === 'people' ? 'name' : 'newest'),
    shown: pageSize,
    openGroup: '',
  };
  // the sidebar is content: its authored nodes move into the aside (editable there in Canvas)
  const sidebar = config.sidebar ? el('aside', { class: 'listing-sidebar' }, ...config.sidebar.childNodes) : null;
  // plain links in the sidebar (decorateButtons turned link-only paragraphs into buttons)
  sidebar?.querySelectorAll('.button, .button-container').forEach((n) => {
    n.classList.remove('button', 'primary', 'secondary', 'accent', 'button-container');
  });

  const root = el('div', { class: 'listing-inner', 'aria-busy': 'true' });
  block.replaceChildren(...settings, root);

  // the variant module and the labels load while the index is fetched
  const [{ default: create }, items, ph] = await Promise.all([
    import(`./${variant}.js`),
    loadItems(config, variant),
    fetchPlaceholders(),
  ]);
  setPlaceholders(ph);
  root.removeAttribute('aria-busy');
  const ctx = {
    block, root, items, config, state, baseFilters, pageSize, sidebar,
  };
  ctx.effective = () => ({ ...baseFilters, ...state.filters });
  ctx.setPage = (n) => {
    state.page = n;
    updateUrl({ page: n > 1 ? n : null });
    ctx.render();
    scrollToBlock(block);
  };
  ctx.render = create(ctx);
  await ctx.render();
}
