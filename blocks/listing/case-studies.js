/*
 * Listing (case-studies): the live CaseStudyList app. Topic / Theme filter bar (Filters row),
 * sort dropdown, result count and batches loaded on scroll.
 */
import {
  CASE_STUDY_GROUPS, applyFilters, sortItems, groupValues,
} from '../../scripts/listing-core.js';
import { el } from '../../scripts/dom-utils.js';
import {
  icon, picture, updateUrl, emptyState, dropdown,
} from './listing-ui.js';

const CS_SORTS = [['newest', 'Newest'], ['oldest', 'Oldest']];

function caseStudyCard(it, onPill) {
  const pills = el('ul', { class: 'listing-cs-pills', 'aria-label': 'Tags' });
  it.tags.forEach((tag, i) => {
    const id = it.tagSlugs.length === it.tags.length ? it.tagSlugs[i] : '';
    const [group, slug] = id.includes('/') ? id.split('/') : ['', ''];
    const def = CASE_STUDY_GROUPS.find((g) => g.group === group);
    const pill = el('button', { type: 'button', class: 'listing-cs-pill' }, tag);
    if (def) pill.addEventListener('click', () => onPill(def.key, slug));
    else pill.disabled = true;
    pills.append(el('li', { class: 'listing-cs-pill-item' }, pill));
  });
  const img = picture(it.image, '', '750');
  if (img) img.classList.add('listing-cs-image');
  return el(
    'article',
    { class: 'listing-cs-card' },
    img,
    el(
      'div',
      { class: 'listing-cs-card-content' },
      el('h3', { class: 'listing-cs-title' }, el('a', { href: it.path }, it.title)),
      it.tags.length ? pills : null,
      el('a', { class: 'listing-cs-more', href: it.path, 'aria-label': `Read more: ${it.title}` }, 'Read more', icon('arrow-right')),
    ),
  );
}

export default function caseStudies(ctx) {
  const {
    root, items, config, state, pageSize, baseFilters, effective,
  } = ctx;
  let observer;
  return function renderCaseStudies() {
    const toggle = (key, value) => {
      const cur = new Set(state.filters[key] || []);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      state.filters[key] = [...cur];
      if (!state.filters[key].length) delete state.filters[key];
      state.shown = pageSize;
      updateUrl({ [key]: state.filters[key] || null });
      ctx.render();
    };
    const pool = applyFilters(items, baseFilters);
    const filtered = sortItems(applyFilters(items, effective()), state.sort);

    // filters bar (tabs per tag group, checkbox panel, selected pills, clear all)
    const groups = CASE_STUDY_GROUPS.map((g) => ({ ...g, values: groupValues(pool, g.group) }))
      .filter((g) => g.values.length);
    const anySelected = Object.keys(state.filters).length > 0;
    const tabs = el('ul', { class: 'listing-cs-tabs' });
    groups.forEach((g) => {
      const open = state.openGroup === g.group;
      const b = el(
        'button',
        {
          type: 'button', class: `listing-cs-tab${open ? ' active' : ''}`, 'aria-expanded': open ? 'true' : 'false',
        },
        g.label,
        icon('arrow-down'),
      );
      b.addEventListener('click', () => {
        state.openGroup = open ? '' : g.group;
        ctx.render();
      });
      tabs.append(el('li', { class: 'listing-cs-tab-item' }, b));
    });
    const clear = el('button', { type: 'button', class: `listing-cs-clear${anySelected ? ' active' : ''}`, disabled: !anySelected }, 'Clear all');
    clear.addEventListener('click', () => {
      const removed = Object.fromEntries(Object.keys(state.filters).map((k) => [k, null]));
      state.filters = {};
      state.shown = pageSize;
      updateUrl(removed);
      ctx.render();
    });
    tabs.append(el('li', { class: 'listing-cs-tab-item listing-cs-tab-clear' }, clear));
    const filterBar = el('div', { class: 'listing-cs-filters' }, tabs);
    const openGroup = groups.find((g) => g.group === state.openGroup);
    if (openGroup) {
      const list = el('ul', { class: 'listing-cs-options' });
      openGroup.values.forEach((v) => {
        const checked = (state.filters[openGroup.key] || []).includes(v.value);
        const input = el('input', {
          type: 'checkbox', class: 'listing-cs-input', id: `cs-${openGroup.group}-${v.value}`, checked,
        });
        input.addEventListener('change', () => toggle(openGroup.key, v.value));
        list.append(el(
          'li',
          { class: 'listing-cs-option' },
          input,
          el('label', { class: 'listing-cs-label', for: input.id }, icon('checkmark'), v.label),
        ));
      });
      filterBar.append(el(
        'div',
        { class: 'listing-cs-panel' },
        el('p', { class: 'listing-cs-caption' }, `Filter by ${openGroup.label.toLowerCase()}`),
        list,
      ));
    }
    if (anySelected) {
      const pills = el('ul', { class: 'listing-cs-selection-pills', 'aria-label': 'Applied filters' });
      groups.forEach((g) => (state.filters[g.key] || []).forEach((value) => {
        const { label } = g.values.find((v) => v.value === value) || { label: value };
        const b = el('button', { type: 'button', class: 'listing-cs-pill', 'aria-label': `${label} (click to remove)` }, label, icon('close'));
        b.addEventListener('click', () => toggle(g.key, value));
        pills.append(el('li', { class: 'listing-cs-pill-item' }, b));
      }));
      filterBar.append(el('div', { class: 'listing-cs-selection' }, pills));
    }

    // sorter
    const count = filtered.length;
    const sorter = el(
      'div',
      { class: 'listing-cs-sorter' },
      el('h2', { class: 'listing-cs-count' }, `${count} ${count === 1 ? 'result matches' : 'results match'} your search`),
      el(
        'div',
        { class: 'listing-cs-sort' },
        el('span', { class: 'listing-cs-sort-caption' }, 'Sort by:'),
        dropdown(CS_SORTS, state.sort, (value) => {
          state.sort = value;
          state.shown = pageSize;
          updateUrl({ sort: value === 'newest' ? null : value });
          ctx.render();
        }, 'Select'),
      ),
    );

    // results + progressive loading (live loads the next batch on scroll)
    const visible = pageSize > 0 ? filtered.slice(0, state.shown) : filtered;
    const results = el('div', { class: 'listing-cs-results' });
    if (!filtered.length) {
      results.append(emptyState(config));
    } else {
      results.append(el('div', { class: 'listing-cs-articles' }, visible.map((it) => caseStudyCard(it, toggle))));
      if (visible.length < filtered.length) {
        const more = el('button', { type: 'button', class: 'listing-cs-load-more' }, 'Load more');
        const loadMore = () => {
          state.shown += pageSize;
          ctx.render();
        };
        more.addEventListener('click', loadMore);
        results.append(more);
        if (observer) observer.disconnect();
        if ('IntersectionObserver' in window) {
          observer = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
              observer.disconnect();
              loadMore();
            }
          }, { rootMargin: '200px' });
          observer.observe(more);
        }
      } else {
        results.append(el(
          'div',
          { class: 'listing-cs-end' },
          el('p', { class: 'listing-cs-end-title' }, 'You’ve reached the end'),
          el('p', { class: 'listing-cs-end-caption' }, `Showing all ${count} results`),
        ));
      }
    }
    const showFilters = /^(on|yes|true|show)$/i.test(String(config.filters || '').trim());
    root.replaceChildren(...(showFilters ? [filterBar] : []), sorter, results);
  };
}
