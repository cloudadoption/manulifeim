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
 */
import {
  fetchIndex, toPicture, buildAuthorInline, hideOnError,
} from '../../scripts/block-utils.js';
import {
  INDEX_URLS, PAGE_SIZES, VARIANT_BASE, CASE_STUDY_GROUPS, RESOURCE_TYPE_LABELS,
  normalizeEntry, parseFilter, filtersFromParams, applyFilters, sortItems, paginate,
  pageWindow, groupValues, resourceType, facetCounts, formatLongDate, isoDate, baseName,
  slugify,
} from '../../scripts/listing-core.js';

const VARIANTS = ['viewpoints', 'press', 'case-studies', 'documents', 'people'];
const URL_KEYS = {
  viewpoints: ['tag', 'assetManager', 'author', 'category'],
  press: ['category'],
  'case-studies': ['theme', 'topic', 'region', 'assetClass'],
  documents: ['q', 'type', 'topic', 'audience'],
  people: [],
};
const CONFIG_KEYS = ['source', 'filter', 'limit', 'sort', 'empty', 'sidebar', 'title', 'count', 'filters'];
const DEFAULT_EMPTY = 'Sorry, no results match this criteria';
const CS_SORTS = [['newest', 'Newest'], ['oldest', 'Oldest']];

/* ---------- small DOM helpers ---------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach((c) => {
    if (c === undefined || c === null || c === false) return;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

const icon = (name) => el('span', { class: `listing-icon listing-icon-${name}`, 'aria-hidden': 'true' });

function timeEl(ts) {
  return el('time', { datetime: isoDate(ts) || undefined }, formatLongDate(ts));
}

function picture(src, alt, width) {
  if (!src) return null;
  const pic = toPicture(src, alt || '', width);
  return pic;
}

/* ---------- config / URL ---------- */

function readConfig(block) {
  const config = {};
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (!CONFIG_KEYS.includes(key) || cells.length < 2) return;
    if (key === 'sidebar') {
      [, config.sidebar] = cells;
      return;
    }
    const a = cells[1].querySelector('a[href]');
    config[key] = key === 'source' && a ? a.getAttribute('href') : cells[1].textContent.trim();
  });
  return config;
}

function currentParams() {
  return new URLSearchParams(window.location.search);
}

/**
 * Writes listing state into the URL (replaceState, no reload).
 * @param {Object<string,string|string[]|null>} changes key -> value(s); null/empty removes
 */
