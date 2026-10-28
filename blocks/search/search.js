/*
 * Search block (replaces the live Coveo Atomic search page, search hub GWAM.MIM.TW.INSTITUTIONAL).
 * Searches the site query index client-side over title, description, tags, authors and
 * category; facets, query summary, sort, results per page and pager as live.
 *
 * | Search |                                                      |
 * | Source | /institutional/tw/en/query-index.json   (optional)   |
 * | Limit  | 10                                      (optional)   |
 *
 * URL: ?q= (the header search form submits /institutional/tw/en/search?q=term), ?sort=
 * (relevance | date | az | za), ?page=, ?size= (10 | 25 | 50 | 100), ?f-<facet>=a,b
 * (facets: type, assetmgr, author, category, tags). State changes use history.replaceState.
 * Pure logic: scripts/listing-core.js (runSearch, SEARCH_FACETS), unit tested in node.
 */
import { fetchIndex } from '../../scripts/block-utils.js';
import {
  INDEX_URLS, SEARCH_FACETS, normalizeEntry, runSearch, pagerWindow, pageType,
  formatShortDate,
} from '../../scripts/listing-core.js';
import { el } from '../../scripts/dom-utils.js';

const SORTS = [
  ['relevance', 'Relevance'],
  ['date', 'Most Recent'],
  ['az', 'A-Z'],
  ['za', 'Z-A'],
];
const SORT_KEYS = {
  relevance: 'relevance', date: 'newest', az: 'title', za: 'title-desc',
};
const SIZES = [10, 25, 50, 100];
const FACET_VALUES = 8; // number-of-values on live
const COLLAPSE_AFTER = 4; // collapse-facets-after on live

const icon = (name) => el('span', { class: `search-icon search-icon-${name}`, 'aria-hidden': 'true' });
const fmt = (n) => n.toLocaleString('en-US');

function readConfig(block) {
  const config = {};
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length < 2) {
      // legacy single-cell row with the index URL
      const a = row.querySelector('a[href]');
      if (a && /query-index/.test(a.href)) config.source = new URL(a.href).pathname;
      return;
    }
    const a = cells[1].querySelector('a[href]');
    config[key] = a ? a.getAttribute('href') : cells[1].textContent.trim();
  });
  return config;
}

function readState(config) {
  const p = new URLSearchParams(window.location.search);
  const facets = {};
  SEARCH_FACETS.forEach((f) => {
    const v = p.get(`f-${f.id}`);
    if (v) facets[f.id] = v.split(',').map((x) => x.trim()).filter(Boolean);
  });
  const size = parseInt(p.get('size'), 10);
  const sort = SORT_KEYS[p.get('sort')] ? p.get('sort') : 'relevance';
  return {
    q: (p.get('q') || '').trim(),
    sort,
    page: parseInt(p.get('page'), 10) || 1,
    size: SIZES.includes(size) ? size : (parseInt(config.limit, 10) || 10),
    facets,
    expanded: {},
    more: {},
  };
}

function writeState(state, defaultSize) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  SEARCH_FACETS.forEach((f) => {
    const v = state.facets[f.id];
    if (v && v.length) p.set(`f-${f.id}`, v.join(','));
  });
  if (state.sort !== 'relevance') p.set('sort', state.sort);
  if (state.page > 1) p.set('page', state.page);
  if (state.size !== defaultSize) p.set('size', state.size);
  const qs = p.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

function resultItem(it) {
  const badges = el('div', { class: 'search-result-badges' }, el('span', { class: 'search-badge' }, pageType(it)));
  if (it.category && !/^(archive|press-releases)$/.test(it.category)) {
    badges.append(el('span', { class: 'search-badge' }, it.category));
  }
  const date = it.sortTs ? el(
    'div',
    { class: 'search-result-meta' },
    el('span', { class: 'search-result-label' }, 'Publication Date'),
    el('span', { class: 'search-result-date' }, formatShortDate(it.sortTs)),
  ) : null;
  return el(
    'li',
    { class: 'search-result' },
    badges,
    el('h2', { class: 'search-result-title' }, el('a', { href: it.path }, it.title || it.path)),
    it.description ? el('p', { class: 'search-result-excerpt' }, it.description) : null,
    date,
  );
}

