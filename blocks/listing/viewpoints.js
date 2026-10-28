/*
 * Listing (viewpoints): category pages, /viewpoints/all and the live ?tag= / ?assetManager= /
 * ?author= pages (page heading and author header from the filter).
 */
import { fetchIndex, hideOnError } from '../../scripts/block-utils.js';
import {
  INDEX_URLS, normalizeEntry, applyFilters, sortItems, paginate, baseName, slugify,
} from '../../scripts/listing-core.js';
import { el } from '../../scripts/dom-utils.js';
import {
  icon, timeEl, picture, buildPagination, readMore, authorsBlock, emptyState,
} from './listing-ui.js';

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

export default function viewpoints(ctx) {
  const {
    block, root, items, config, state, pageSize, setPage, effective,
  } = ctx;
  let headerDone = false;
  return async function renderViewpoints() {
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
  };
}