function updateUrl(changes) {
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

/* ---------- shared pieces ---------- */

function buildPagination(result, onPage, labels = {}) {
  const { page, pages } = result;
  if (pages <= 1) return null;
  const prevLabel = labels.previous || 'Previous';
  const nextLabel = labels.next || 'Next';
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

function readMore(href, title, cls, iconName = 'arrow-right-circle') {
  return el('a', { class: cls, href, 'aria-label': `Read more: ${title}` }, icon(iconName), 'Read more');
}

function authorsBlock(authors) {
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

function emptyState(config, cls = 'listing-empty') {
  return el('p', { class: cls }, config.empty || DEFAULT_EMPTY);
}

function scrollToBlock(block) {
  const top = block.getBoundingClientRect().top + window.scrollY - 100;
  if (block.getBoundingClientRect().top < 0) window.scrollTo({ top, behavior: 'smooth' });
}

/* ---------- viewpoints ---------- */

function viewpointItem(it) {
  const li = el('li', { class: 'listing-vp-item' });
  const img = el('div', { class: 'listing-vp-image' }, picture(it.image, it.title, '500'));
  const content = el(
    'div',
    { class: 'listing-vp-content' },
    el('h2', { class: 'listing-vp-title' }, el('a', { class: 'listing-vp-title-link', href: it.path }, it.title)),
    it.description ? el('p', { class: 'listing-vp-desc' }, it.description) : null,
    el(
      'div',
      { class: 'listing-vp-authors' },
      it.authors.length ? authorsBlock(it.authors) : null,
      it.ts ? el('p', { class: 'listing-vp-date listing-vp-date-mobile' }, timeEl(it.ts)) : null,
    ),
    readMore(it.path, it.title, 'listing-vp-link'),
  );
  const info = el(
    'div',
    { class: 'listing-vp-info' },
    it.ts ? el('p', { class: 'listing-vp-date' }, timeEl(it.ts)) : null,
    it.authors.length ? el('div', { class: 'listing-vp-info-authors' }, authorsBlock(it.authors)) : null,
  );
  li.append(img, content, info);
  return li;
}

/** Display name for a ?tag= / ?assetManager= / ?author= value from the matching items. */
function filterLabel(items, key, value) {
  const v = String(value).toLowerCase();
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (key === 'tag') {
      const idx = it.tagSlugs.findIndex((s) => s.toLowerCase() === v);
      if (idx > -1 && it.tags[idx]) return it.tags[idx];
      const t = it.tags.find((x) => slugify(x) === slugify(v));
      if (t) return t;
    }
    if (key === 'assetManager' && it.assetManager && slugify(it.assetManagerSlug) === slugify(v)) {
      return it.assetManager;
    }
  }
  return value.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function findAuthor(items, slug) {
  const v = String(slug).toLowerCase();
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i].authors.find((x) => x.slug.toLowerCase() === v
      || slugify(baseName(x.name)) === slugify(v));
    if (a) return a;
  }
  return null;
}

async function authorHeader(author) {
  const header = el('div', { class: 'listing-author-header' });
  if (author.image) {
    const photo = el('div', { class: 'listing-author-header-photo' }, picture(author.image, author.name, '200'));
    hideOnError(photo);
    header.append(photo);
  }
  const details = el(
    'div',
    { class: 'listing-author-header-details' },
    el('h2', { class: 'listing-author-header-name' }, author.name),
    author.title || author.company
      ? el('p', { class: 'listing-author-header-title' }, [author.title, author.company].filter(Boolean).join(', '))
      : null,
  );
  header.append(details);
  // bio: the person's page in the people index (authors / consultant team), matched by name
  const people = (await fetchIndex(INDEX_URLS.people)).map(normalizeEntry);
  const person = people.find((p) => slugify(baseName(p.title)) === slugify(baseName(author.name)));
  if (person && (person.bio || person.description)) {
    details.append(el('p', { class: 'listing-author-header-bio' }, person.bio || person.description));
    details.append(el('a', { class: 'listing-author-header-more', href: person.path }, 'Read bio', icon('arrow-right')));
  }
  return header;
}

function setPageHeading(block, text) {
  const h1 = document.querySelector('main h1');
  if (!h1 || block.contains(h1) || !text) return;
  if (!h1.dataset.listingOriginal) h1.dataset.listingOriginal = h1.textContent;
  h1.textContent = text;
}

/* ---------- press ---------- */

function pressItem(it) {
  return el(
    'li',
    { class: 'listing-press-item' },
    it.ts ? el('p', { class: 'listing-press-time' }, timeEl(it.ts)) : null,
    el('h2', { class: 'listing-press-title' }, el('a', { class: 'listing-press-title-link', href: it.path, title: it.title }, it.title)),
    readMore(it.path, it.title, 'listing-press-link'),
  );
}

/* ---------- case studies ---------- */

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

function dropdown(options, current, onChange, label) {
  const wrap = el('div', { class: 'listing-dropdown' });
  const currentLabel = (options.find(([v]) => v === current) || options[0])[1];
  const listId = `listing-dd-${Math.random().toString(36).slice(2, 8)}`;
  const trigger = el(
    'button',
    {
      type: 'button', class: 'listing-dropdown-trigger', 'aria-expanded': 'false', 'aria-haspopup': 'listbox', 'aria-controls': listId, 'aria-label': `${label}: ${currentLabel}`,
    },
    el('span', { class: 'listing-dropdown-text' }, currentLabel),
    icon('arrow-down'),
  );
  const list = el('ul', { class: 'listing-dropdown-list', id: listId, role: 'listbox' });
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
        type: 'button', class: 'listing-dropdown-option', role: 'option', 'aria-selected': value === current ? 'true' : 'false',
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
  document.addEventListener('click', outside);
  wrap.append(trigger, list);
  return wrap;
}

/* ---------- people ---------- */

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
      el('a', { class: 'listing-person-more', href: it.path, 'aria-label': `Read more: ${it.title}` }, 'Read more', icon('chevron-right')),
    ),
  );
}

/* ---------- controller ---------- */

async function loadItems(config, variant) {
  const source = config.source || INDEX_URLS[variant];
  let rows = await fetchIndex(source);
  let items = rows.map(normalizeEntry).filter(VARIANT_BASE[variant]);
  if (!items.length && source !== INDEX_URLS.all) {
    rows = await fetchIndex(INDEX_URLS.all);
    items = rows.map(normalizeEntry).filter(VARIANT_BASE[variant]);
  }
  return items;
}

