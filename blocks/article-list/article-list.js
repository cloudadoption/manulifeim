/*
 * Article List block (replaces latestViewpoints / LatestViewpointsV3).
 *
 * DA authoring table: optional key/value config rows, then one row per teaser.
 *
 * | Article List |                                                              |
 * | Title        | Latest viewpoints                         (optional header)  |
 * | Link         | link "All viewpoints" → /viewpoints/all  (optional)          |
 * | Limit        | 3                                         (optional)         |
 * | View         | list (default) / card                                        |
 * | image        | date p / ### [Title](/viewpoints/…) / authors list / summary p |
 *
 *   Authors list item: [photo] **Name, CFA**, Position <br> Company
 *   (`Filter` / `Source` rows are reserved for the query-index feed; renderItems()
 *   takes plain objects {path,title,date,authors:[{name,title,company,image}],summary,image}.)
 */
import {
  buildAuthorInline,
  formatDate,
  parseDate,
  toPicture,
  parseTeaserRow,
} from '../../scripts/block-utils.js';

const CONFIG_KEYS = ['title', 'link', 'limit', 'filter', 'view', 'source', 'sort'];

/**
 * Renders teaser items into a list.
 * @param {object[]} items {path,title,date,authors:[{name,title,company,image}],summary,image}
 * @returns {HTMLUListElement}
 */
export function renderItems(items) {
  const ul = document.createElement('ul');
  ul.className = 'article-list-list';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'article-list-item';

    if (item.image) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'article-list-image';
      const pic = toPicture(item.image, '', '500');
      if (pic) imgWrap.append(pic);
      li.append(imgWrap);
    }

    const content = document.createElement('div');
    content.className = 'article-list-content';
    if (item.date) {
      const date = document.createElement('p');
      date.className = 'article-list-date';
      const time = document.createElement('time');
      const d = parseDate(item.date);
      if (d) {
        const pad = (n) => String(n).padStart(2, '0');
        time.dateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
      time.textContent = formatDate(item.date);
      date.append(time);
      content.append(date);
    }
    const h3 = document.createElement('h3');
    h3.className = 'article-list-title';
    if (item.path) {
      const a = document.createElement('a');
      a.href = item.path;
      a.className = 'article-list-title-link';
      a.textContent = item.title;
      h3.append(a);
    } else {
      h3.textContent = item.title;
    }
    content.append(h3);

    if (item.authors && item.authors.length) {
      const authors = document.createElement('div');
      authors.className = 'article-list-authors';
      item.authors.forEach((author) => authors.append(buildAuthorInline(author, 'article-list')));
      content.append(authors);
    }
    if (item.summary) {
      const desc = document.createElement('div');
      desc.className = 'article-list-description';
      desc.textContent = item.summary;
      content.append(desc);
    }
    li.append(content);
    ul.append(li);
  });
  return ul;
}

function buildHeader(config, getList) {
  const header = document.createElement('div');
  header.className = 'article-list-header';
  const text = document.createElement('div');
  text.className = 'article-list-header-text';
  text.textContent = config.title || '';
  header.append(text);

  if (config.link) {
    const viewAll = document.createElement('div');
    viewAll.className = 'article-list-view-all';
    const a = document.createElement('a');
    a.href = config.link.href;
    a.textContent = config.link.text;
    const icon = document.createElement('span');
    icon.className = 'article-list-view-all-icon';
    icon.setAttribute('aria-hidden', 'true');
    viewAll.append(a, icon);
    header.append(viewAll);
  }

  const controls = document.createElement('div');
  controls.className = 'article-list-controls';
  const mk = (view, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `article-list-control article-list-control-${view}`;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.dataset.view = view;
    const i = document.createElement('span');
    i.className = 'article-list-control-icon';
    i.setAttribute('aria-hidden', 'true');
    b.append(i);
    return b;
  };
  const card = mk('card', 'Grid view');
  const list = mk('list', 'List view');
  controls.append(card, list);
  const setView = (view) => {
    const ul = getList();
    if (ul) ul.classList.toggle('article-list-list-card', view === 'card');
    card.classList.toggle('active', view === 'card');
    list.classList.toggle('active', view !== 'card');
    card.setAttribute('aria-pressed', view === 'card' ? 'true' : 'false');
    list.setAttribute('aria-pressed', view !== 'card' ? 'true' : 'false');
  };
  card.addEventListener('click', () => setView('card'));
  list.addEventListener('click', () => setView('list'));
  header.append(controls);
  return { header, setView };
}

export default function decorate(block) {
  const config = {};
  const items = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length >= 2 && CONFIG_KEYS.includes(key) && !cells[0].querySelector('picture')) {
      const a = cells[1].querySelector('a[href]');
      if (key === 'link' && a) config.link = { href: a.getAttribute('href'), text: a.textContent.trim() };
      else config[key] = cells[1].textContent.trim();
      return;
    }
    const item = parseTeaserRow(row);
    if (item) items.push(item);
  });

  const limit = parseInt(config.limit, 10);
  const shown = limit > 0 ? items.slice(0, limit) : items;
  let ul = renderItems(shown);
  const { header, setView } = buildHeader(config, () => ul);
  const inner = document.createElement('div');
  inner.className = 'article-list-inner';
  inner.append(header, ul);
  block.replaceChildren(inner);
  setView((config.view || '').toLowerCase() === 'card' ? 'card' : 'list');

  // allow later feeds (query index) to replace the items
  block.renderItems = (newItems) => {
    const next = renderItems(newItems);
    next.className = ul.className;
    ul.replaceWith(next);
    ul = next;
  };
}
