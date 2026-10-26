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
 * | Source       | /about-us/press-releases   (optional; builds from query index)  |
 * | Limit        | 4                                                               |
 * | date p / ## Title / link "Read more"     (authored rows, used when no Source)  |
 *
 * | Cards (separate[, three]) |                                                  |
 * | image | date / ## Title / authors / text / link                                |
 */
import {
  buildAuthorInline,
  parseAuthorElement,
  looksLikeDate,
  fetchIndex,
  indexEntryToItem,
  formatDate,
  toPicture,
  toPath,
  sortByDateDesc,
} from '../../scripts/block-utils.js';

function isLinkOnly(el) {
  const a = el.querySelector('a[href]');
  return !!a && el.querySelectorAll('a[href]').length === 1
    && el.textContent.trim() === a.textContent.trim() && !el.querySelector('picture');
}

function hasOnlyPicture(cell) {
  return !!cell.querySelector('picture') && !cell.textContent.trim();
}

function makeLink(a, cls) {
  const link = document.createElement('a');
  link.href = a.getAttribute('href') || a.href;
  link.className = cls;
  if (a.target) link.target = a.target;
  if (a.title && a.title !== a.textContent.trim()) link.title = a.title;
  const span = document.createElement('span');
  span.textContent = a.textContent.trim();
  link.append(span);
  return link;
}

/**
 * Decorates the body of a teaser card (default / news / separate).
 * @param {Element} body
 */
function decorateTeaserBody(body) {
  [...body.children].forEach((el) => {
    if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
  });
  const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
  let seenHeading = false;
  [...body.children].forEach((el) => {
    if (el === heading) {
      el.classList.add('cards-title');
      seenHeading = true;
      return;
    }
    if (el.tagName === 'P' && isLinkOnly(el)) {
      const a = el.querySelector('a');
      const wrap = document.createElement('p');
      wrap.className = 'cards-link';
      wrap.append(makeLink(a, 'cards-link-anchor'));
      el.replaceWith(wrap);
      return;
    }
    if (!seenHeading && heading && el.tagName === 'P') {
      el.classList.add('cards-date');
      return;
    }
    if (!heading && el.tagName === 'P' && looksLikeDate(el.textContent)) {
      el.classList.add('cards-date');
      return;
    }
    if (seenHeading && (el.tagName === 'UL' || el.tagName === 'OL')
      && !body.querySelector('.cards-authors')) {
      const authors = document.createElement('div');
      authors.className = 'cards-authors';
      [...el.children].forEach((li) => {
        authors.append(buildAuthorInline(parseAuthorElement(li), 'cards'));
      });
      el.replaceWith(authors);
      return;
    }
    if (el.tagName === 'P' || el.tagName === 'DIV') el.classList.add('cards-text');
  });
}

/**
 * Builds a teaser card from a plain item.
 * @param {object} item {path,title,date,authors,summary,image}
 * @param {boolean} withImage
 * @returns {Element} li
 */
function buildTeaserFromItem(item, withImage = true) {
  const li = document.createElement('li');
  if (withImage && item.image) {
    const img = document.createElement('div');
    img.className = 'cards-image';
    img.append(toPicture(item.image, '', '750'));
    li.append(img);
  }
  const body = document.createElement('div');
  body.className = 'cards-body';
  if (item.date) {
    const date = document.createElement('p');
    date.className = 'cards-date';
    date.textContent = formatDate(item.date);
    body.append(date);
  }
  if (item.title) {
    const h = document.createElement('h2');
    h.className = 'cards-title';
    h.textContent = item.title;
    body.append(h);
  }
  if (item.authors && item.authors.length) {
    const authors = document.createElement('div');
    authors.className = 'cards-authors';
    item.authors.forEach((au) => authors.append(buildAuthorInline(au, 'cards')));
    body.append(authors);
  }
  if (item.summary) {
    const p = document.createElement('p');
    p.className = 'cards-text';
    p.textContent = item.summary;
    body.append(p);
  }
  const linkWrap = document.createElement('p');
  linkWrap.className = 'cards-link';
  const a = document.createElement('a');
  a.href = item.path;
  a.textContent = item.readMore || 'Read more';
  linkWrap.append(makeLink(a, 'cards-link-anchor'));
  body.append(linkWrap);
  li.append(body);
  return li;
}

/**
 * Builds a teaser li from an authored row.
 * @param {Element} row
 * @returns {Element|{autofill:string}} li or an auto-fill marker
 */
