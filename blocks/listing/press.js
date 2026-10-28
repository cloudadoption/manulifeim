/* Listing (press): press releases with the Media relations sidebar and pages. */
import { applyFilters, sortItems, paginate } from '../../scripts/listing-core.js';
import { el } from '../../scripts/dom-utils.js';
import {
  timeEl, buildPagination, readMore, emptyState,
} from './listing-ui.js';

function pressItem(it) {
  return el(
    'li',
    { class: 'listing-press-item' },
    it.ts ? el('p', { class: 'listing-press-time' }, timeEl(it.ts)) : null,
    el('h2', { class: 'listing-press-title' }, el('a', { class: 'listing-press-title-link', href: it.path, title: it.title }, it.title)),
    readMore(it.path, it.title, 'listing-press-link'),
  );
}

export default function press(ctx) {
  const {
    root, items, config, state, pageSize, setPage, effective, sidebar,
  } = ctx;
  return function renderPress() {
    const filtered = sortItems(applyFilters(items, effective()), state.sort);
    const result = paginate(filtered, state.page, pageSize);
    state.page = result.page;
    const main = el('div', { class: 'listing-press-main' });
    if (!result.items.length) main.append(emptyState(config));
    else main.append(el('ul', { class: 'listing-press-list' }, result.items.map(pressItem)));
    const pager = buildPagination(result, setPage);
    if (pager) main.append(pager);
    root.replaceChildren(el('div', { class: 'listing-press-layout' }, sidebar, main));
  };
}
