/* Listing (documents): resources search form, type toggles with counts and pages. */
import {
  RESOURCE_TYPE_LABELS, applyFilters, sortItems, paginate, resourceType, facetCounts, slugify,
} from '../../scripts/listing-core.js';
import { el } from '../../scripts/dom-utils.js';
import {
  icon, updateUrl, buildPagination, DEFAULT_EMPTY,
} from './listing-ui.js';

export default function documents(ctx) {
  const {
    root, items, config, state, pageSize, setPage, effective, baseFilters,
  } = ctx;
  return function renderDocuments() {
    const f = effective();
    const typeFilter = state.filters.type || [];
    const baseType = baseFilters.type;
    const rest = { ...f };
    delete rest.type;
    const withoutType = applyFilters(items, { ...rest, type: baseFilters.type });
    const byType = typeFilter.length ? { type: typeFilter } : {};
    const filtered = sortItems(applyFilters(withoutType, byType), state.sort);
    const result = paginate(filtered, state.page, pageSize);
    state.page = result.page;
    const pool = applyFilters(items, baseFilters);
    const topics = facetCounts(pool, (it) => it.topics).map((x) => x.value);
    const audiences = facetCounts(pool, (it) => it.audiences).map((x) => x.value);

    const typeLabel = typeFilter.length ? (RESOURCE_TYPE_LABELS[typeFilter[0]] || typeFilter[0]) : 'All Types';
    const search = el('input', {
      id: 'listing-doc-search', type: 'text', class: 'listing-doc-search', placeholder: `Search ${typeLabel}`, value: (state.filters.q || []).join(' '),
    });
    const select = (id, label, values, current) => {
      const s = el('select', { id, class: 'listing-doc-select' }, el('option', { value: '' }, 'All'));
      values.forEach((v) => s.append(el('option', { value: slugify(v), selected: current === slugify(v) }, v)));
      return el('div', { class: 'listing-doc-section' }, el('label', { class: 'listing-doc-label', for: id }, label), s);
    };
    const topicSel = select('listing-doc-topics', 'All Topics', topics, (state.filters.topic || [])[0]);
    const audSel = select('listing-doc-audiences', 'All Audiences', audiences, (state.filters.audience || [])[0]);
    const form = el(
      'form',
      { class: 'listing-doc-form', 'aria-label': 'Resource search form' },
      el(
        'div',
        { class: 'listing-doc-section wide' },
        el('div', { class: 'listing-doc-search-wrap' }, icon('magnifier'), el('label', { class: 'listing-doc-label', for: search.id }, 'Search'), search),
      ),
      topicSel,
      audSel,
      el('div', { class: 'listing-doc-section small' }, el('button', { type: 'submit', class: 'listing-doc-submit' }, 'Submit')),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = search.value.trim();
      const topic = topicSel.querySelector('select').value;
      const audience = audSel.querySelector('select').value;
      state.filters = { ...state.filters };
      ['q', 'topic', 'audience'].forEach((k) => delete state.filters[k]);
      if (q) state.filters.q = [q];
      if (topic) state.filters.topic = [topic];
      if (audience) state.filters.audience = [audience];
      state.page = 1;
      updateUrl({
        q: q || null, topic: topic || null, audience: audience || null, page: null,
      });
      ctx.render();
    });

    // type tabs with counts
    // toggle buttons filtering one result list (not tabs)
    const tabs = el('ul', { class: 'listing-tabs' });
    const types = facetCounts(withoutType, (it) => resourceType(it));
    const tab = (value, label, n) => {
      const active = (value || '') === (typeFilter[0] || (baseType ? baseType[0] : ''));
      const b = el('button', {
        type: 'button', class: 'listing-tab-trigger', 'aria-pressed': active ? 'true' : 'false',
      }, `${label} (${n})`);
      b.addEventListener('click', () => {
        state.filters = { ...state.filters };
        if (value) state.filters.type = [value];
        else delete state.filters.type;
        state.page = 1;
        updateUrl({ type: value || null, page: null });
        ctx.render();
      });
      return el('li', { class: `listing-tab${active ? ' active' : ''}` }, b);
    };
    tabs.append(tab('', 'All Types', withoutType.length));
    const typeName = (t) => RESOURCE_TYPE_LABELS[t] || t;
    types.forEach((t) => tabs.append(tab(t.value, typeName(t.value), t.count)));
    if (baseType) {
      // a page fixed to one type (documents / fact sheets) shows only that tab
      tabs.replaceChildren(tab(baseType[0], typeName(baseType[0]), withoutType.length));
    }

    const list = el('div', { class: 'listing-doc-results' });
    if (!result.items.length) list.append(el('h3', { class: 'listing-doc-empty' }, config.empty || DEFAULT_EMPTY));
    else {
      list.append(el('ul', { class: 'listing-doc-list' }, result.items.map((it) => el(
        'li',
        { class: 'listing-doc-item' },
        el(
          'div',
          { class: 'listing-doc-content' },
          el('a', { class: 'listing-doc-title', href: it.path }, it.title),
          it.description ? el('p', { class: 'listing-doc-desc' }, it.description) : null,
        ),
        el(
          'div',
          { class: 'listing-doc-action' },
          el('a', { class: 'listing-doc-link', href: it.documentUrl || it.path }, 'View document'),
        ),
      ))));
    }
    const pager = buildPagination(result, setPage);
    root.replaceChildren(el(
      'div',
      { class: 'listing-doc-inner' },
      el('div', { class: 'listing-doc-filters' }, form, el('div', { role: 'group', 'aria-label': 'Filter by type' }, tabs)),
      list,
      pager,
    ));
  };
}