function buildTeaser(row, withImage = true) {
  const cells = [...row.children];
  const li = document.createElement('li');
  const body = document.createElement('div');
  body.className = 'cards-body';
  let image = null;
  cells.forEach((cell) => {
    if (hasOnlyPicture(cell) && !image) {
      image = document.createElement('div');
      image.className = 'cards-image';
      image.append(cell.querySelector('picture'));
    } else {
      body.append(...cell.childNodes);
    }
  });
  // a picture inside the body (single-cell row) becomes the image
  if (!image) {
    const first = body.firstElementChild;
    if (first && first.querySelector('picture') && !first.textContent.trim()) {
      image = document.createElement('div');
      image.className = 'cards-image';
      image.append(first.querySelector('picture'));
      first.remove();
    }
  }
  // auto-fill: the row only holds a link
  const els = [...body.children];
  if (!image && els.length === 1 && isLinkOnly(els[0]) && !body.querySelector('h1, h2, h3, h4, h5, h6')) {
    return { autofill: els[0].querySelector('a').getAttribute('href') };
  }
  if (image && withImage) li.append(image);
  decorateTeaserBody(body);
  li.append(body);
  return li;
}

/**
 * Decorates a tile (infoContainer__tile).
 * @param {Element} row
 * @returns {Element} li
 */
function buildTile(row) {
  const li = document.createElement('li');
  li.className = 'cards-tile';
  [...row.children].forEach((cell) => {
    if (hasOnlyPicture(cell)) {
      const pic = cell.querySelector('picture');
      pic.classList.add('cards-tile-image');
      li.append(pic);
    } else {
      li.append(...cell.childNodes);
    }
  });
  [...li.children].forEach((el) => {
    if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) {
      el.remove();
      return;
    }
    if (el.tagName === 'P' && el.querySelector('picture') && !el.textContent.trim()) {
      const pic = el.querySelector('picture');
      pic.classList.add('cards-tile-image');
      el.replaceWith(pic);
      return;
    }
    if (el.tagName === 'P' && isLinkOnly(el)) {
      el.replaceWith(makeLink(el.querySelector('a'), 'cards-tile-link'));
    }
  });
  return li;
}

async function autofillTeasers(ul, markers) {
  const index = await fetchIndex();
  markers.forEach(({ li, href }) => {
    const path = toPath(href);
    const entry = index.find((e) => toPath(e.path) === path);
    if (entry) {
      li.replaceWith(buildTeaserFromItem(indexEntryToItem(entry)));
    } else {
      // keep a minimal card with the link
      li.replaceWith(buildTeaserFromItem({ path: href, title: '' }));
    }
  });
}

function setColumns(block, ul, count) {
  ul.classList.add(`cols-${count}`);
  block.dataset.columns = count;
}

export default async function decorate(block) {
  const cl = block.classList;
  const rows = [...block.children];
  const ul = document.createElement('ul');
  ul.className = 'cards-list';

  if (cl.contains('tiles')) {
    rows.forEach((row) => ul.append(buildTile(row)));
    let cols = 2;
    if (cl.contains('one')) cols = 1;
    else if (cl.contains('three')) cols = 3;
    else if (cl.contains('four')) cols = 4;
    setColumns(block, ul, cols);
    block.replaceChildren(ul);
    return;
  }

  if (cl.contains('news')) {
    const config = {};
    const authored = [];
    rows.forEach((row) => {
      const cells = [...row.children];
      const key = cells[0]?.textContent.trim().toLowerCase();
      if (cells.length >= 2 && ['source', 'limit'].includes(key)) {
        const a = cells[1].querySelector('a');
        config[key] = a ? a.getAttribute('href') : cells[1].textContent.trim();
      } else {
        authored.push(row);
      }
    });
    setColumns(block, ul, 2);
    block.replaceChildren(ul);
    if (config.source && !authored.length) {
      const limit = parseInt(config.limit, 10) || 4;
      const base = toPath(config.source);
      const index = await fetchIndex();
      const items = sortByDateDesc(index
        .filter((e) => toPath(e.path).startsWith(`${base}/`))
        .map(indexEntryToItem)).slice(0, limit);
      items.forEach((item) => ul.append(buildTeaserFromItem(item, false)));
    } else {
      authored.forEach((row) => {
        const li = buildTeaser(row, false);
        if (li.autofill) {
          const tmp = document.createElement('li');
          ul.append(tmp);
          autofillTeasers(ul, [{ li: tmp, href: li.autofill }]);
        } else ul.append(li);
      });
    }
    return;
  }

  // default image cards and separate cards
  const markers = [];
  rows.forEach((row) => {
    const li = buildTeaser(row);
    if (li.autofill) {
      const tmp = document.createElement('li');
      ul.append(tmp);
      markers.push({ li: tmp, href: li.autofill });
    } else {
      ul.append(li);
    }
  });

  let cols;
  if (cl.contains('separate')) {
    cols = cl.contains('three') ? 3 : 2;
  } else if (cl.contains('two') || cl.contains('four')) {
    cols = 2;
  } else {
    cols = Math.max(1, Math.min(rows.length, 3));
  }
  setColumns(block, ul, cols);
  block.replaceChildren(ul);
  if (markers.length) await autofillTeasers(ul, markers);
}
