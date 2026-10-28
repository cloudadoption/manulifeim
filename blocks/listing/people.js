/*
 * Listing (people): person cards from the people index. No DA page uses it yet; kept until the
 * live capture is complete, then revisited (docs/DECISIONS.md ADR-002).
 */
import { applyFilters, sortItems, paginate } from '../../scripts/listing-core.js';
import { el } from '../../scripts/dom-utils.js';
import {
  icon, picture, buildPagination, emptyState, t,
} from './listing-ui.js';

function personCard(it) {
  const img = picture(it.image, it.title, '200');
  return el(
    'li',
    { class: 'listing-person' },
    el(
      'div',
      { class: 'listing-person-content' },
      img ? el('div', { class: 'listing-person-image' }, img) : null,
      el('h3', { class: 'listing-person-name' }, it.title),
      it.position ? el('p', { class: 'listing-person-position' }, it.position) : null,
    ),
    el(
      'div',
      { class: 'listing-person-footer' },
      el('a', { class: 'listing-person-more', href: it.path, 'aria-label': t('readMoreAbout', 'Read more: {title}', { title: it.title }) }, t('readMore', 'Read more'), icon('chevron-right')),
    ),
  );
}

export default function people(ctx) {
  const {
    root, items, config, state, pageSize, setPage, effective,
  } = ctx;
  return function renderPeople() {
    const filtered = sortItems(applyFilters(items, effective()), state.sort);
    const result = paginate(filtered, state.page, pageSize);
    const parts = [];
    if (!result.items.length) parts.push(emptyState(config));
    else parts.push(el('ul', { class: 'listing-people-list' }, result.items.map(personCard)));
    parts.push(buildPagination(result, setPage));
    root.replaceChildren(...parts.filter(Boolean));
  };
}
