/*
 * Shared DOM pieces of the listing variants (blocks/listing/*.js): icons, dates, pictures,
 * URL state, pagination, read-more links, author lines, empty state and the sort dropdown.
 */
import { toPicture, buildAuthorInline, hideOnError } from '../../scripts/block-utils.js';
import { formatLongDate, isoDate, pageWindow } from '../../scripts/listing-core.js';
import { pageSignal } from '../../scripts/authoring.js';
import { el } from '../../scripts/dom-utils.js';
import { placeholder } from '../../scripts/placeholders.js';

export const DEFAULT_EMPTY = 'Sorry, no results match this criteria';

let ph = {};

/** Placeholders sheet for the listing labels (set once by listing.js before rendering). */
export function setPlaceholders(sheet) {
  ph = sheet || {};
}

/** Label from the placeholders sheet, else the English default; `{name}` from vars. */
export const t = (key, fallback, vars) => placeholder(ph, key, fallback, vars);

/** The block's Empty row, else the sheet's or the English no-results text. */
export const emptyText = (config) => config.empty || t('noResults', DEFAULT_EMPTY);

export const icon = (name) => el('span', { class: `listing-icon listing-icon-${name}`, 'aria-hidden': 'true' });

export function timeEl(ts) {
  return el('time', { datetime: isoDate(ts) || undefined }, formatLongDate(ts));
}

export function picture(src, alt, width) {
  if (!src) return null;
  const pic = toPicture(src, alt || '', width);
  return pic;
}

export function currentParams() {
  return new URLSearchParams(window.location.search);
}

/**
 * Writes listing state into the URL (replaceState, no reload).
 * @param {Object<string,string|string[]|null>} changes key -> value(s); null/empty removes
 */
export function updateUrl(changes) {
  const params = currentParams();
  Object.entries(changes).forEach(([key, value]) => {
    [...params.keys()].filter((k) => k.toLowerCase() === key.toLowerCase())
      .forEach((k) => params.delete(k));
    const values = (Array.isArray(value) ? value : [value]).filter((v) => v !== null && v !== undefined && v !== '');
    if (values.length) params.set(key, values.join(','));
  });
  const qs = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
}

function pageHref(page) {
  const params = currentParams();
  params.delete('page');
  if (page > 1) params.set('page', page);
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
}

export function buildPagination(result, onPage, labels = {}) {
  const { page, pages } = result;
  if (pages <= 1) return null;
  const prevLabel = labels.previous || t('previous', 'Previous');
  const nextLabel = labels.next || t('next', 'Next');
  const ul = el('ul', { class: 'listing-pagination-list' });
  const direction = (label, target, enabled) => {
    const li = el('li', { class: 'listing-pagination-item' });
    if (!enabled) {
      li.append(el('span', { class: 'listing-pagination-direction disabled', 'aria-disabled': 'true' }, label));
    } else {
      const a = el('a', { class: 'listing-pagination-direction', href: pageHref(target), 'aria-label': label }, label);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        onPage(target);
      });
      li.append(a);
    }
    return li;
  };
  ul.append(direction(prevLabel, page - 1, page > 1));
  pageWindow(page, pages).forEach((n) => {
    if (n === '…') {
      ul.append(el('li', { class: 'listing-pagination-ellipsis', 'aria-hidden': 'true' }, '…'));
      return;
    }
    const li = el('li', { class: `listing-pagination-item${n === page ? ' current' : ''}` });
    if (n === page) {
      li.append(el('span', { class: 'listing-pagination-link', 'aria-current': 'page' }, String(n)));
    } else {
      const a = el('a', { class: 'listing-pagination-link', href: pageHref(n), 'aria-label': String(n) }, String(n));
      a.addEventListener('click', (e) => {
        e.preventDefault();
        onPage(n);
      });
      li.append(a);
    }
    ul.append(li);
  });
  ul.append(direction(nextLabel, page + 1, page < pages));
  return el('nav', { class: 'listing-pagination', 'aria-label': 'Pagination' }, ul);
}

export function readMore(href, title, cls, iconName = 'arrow-right-circle') {
  return el('a', { class: cls, href, 'aria-label': t('readMoreAbout', 'Read more: {title}', { title }) }, icon(iconName), t('readMore', 'Read more'));
}

export function authorsBlock(authors) {
  const wrap = el('div', { class: 'listing-authors' });
  authors.forEach((a) => {
    const node = buildAuthorInline({
      name: a.name, title: a.title, company: a.company, image: a.image,
    }, 'listing');
    node.querySelectorAll('.listing-author-photo').forEach(hideOnError);
    wrap.append(node);
  });
  return wrap;
}

export function emptyState(config, cls = 'listing-empty') {
  return el('p', { class: cls }, emptyText(config));
}

export function scrollToBlock(block) {
  const top = block.getBoundingClientRect().top + window.scrollY - 100;
  if (block.getBoundingClientRect().top < 0) window.scrollTo({ top, behavior: 'smooth' });
}

export function dropdown(options, current, onChange, label) {
  const wrap = el('div', { class: 'listing-dropdown' });
  const currentLabel = (options.find(([v]) => v === current) || options[0])[1];
  const listId = `listing-dd-${Math.random().toString(36).slice(2, 8)}`;
  const trigger = el(
    'button',
    {
      type: 'button', class: 'listing-dropdown-trigger', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-label': `${label}: ${currentLabel}`,
    },
    el('span', { class: 'listing-dropdown-text' }, currentLabel),
    icon('arrow-down'),
  );
  // disclosure pattern: a button toggling a plain list of buttons, the current one marked
  const list = el('ul', { class: 'listing-dropdown-list', id: listId });
  list.hidden = true;
  const close = () => {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('open');
  };
  options.forEach(([value, text]) => {
    const b = el(
      'button',
      {
        type: 'button', class: 'listing-dropdown-option', ...(value === current ? { 'aria-current': 'true' } : {}),
      },
      icon('checkmark'),
      text,
    );
    b.addEventListener('click', () => {
      close();
      if (value !== current) onChange(value);
    });
    list.append(el('li', { class: `listing-dropdown-item${value === current ? ' current' : ''}` }, b));
  });
  trigger.addEventListener('click', () => {
    const open = list.hidden;
    list.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    wrap.classList.toggle('open', open);
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      trigger.focus();
    }
  });
  const outside = (e) => {
    if (!wrap.isConnected) document.removeEventListener('click', outside);
    else if (!wrap.contains(e.target)) close();
  };
  document.addEventListener('click', outside, { signal: pageSignal() });
  wrap.append(trigger, list);
  return wrap;
}
