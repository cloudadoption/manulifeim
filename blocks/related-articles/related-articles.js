/*
 * Related Articles block (replaces related-viewpoints in the article footer).
 *
 * DA authoring table:
 *
 * | Related Articles |
 * | Title | Related viewpoints                          (optional)               |
 * | link to an article (only)      → filled from /query-index.json             |
 * | date p / ### [Title](/viewpoints/…) / authors list / summary p (static teaser) |
 *
 * Without teaser rows, two articles sharing the page's `category` (else a tag)
 * metadata are picked from the query index (newest first, current page excluded).
 *   Authors list item: [photo] **Name**, Position <br> Company
 */
import { getMetadata } from '../../scripts/aem.js';
import {
  fetchIndex,
  indexEntryToItem,
  parseTeaserRow,
  formatDate,
  toPicture,
  hideOnError,
  toPath,
  splitList,
  sortByDateDesc,
} from '../../scripts/block-utils.js';

const LIMIT = 2;

function buildAuthor(author) {
  const wrap = document.createElement('div');
  wrap.className = 'related-articles-author';
  if (author.image) {
    const photo = document.createElement('div');
    photo.className = 'related-articles-author-photo';
    const pic = toPicture(author.image, author.name, '100');
    if (pic) photo.append(pic);
    hideOnError(photo);
    wrap.append(photo);
  }
  const text = document.createElement(author.link ? 'a' : 'div');
  text.className = 'related-articles-author-text';
  if (author.link) text.href = author.link;
  const add = (cls, value) => {
    if (!value) return;
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = value;
    text.append(span);
  };
  add('related-articles-author-name', author.title || author.company ? `${author.name}, ` : author.name);
  add('related-articles-author-position', author.title);
  add('related-articles-author-company', author.company);
  wrap.append(text);
  return wrap;
}

function buildCard(item) {
  const li = document.createElement('li');
  li.className = 'related-articles-item';
  if (item.date) {
    const p = document.createElement('p');
    p.className = 'related-articles-date';
    p.textContent = formatDate(item.date);
    li.append(p);
  }
  const h3 = document.createElement('h3');
  h3.className = 'related-articles-item-title';
  const a = document.createElement('a');
  a.href = item.path;
  a.textContent = item.title;
  h3.append(a);
  li.append(h3);
  if (item.authors && item.authors.length) {
    const authors = document.createElement('div');
    authors.className = 'related-articles-authors';
    item.authors.forEach((au) => authors.append(buildAuthor(au)));
    li.append(authors);
  }
  if (item.summary) {
    const text = document.createElement('div');
    text.className = 'related-articles-text';
    text.textContent = item.summary;
    li.append(text);
  }
  const linkWrap = document.createElement('div');
  linkWrap.className = 'related-articles-link';
  const more = document.createElement('a');
  more.className = 'related-articles-link-anchor';
  more.href = item.path;
  const span = document.createElement('span');
  span.textContent = 'Read more';
  more.append(span);
  linkWrap.append(more);
  li.append(linkWrap);
  return li;
}

export default async function decorate(block) {
  let title = 'Related viewpoints';
  const items = [];
  const lookups = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length >= 2 && key === 'title' && !cells[1].querySelector('a')) {
      title = cells[1].textContent.trim() || title;
      return;
    }
    const links = row.querySelectorAll('a[href]');
    const onlyLink = links.length === 1 && row.textContent.trim() === links[0].textContent.trim()
      && !row.querySelector('h1, h2, h3, h4, h5, h6, picture');
    if (onlyLink) {
      const href = links[0].getAttribute('href');
      const placeholder = { path: href, title: links[0].textContent.trim(), lookup: true };
      items.push(placeholder);
      lookups.push(placeholder);
      return;
    }
    const item = parseTeaserRow(row);
    if (item) items.push(item);
  });

  const inner = document.createElement('div');
  inner.className = 'related-articles-inner';
  const h2 = document.createElement('h2');
  h2.className = 'related-articles-title';
  h2.textContent = title;
  const main = document.createElement('ul');
  main.className = 'related-articles-main';
  inner.append(h2, main);
  block.replaceChildren(inner);

  let final = items;
  if (lookups.length || !items.length) {
    const index = await fetchIndex();
    lookups.forEach((ph) => {
      const entry = index.find((e) => toPath(e.path) === toPath(ph.path));
      if (entry) Object.assign(ph, indexEntryToItem(entry));
    });
    if (!items.length) {
      const here = toPath(window.location.pathname);
      const category = getMetadata('category');
      const tags = splitList(getMetadata('tags')).map((t) => t.toLowerCase());
      const candidates = index.filter((e) => toPath(e.path) !== here && e.path?.includes('/viewpoints/'));
      let picked = candidates.filter((e) => category && e.category === category);
      if (picked.length < LIMIT && tags.length) {
        const byTag = candidates.filter((e) => !picked.includes(e)
          && splitList(e.tags).some((t) => tags.includes(t.toLowerCase())));
        picked = picked.concat(byTag);
      }
      final = sortByDateDesc(picked.map(indexEntryToItem)).slice(0, LIMIT);
    }
  }
  if (!final.length) {
    block.closest('.section')?.classList.add('related-articles-empty');
    block.hidden = true;
    return;
  }
  final.forEach((item) => main.append(buildCard(item)));
}