export default async function decorate(block) {
  const variant = VARIANTS.find((v) => block.classList.contains(v)) || 'viewpoints';
  block.classList.add(variant);
  const config = readConfig(block);
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
  const sidebar = config.sidebar ? el('aside', { class: 'listing-sidebar' }, ...config.sidebar.childNodes) : null;
  // plain links in the sidebar (decorateButtons turned link-only paragraphs into buttons)
  sidebar?.querySelectorAll('.button, .button-container').forEach((n) => {
    n.classList.remove('button', 'primary', 'secondary', 'accent', 'button-container');
  });

  const root = el('div', { class: 'listing-inner', 'aria-busy': 'true' });
  block.replaceChildren(root);

  const items = await loadItems(config, variant);
  root.removeAttribute('aria-busy');
  const effective = () => ({ ...baseFilters, ...state.filters });

  const setPage = (n) => {
    state.page = n;
    updateUrl({ page: n > 1 ? n : null });
    // eslint-disable-next-line no-use-before-define
    render();
    scrollToBlock(block);
  };

  /* --- viewpoints --- */
  let headerDone = false;
  async function renderViewpoints() {
    const filtered = sortItems(applyFilters(items, effective()), state.sort);
    const result = paginate(filtered, state.page, pageSize);
    state.page = result.page;
    const parts = [];
    if (!headerDone) {
      headerDone = true;
      const f = state.filters;
      if (f.author) {
        const author = findAuthor(items, f.author[0]);
        if (author) {
          setPageHeading(block, baseName(author.name));
          root.before(await authorHeader(author));
        }
      } else if (f.tag) {
        setPageHeading(block, filterLabel(items, 'tag', f.tag[0]));
      } else if (f.assetManager) {
        setPageHeading(block, filterLabel(items, 'assetManager', f.assetManager[0]));
      }
    }
    if (config.count) {
      // live /viewpoints/all: "9 listings" (count of the filtered results, all pages)
      const n = String(filtered.length);
      const label = config.count.includes('{count}') ? config.count.replaceAll('{count}', n) : `${n} ${config.count}`;
      parts.push(el('p', { class: 'listing-vp-count', role: 'status' }, label));
    }
    if (!result.items.length) parts.push(emptyState(config, 'listing-empty listing-vp-empty'));
    else parts.push(el('ul', { class: 'listing-vp-list' }, result.items.map(viewpointItem)));
    parts.push(buildPagination(result, setPage));
    root.replaceChildren(...parts.filter(Boolean));
  }

  /* --- press --- */
  function renderPress() {
    const filtered = sortItems(applyFilters(items, effective()), state.sort);
    const result = paginate(filtered, state.page, pageSize);
    state.page = result.page;
    const main = el('div', { class: 'listing-press-main' });
    if (!result.items.length) main.append(emptyState(config));
    else main.append(el('ul', { class: 'listing-press-list' }, result.items.map(pressItem)));
    const pager = buildPagination(result, setPage);
    if (pager) main.append(pager);
    root.replaceChildren(el('div', { class: 'listing-press-layout' }, sidebar, main));
  }

  /* --- case studies --- */
  let observer;
  function renderCaseStudies() {
    const toggle = (key, value) => {
      const cur = new Set(state.filters[key] || []);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      state.filters[key] = [...cur];
      if (!state.filters[key].length) delete state.filters[key];
      state.shown = pageSize;
      updateUrl({ [key]: state.filters[key] || null });
      // eslint-disable-next-line no-use-before-define
      render();
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
        // eslint-disable-next-line no-use-before-define
        render();
      });
      tabs.append(el('li', { class: 'listing-cs-tab-item' }, b));
    });
    const clear = el('button', { type: 'button', class: `listing-cs-clear${anySelected ? ' active' : ''}`, disabled: !anySelected }, 'Clear all');
    clear.addEventListener('click', () => {
      const removed = Object.fromEntries(Object.keys(state.filters).map((k) => [k, null]));
      state.filters = {};
      state.shown = pageSize;
      updateUrl(removed);
      // eslint-disable-next-line no-use-before-define
      render();
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
          // eslint-disable-next-line no-use-before-define
          render();
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
          // eslint-disable-next-line no-use-before-define
          render();
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
  }

  /* --- documents --- */
  function renderDocuments() {
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
      // eslint-disable-next-line no-use-before-define
      render();
    });

    // type tabs with counts
    const tabs = el('ul', { class: 'listing-tabs', role: 'tablist' });
    const types = facetCounts(withoutType, (it) => resourceType(it));
    const tab = (value, label, n) => {
      const active = (value || '') === (typeFilter[0] || (baseType ? baseType[0] : ''));
      const b = el('button', {
        type: 'button', class: 'listing-tab-trigger', role: 'tab', 'aria-selected': active ? 'true' : 'false', 'aria-label': `${label} (${n}) results are currently displaying below`,
      }, `${label} (${n})`);
      b.addEventListener('click', () => {
        state.filters = { ...state.filters };
        if (value) state.filters.type = [value];
        else delete state.filters.type;
        state.page = 1;
        updateUrl({ type: value || null, page: null });
        // eslint-disable-next-line no-use-before-define
        render();
      });
      return el('li', { class: `listing-tab${active ? ' active' : ''}`, role: 'presentation' }, b);
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
      el('div', { class: 'listing-doc-filters' }, form, tabs),
      list,
      pager,
    ));
  }

  /* --- people --- */
  function renderPeople() {
    const filtered = sortItems(applyFilters(items, effective()), state.sort);
    const result = paginate(filtered, state.page, pageSize);
    const parts = [];
    if (!result.items.length) parts.push(emptyState(config));
    else parts.push(el('ul', { class: 'listing-people-list' }, result.items.map(personCard)));
    parts.push(buildPagination(result, setPage));
    root.replaceChildren(...parts.filter(Boolean));
  }

  function render() {
    if (variant === 'press') return renderPress();
    if (variant === 'case-studies') return renderCaseStudies();
    if (variant === 'documents') return renderDocuments();
    if (variant === 'people') return renderPeople();
    return renderViewpoints();
  }

  await render();
}
