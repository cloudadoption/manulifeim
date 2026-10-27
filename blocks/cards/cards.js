/*
 * Cards block (replaces articleGroup / article-kicker, infoContainer, latest-news,
 * caseStudyResults).
 *
 * DA authoring tables:
 *
 * | Cards[ (two|four)] |                                                         |
 * | image | (opt) date p / ## Title / (opt) list of authors / text p / link "Read more" |
 * | link to an article (only) → auto-filled from /query-index.json                  |
 *   Authors list item: [photo] **Name, CFA**, Position <br> Company
 *
 * | Cards (tiles[, one|two|three|four][, overlap][, facts]) |                    |
 * | (opt) image | ## Title / p / (opt) link "Learn more"                           |
 *
 * | Cards (news) |                                                               |
 * | Source       | /about-us/press-releases   (optional; newest index entries)     |
 * | Limit        | 4                                                               |
 * | date p / ## Title / link "Read more"     (authored rows: shown without Source,  |
 * |                                           or as fallback when the index is empty) |
 *
 * | Cards (separate[, three]) |                                                  |
 * | image | date / ## Title / authors / text / link                                |
 *
 * Each row becomes a list item holding its authored cells, classed cards-card-image /
 * cards-card-body (Canvas edits them in place); CSS styles date, title, authors, text and
 * link by tag and position. Source / Limit rows stay as data-config rows. Cards built from
 * the index (Source, link-only rows) use the same markup; in Canvas the authored rows stay.
 */
import isAuthoring from '../../scripts/authoring.js';
import {
  isMediaCell,
  fetchIndex,
  indexEntryToItem,
  formatDate,
  toPicture,
  toPath,
  sortByDateDesc,
} from '../../scripts/block-utils.js';

function el(tag, className, ...children) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children.filter((c) => c !== null && c !== undefined && c !== ''));
  return e;
}

/** A row that only holds one link (auto-filled from the index). */
function linkOnlyRow(row) {
  const links = row.querySelectorAll('a[href]');
  return links.length === 1 && !row.querySelector('picture, h1, h2, h3, h4, h5, h6')
    && row.textContent.trim() === links[0].textContent.trim() ? links[0] : null;
}

/** Moves the row's cells into a new list item, classed as image or body. */
function itemFromRow(row, tile) {
  const li = el('li', tile ? 'cards-tile' : '');
  [...row.children].forEach((cell) => {
    cell.classList.add(isMediaCell(cell) ? 'cards-card-image' : 'cards-card-body');
    [...cell.children].forEach((c) => {
      if (c.tagName === 'P' && !c.textContent.trim() && !c.querySelector('picture')) c.remove();
    });
    li.append(cell);
  });
  return li;
}

/**
 * Author lines (published pages only): the company after the <br> gets its own colour
 * like live, and a broken photo collapses.
 */
function decorateAuthors(li) {
  li.querySelectorAll('.cards-card-body > :is(ul, ol) > li').forEach((author) => {
    author.querySelectorAll('br').forEach((br) => {
      const company = el('span', 'cards-author-company');
      while (br.nextSibling) company.append(br.nextSibling);
      if (company.textContent.trim()) br.after(company);
    });
    author.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => img.closest('p, picture')?.classList.add('image-hidden'));
    });
  });
}

/**
 * Author line for an index item (generated, so it can use live's spans): photo /
 * "Name, " position / company on its own line.
 */
function authorItem(author) {
  const li = el('li');
  const pic = author.image ? toPicture(author.image, author.name || '', '100') : null;
  if (pic) li.append(el('p', '', pic));
  const name = author.title || author.company ? `${author.name},\u00a0` : author.name;
  li.append(el(
    'p',
    'cards-author-text',
    el('span', 'cards-author-name', name || ''),
    author.title ? el('span', 'cards-author-position', author.title) : null,
    author.company ? el('span', 'cards-author-company', author.company) : null,
  ));
  return li;
}

/** Card from an index item, same markup as an authored card. */
function itemFromIndex(item, withImage = true) {
  const li = el('li');
  if (withImage && item.image) li.append(el('div', 'cards-card-image', toPicture(item.image, '', '750')));
  const body = el('div', 'cards-card-body');
  if (item.date) body.append(el('p', '', formatDate(item.date)));
  if (item.title) body.append(el('h2', '', item.title));
  if (item.authors && item.authors.length) body.append(el('ul', '', ...item.authors.map(authorItem)));
  if (item.summary) body.append(el('p', '', item.summary));
  const a = el('a', 'link-cta', item.readMore || 'Read more');
  a.href = item.path;
  body.append(el('p', 'link-cta-wrapper', a));
  li.append(body);
  decorateAuthors(li);
  return li;
}

async function autofill(markers) {
  const index = await fetchIndex();
  markers.forEach(({ li, href }) => {
    const path = toPath(href);
    const entry = index.find((e) => toPath(e.path) === path);
    li.replaceWith(itemFromIndex(entry ? indexEntryToItem(entry) : { path: href, title: '' }));
  });
}

function setColumns(block, ul, count) {
  ul.classList.add(`cols-${count}`);
  block.dataset.columns = count;
}

export default async function decorate(block) {
  const cl = block.classList;
  const authoring = isAuthoring();
  const ul = el('ul', 'cards-list');
  const config = {};
  const rows = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (cl.contains('news') && cells.length >= 2 && ['source', 'limit'].includes(key)) {
      const a = cells[1].querySelector('a');
      config[key] = a ? a.getAttribute('href') : cells[1].textContent.trim();
      row.dataset.config = key;
      return;
    }
    rows.push(row);
  });

  const tiles = cl.contains('tiles');
  const markers = [];
  rows.forEach((row) => {
    const link = !tiles && !authoring ? linkOnlyRow(row) : null;
    if (link) {
      const li = el('li');
      markers.push({ li, href: link.getAttribute('href') });
      ul.append(li);
      row.remove();
      return;
    }
    const li = itemFromRow(row, tiles);
    if (!tiles && !authoring) decorateAuthors(li);
    ul.append(li);
    row.remove();
  });

  let cols;
  if (tiles) {
    cols = 2;
    if (cl.contains('one')) cols = 1;
    else if (cl.contains('three')) cols = 3;
    else if (cl.contains('four')) cols = 4;
  } else if (cl.contains('news')) {
    cols = 2;
  } else if (cl.contains('separate')) {
    cols = cl.contains('three') ? 3 : 2;
  } else if (cl.contains('two') || cl.contains('four')) {
    cols = 2;
  } else {
    cols = Math.max(1, Math.min(rows.length, 3));
  }
  setColumns(block, ul, cols);
  block.append(ul);

  if (cl.contains('news') && config.source && !authoring) {
    // "latest N" (live latest-news): newest index entries under the Source path, date,
    // title and link only; the authored rows are the fallback
    const limit = parseInt(config.limit, 10) || 4;
    const base = toPath(config.source);
    const index = await fetchIndex();
    const latest = sortByDateDesc(index
      .filter((e) => toPath(e.path).startsWith(`${base}/`))
      .map(indexEntryToItem)).slice(0, limit);
    if (latest.length) ul.replaceChildren(...latest.map((item) => itemFromIndex({ ...item, summary: '' }, false)));
  }
  if (markers.length) await autofill(markers);
}