export default async function decorate(block) {
  const config = readConfig(block);
  const defaultSize = parseInt(config.limit, 10) || 10;
  const state = readState(config);

  const input = el('input', {
    type: 'search', class: 'search-input', name: 'q', placeholder: 'Search', 'aria-label': 'Search', autocomplete: 'off', value: state.q,
  });
  const form = el(
    'form',
    { class: 'search-box', role: 'search', action: window.location.pathname },
    input,
    el('button', { type: 'submit', class: 'search-submit', 'aria-label': 'Search' }, icon('magnifier')),
  );
  const facetsEl = el('div', { class: 'search-facets', id: 'search-facets' });
  const toggle = el('button', {
    type: 'button', class: 'search-refine-toggle', 'aria-expanded': 'false', 'aria-controls': 'search-facets',
  }, 'Sort & Filter');
  const status = el('div', { class: 'search-status' });
  const breadbox = el('div', { class: 'search-breadbox' });
  const list = el('ul', { class: 'search-result-list' });
  const empty = el('div', { class: 'search-no-results' });
  const pagination = el('div', { class: 'search-pagination' });
  const live = el('div', { class: 'search-aria-live', 'aria-live': 'polite', role: 'status' });
  const results = el('div', { class: 'search-results' }, form, status, breadbox, list, empty, pagination, live);
  block.replaceChildren(el('div', { class: 'search-layout' }, facetsEl, el('div', { class: 'search-main' }, toggle, results)));
  block.setAttribute('aria-busy', 'true');

  toggle.addEventListener('click', () => {
    const open = !block.classList.contains('facets-open');
    block.classList.toggle('facets-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  const rows = await fetchIndex(config.source || INDEX_URLS.all);
  const all = rows.map(normalizeEntry)
    .filter((it) => it.path && !/(^|\/)(nav|footer|search)$/.test(it.path) && !it.path.includes('/fragments/'));
  block.removeAttribute('aria-busy');

  let render;
  const update = (changes, resetPage = true) => {
    Object.assign(state, changes);
    if (resetPage) state.page = 1;
    writeState(state, defaultSize);
    render();
  };

  const toggleFacet = (id, value) => {
    const cur = new Set(state.facets[id] || []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    const facets = { ...state.facets, [id]: [...cur] };
    if (!facets[id].length) delete facets[id];
    // dependent facets only apply while a page type is selected
    if (!(facets.type || []).length) {
      SEARCH_FACETS.filter((f) => f.dependent).forEach((f) => delete facets[f.id]);
    }
    update({ facets });
  };

  function renderFacets(counts) {
    facetsEl.replaceChildren();
    let shown = 0;
    SEARCH_FACETS.forEach((f) => {
      const values = counts[f.id];
      if (!values || !values.length) return;
      shown += 1;
      const selected = state.facets[f.id] || [];
      const auto = shown > COLLAPSE_AFTER;
      const collapsed = state.expanded[f.id] === undefined ? auto : !state.expanded[f.id];
      const label = el('button', { type: 'button', class: 'search-facet-label', 'aria-expanded': collapsed ? 'false' : 'true' }, f.label, icon('arrow-down'));
      label.addEventListener('click', () => {
        state.expanded[f.id] = collapsed;
        render();
      });
      const facet = el('div', { class: `search-facet${collapsed ? ' collapsed' : ''}` }, label);
      if (selected.length) {
        const clear = el('button', { type: 'button', class: 'search-facet-clear' }, `Clear filter${selected.length > 1 ? 's' : ''}`);
        clear.addEventListener('click', () => {
          const facets = { ...state.facets };
          delete facets[f.id];
          if (f.id === 'type') SEARCH_FACETS.filter((x) => x.dependent).forEach((x) => delete facets[x.id]);
          update({ facets });
        });
        facet.append(clear);
      }
      const max = state.more[f.id] ? values.length : FACET_VALUES;
      const ul = el('ul', { class: 'search-facet-values' });
      // selected values first, like Atomic
      const ordered = [...values.filter((v) => selected.includes(v.value)),
        ...values.filter((v) => !selected.includes(v.value))];
      ordered.slice(0, Math.max(max, selected.length)).forEach((v) => {
        const id = `search-${f.id}-${v.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const cb = el('input', {
          type: 'checkbox', class: 'search-facet-checkbox', id, checked: selected.includes(v.value),
        });
        cb.addEventListener('change', () => toggleFacet(f.id, v.value));
        ul.append(el(
          'li',
          { class: 'search-facet-value' },
          cb,
          el(
            'label',
            { for: id, class: 'search-facet-value-label' },
            el('span', { class: 'search-facet-value-text' }, v.value),
            el('span', { class: 'search-facet-count' }, `(${fmt(v.count)})`),
          ),
        ));
      });
      facet.append(ul);
      if (values.length > FACET_VALUES) {
        const more = el('button', { type: 'button', class: 'search-facet-more' }, state.more[f.id] ? 'Show less' : 'Show more');
        more.addEventListener('click', () => {
          state.more[f.id] = !state.more[f.id];
          render();
        });
        facet.append(more);
      }
      facetsEl.append(facet);
    });
  }

  function renderStatus(result) {
    const summary = el('p', { class: 'search-summary' });
    if (result.total) {
      summary.append('Results ', el('strong', {}, `${fmt(result.start)}-${fmt(result.end)}`), ' of ', el('strong', {}, fmt(result.total)));
      if (state.q) summary.append(' for ', el('strong', { class: 'search-query' }, state.q));
    }
    const select = el('select', { class: 'search-sort-select', id: 'search-sort' });
    SORTS.forEach(([value, text]) => select.append(el('option', { value, selected: value === state.sort }, text)));
    select.addEventListener('change', () => update({ sort: select.value }));
    const sort = el('div', { class: 'search-sort' }, el('label', { for: 'search-sort', class: 'search-sort-label' }, 'Sort by'), select);
    status.replaceChildren(summary, result.total ? sort : '');
    live.textContent = result.total ? `Results ${result.start}-${result.end} of ${fmt(result.total)}` : '';
  }

  function renderBreadbox() {
    const pills = [];
    SEARCH_FACETS.forEach((f) => (state.facets[f.id] || []).forEach((value) => {
      const b = el('button', { type: 'button', class: 'search-breadcrumb', 'aria-label': `Remove inclusion filter on ${f.label}: ${value}` }, el('span', { class: 'search-breadcrumb-value' }, value), icon('close'));
      b.addEventListener('click', () => toggleFacet(f.id, value));
      pills.push(el('li', {}, b));
    }));
    if (!pills.length) {
      breadbox.replaceChildren();
      return;
    }
    const clear = el('button', { type: 'button', class: 'search-breadbox-clear' }, 'Clear');
    clear.addEventListener('click', () => update({ facets: {} }));
    breadbox.replaceChildren(el('ul', { class: 'search-breadbox-list' }, pills, el('li', {}, clear)));
  }

  function renderPagination(result) {
    pagination.replaceChildren();
    if (!result.total) return;
    const sizes = el('div', { class: 'search-per-page' }, el('span', { class: 'search-per-page-label' }, 'Results per page'));
    const sizeList = el('ul', { class: 'search-per-page-list' });
    SIZES.forEach((n) => {
      const b = el('button', {
        type: 'button', class: `search-per-page-button${n === state.size ? ' active' : ''}`, 'aria-pressed': n === state.size ? 'true' : 'false',
      }, String(n));
      b.addEventListener('click', () => update({ size: n }));
      sizeList.append(el('li', {}, b));
    });
    sizes.append(sizeList);
    pagination.append(sizes);
    if (result.pages <= 1) return;
    const go = (n) => {
      update({ page: n }, false);
      if (block.scrollIntoView) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const pager = el('ul', { class: 'search-pager' });
    const prev = el('button', {
      type: 'button', class: 'search-pager-previous', 'aria-label': 'Previous', disabled: result.page <= 1,
    }, icon('chevron-left'));
    prev.addEventListener('click', () => go(result.page - 1));
    pager.append(el('li', {}, prev));
    pagerWindow(result.page, result.pages).forEach((n) => {
      const b = el('button', {
        type: 'button',
        class: `search-pager-page${n === result.page ? ' active' : ''}`,
        'aria-label': `Page ${n}`,
        'aria-current': n === result.page ? 'page' : undefined,
      }, String(n));
      b.addEventListener('click', () => go(n));
      pager.append(el('li', {}, b));
    });
    const next = el('button', {
      type: 'button', class: 'search-pager-next', 'aria-label': 'Next', disabled: result.page >= result.pages,
    }, icon('chevron-right'));
    next.addEventListener('click', () => go(result.page + 1));
    pager.append(el('li', {}, next));
    pagination.append(el('nav', { class: 'search-pager-nav', 'aria-label': 'Pagination' }, pager));
  }

  render = () => {
    const result = runSearch(all, {
      q: state.q,
      facets: state.facets,
      sort: SORT_KEYS[state.sort],
      page: state.page,
      size: state.size,
    });
    state.page = result.page;
    renderFacets(result.counts);
    renderStatus(result);
    renderBreadbox();
    list.replaceChildren(...result.items.map(resultItem));
    empty.replaceChildren();
    if (!result.total) {
      empty.append(
        el('h2', { class: 'search-no-results-title' }, state.q ? `We couldn't find anything for “${state.q}”` : 'No results'),
        el('p', { class: 'search-no-results-text' }, 'You may want to try using different keywords, or checking for spelling mistakes.'),
      );
    }
    renderPagination(result);
    block.classList.toggle('has-facets', !!facetsEl.children.length);
  };

  // the header search box (blocks/header) drives this page: prefill it and search in place
  const onSubmit = (e) => {
    const q = (e.target.querySelector('input[name="q"]')?.value || '').trim();
    e.preventDefault();
    input.value = q;
    document.querySelectorAll('.header-search-input').forEach((h) => { h.value = q; });
    update({ q, facets: {} });
  };
  form.addEventListener('submit', onSubmit);
  let tries = 0;
  const syncHeader = () => {
    const headerForm = document.querySelector('form.header-search-form');
    if (headerForm) {
      block.classList.add('header-search');
      headerForm.querySelectorAll('input[name="q"]').forEach((h) => { h.value = state.q; });
      if (!headerForm.dataset.searchBound) {
        headerForm.dataset.searchBound = 'true';
        headerForm.addEventListener('submit', onSubmit);
      }
      return;
    }
    tries += 1;
    if (tries < 20) setTimeout(syncHeader, 300);
  };
  syncHeader();

  render();
}
