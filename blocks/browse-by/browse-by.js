/* eslint-disable max-len */
/*
 * Browse By block (replaces browseBar): tabs Authors / Categories / Tags.
 *
 * DA authoring table (one row per item; first cell = tab name):
 *
 * | Browse By  |        |                                    |                                  |          |             |
 * | Title      | Browse by                                         (optional, default "Browse by")                          |
 * | Authors    | photo  | [Adam A. Weigold, CFA](/viewpoints/adam-weigold) | Manulife Investment Management | 3 | 2023-06-08 |
 * | Categories | [Alternative credit](/viewpoints/alternative-credit)                                                      |
 * | Tags       | [Asset allocation](/viewpoints/tag/asset-allocation)                                                      |
 *
 * Author rows: optional photo, link (name), subtitle (company), article count, last posted
 * date (ISO). Count and date feed the "Most articles" / "Recently posted" sort.
 * Tabs appear in the order of first use. "View more" / "View less" toggles the mask.
 *
 * Long lists (a page may hold at most 200 images) live in fragment documents:
 * | Authors    | [/institutional/tw/en/fragments/viewpoints-authors-1](/institutional/tw/en/fragments/viewpoints-authors-1) |
 * Any row link to a /fragments/ path is a source: its Browse By rows (same shape as above,
 * tab cell ignored) are fetched when the tab is first shown and added to the tab.
 */
/* eslint-enable max-len */
import { toClassName } from '../../scripts/aem.js';
import { parseDate, hideOnError, readRows } from '../../scripts/block-utils.js';
import { pageSignal } from '../../scripts/authoring.js';

const TAB_TITLES = {
  authors: 'Browse articles by author',
  categories: 'Browse articles by category',
  tags: 'Browse articles by tag',
};

const FRAGMENT = /\/fragments\//;

const SORTS = [
  { order: 'name', label: 'Alphabetical' },
  { order: 'lastPosted', label: 'Recently posted' },
  { order: 'viewpointsCount', label: 'Most articles' },
];

function parseRow(row) {
  const cells = [...row.children];
  const tab = cells[0]?.textContent.trim();
  const item = {
    tab, href: '', name: '', subtitle: '', image: null, count: 0, lastPosted: 0,
  };
  cells.slice(1).forEach((cell) => {
    const a = cell.querySelector('a[href]');
    const pic = cell.querySelector('picture');
    const text = cell.textContent.trim();
    if (pic && !item.image) item.image = pic;
    if (a && !item.href) {
      item.href = a.getAttribute('href');
      item.name = a.textContent.trim();
      return;
    }
    if (!text) return;
    if (/^\d+$/.test(text) && !item.count) {
      item.count = parseInt(text, 10);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(text) || /^\d{10,13}$/.test(text)) {
      const d = parseDate(text);
      item.lastPosted = d ? d.getTime() : 0;
    } else if (!item.subtitle) {
      item.subtitle = text;
    }
  });
  return item;
}

/** Fragment document paths linked from a row ([] for a normal item row). */
function fragmentSources(row) {
  return [...row.children].slice(1).flatMap((cell) => [...cell.querySelectorAll('a[href]')])
    .map((a) => {
      try {
        const url = new URL(a.getAttribute('href'), window.location.href);
        return url.pathname.replace(/(\.plain)?\.html$/, '');
      } catch (e) {
        return '';
      }
    })
    .filter((path) => FRAGMENT.test(path));
}

/** Rows of the Browse By block(s) in a fragment document; media URLs rebased to it. */
async function fetchFragmentRows(path) {
  const resp = await fetch(`${path}.plain.html`);
  if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
  // inert document: no image requests before the URLs are rebased
  const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
  const base = new URL(path, window.location.href);
  doc.querySelectorAll('img[src^="./media_"]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), base).href;
  });
  doc.querySelectorAll('source[srcset^="./media_"]').forEach((source) => {
    source.srcset = new URL(source.getAttribute('srcset'), base).href;
  });
  const blocks = [...doc.querySelectorAll('.browse-by')];
  return blocks.flatMap((b) => [...b.children]).map((row) => document.adoptNode(row));
}

function buildItem(item, isAuthor) {
  const li = document.createElement('li');
  li.className = 'browse-by-item';
  li.dataset.name = item.name;
  li.dataset.viewpointsCount = item.count;
  li.dataset.lastPosted = item.lastPosted;
  if (isAuthor) {
    const wrap = document.createElement('div');
    wrap.className = 'browse-by-link';
    const figure = document.createElement('figure');
    figure.className = 'browse-by-image';
    if (item.image) {
      figure.append(item.image);
      hideOnError(figure);
    } else {
      figure.classList.add('image-hidden');
    }
    const details = document.createElement('div');
    details.className = 'browse-by-author-details';
    const a = document.createElement('a');
    a.className = 'browse-by-author-link';
    a.href = item.href;
    a.textContent = item.name;
    details.append(a);
    if (item.subtitle) {
      const p = document.createElement('p');
      p.className = 'browse-by-author-subtitle';
      p.textContent = item.subtitle;
      details.append(p);
    }
    wrap.append(figure, details);
    // whole tile is clickable like live
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      a.click();
    });
    li.append(wrap);
  } else {
    const a = document.createElement('a');
    a.className = 'browse-by-link';
    a.href = item.href;
    a.textContent = item.name;
    li.append(a);
  }
  return li;
}

function buildSort(onSort) {
  const wrap = document.createElement('div');
  wrap.className = 'browse-by-sort';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'browse-by-sort-trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.className = 'browse-by-sort-label';
  label.textContent = 'Sort by';
  const current = document.createElement('span');
  current.className = 'browse-by-sort-current';
  current.textContent = SORTS[0].label;
  const chevron = document.createElement('span');
  chevron.className = 'browse-by-sort-icon';
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(label, current, chevron);

  const content = document.createElement('div');
  content.className = 'browse-by-sort-content';
  const title = document.createElement('span');
  title.className = 'browse-by-sort-title';
  title.textContent = 'Sort authors';
  const ul = document.createElement('ul');
  ul.className = 'browse-by-sort-options';
  const buttons = SORTS.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'browse-by-sort-option';
    if (i === 0) b.classList.add('active');
    b.dataset.order = s.order;
    const check = document.createElement('span');
    check.className = 'browse-by-sort-check';
    check.setAttribute('aria-hidden', 'true');
    b.append(check, document.createTextNode(s.label));
    li.append(b);
    ul.append(li);
    return b;
  });
  content.append(title, ul);
  wrap.append(trigger, content);

  const close = () => {
    wrap.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  };
  trigger.addEventListener('click', () => {
    const open = !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  }, { signal: pageSignal() });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      trigger.focus();
    }
  });
  buttons.forEach((b, i) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.classList.toggle('active', x === b));
    current.textContent = SORTS[i].label;
    close();
    onSort(SORTS[i].order);
  }));
  return wrap;
}

function sortItems(list, order) {
  const items = [...list.children];
  items.sort((a, b) => {
    if (order === 'lastPosted') return Number(b.dataset.lastPosted) - Number(a.dataset.lastPosted);
    if (order === 'viewpointsCount') {
      return Number(b.dataset.viewpointsCount) - Number(a.dataset.viewpointsCount);
    }
    return a.dataset.name.localeCompare(b.dataset.name, 'en', { sensitivity: 'base' });
  });
  list.append(...items);
}

export default function decorate(block) {
  const { config, settings, items: rows } = readRows(block, ['title'], {
    hrefKeys: [],
    accept: (cells) => !cells[1].querySelector('a'),
  });
  const title = config.title || 'Browse by';
  const tabs = new Map();
  rows.forEach((row) => {
    const cells = [...row.children];
    const first = cells[0]?.textContent.trim();
    if (!first) return;
    const id = toClassName(first);
    const addTab = () => {
      if (!tabs.has(id)) tabs.set(id, { label: first, items: [], sources: [] });
      return tabs.get(id);
    };
    const sources = fragmentSources(row);
    if (sources.length) {
      addTab().sources.push(...sources);
      return;
    }
    const item = parseRow(row);
    if (!item.href) return;
    addTab().items.push(item);
  });

  const inner = document.createElement('div');
  inner.className = 'browse-by-inner';
  const header = document.createElement('div');
  header.className = 'browse-by-header';
  const h2 = document.createElement('h2');
  h2.className = 'browse-by-title';
  h2.textContent = title;
  const tablist = document.createElement('div');
  tablist.className = 'browse-by-tabs';
  tablist.setAttribute('role', 'tablist');
  header.append(h2, tablist);
  const contentWrap = document.createElement('div');
  contentWrap.className = 'browse-by-content';
  inner.append(header, contentWrap);

  const uid = Math.random().toString(36).slice(2, 8);
  const panels = [];
  const buttons = [];
  const loaders = [];

  const updateMore = (panel) => {
    const mask = panel.querySelector('.browse-by-mask');
    const more = panel.querySelector('.browse-by-more');
    if (!mask || !more || !panel.classList.contains('active')) return;
    const list = mask.firstElementChild;
    const expanded = panel.classList.contains('expanded');
    const limit = parseFloat(getComputedStyle(mask).getPropertyValue('--browse-by-mask')) || 240;
    const needs = list.scrollHeight > limit + 4;
    more.hidden = !needs;
    mask.style.maxHeight = expanded ? `${list.scrollHeight + 4}px` : '';
  };

  const activate = (index, focus = false) => {
    buttons.forEach((b, i) => {
      const active = i === index;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.tabIndex = active ? 0 : -1;
      panels[i].classList.toggle('active', active);
      panels[i].hidden = !active;
    });
    if (focus) buttons[index].focus();
    if (loaders[index]) {
      const load = loaders[index];
      loaders[index] = null;
      load();
    }
    updateMore(panels[index]);
  };

  [...tabs.entries()].forEach(([id, tab], index) => {
    const isAuthor = id === 'authors' || tab.sources.length > 0
      || tab.items.some((it) => it.image || it.subtitle);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'browse-by-tab-button';
    button.id = `browse-by-tab-${id}-${uid}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `browse-by-panel-${id}-${uid}`);
    button.textContent = tab.label;
    const tabItem = document.createElement('div');
    tabItem.className = 'browse-by-tab-item';
    tabItem.append(button);
    tablist.append(tabItem);
    buttons.push(button);

    const panel = document.createElement('div');
    panel.className = `browse-by-tab-content browse-by-tab-content-${isAuthor ? 'authors' : 'links'}`;
    panel.id = `browse-by-panel-${id}-${uid}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);

    const tabHeader = document.createElement('div');
    tabHeader.className = 'browse-by-tab-header';
    const tabTitle = document.createElement(index === 0 ? 'h3' : 'h4');
    tabTitle.className = 'browse-by-tab-title';
    tabTitle.textContent = TAB_TITLES[id] || `Browse articles by ${tab.label.toLowerCase()}`;
    tabHeader.append(tabTitle);

    const mask = document.createElement('div');
    mask.className = 'browse-by-mask';
    const list = document.createElement('ul');
    list.className = 'browse-by-item-list';
    tab.items.forEach((item) => list.append(buildItem(item, isAuthor)));
    let order = 'name';
    if (isAuthor) {
      sortItems(list, order);
      tabHeader.append(buildSort((next) => {
        order = next;
        sortItems(list, order);
        updateMore(panel);
      }));
    }
    mask.append(list);
    if (tab.sources.length) {
      // fragment rows: fetched the first time the tab is shown
      loaders[index] = async () => {
        panel.classList.add('loading');
        panel.setAttribute('aria-busy', 'true');
        const results = await Promise.allSettled(tab.sources.map(fetchFragmentRows));
        results.forEach((r) => {
          if (r.status === 'rejected') {
            // eslint-disable-next-line no-console
            console.warn('browse-by: fragment not loaded', r.reason);
            return;
          }
          r.value.map(parseRow).filter((item) => item.href)
            .forEach((item) => list.append(buildItem(item, isAuthor)));
        });
        if (isAuthor) sortItems(list, order);
        panel.classList.remove('loading');
        panel.removeAttribute('aria-busy');
        updateMore(panel);
      };
    }

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'browse-by-more';
    more.dataset.more = 'View more';
    more.dataset.less = 'View less';
    const moreText = document.createElement('span');
    moreText.textContent = 'View more';
    const moreIcon = document.createElement('span');
    moreIcon.className = 'browse-by-more-icon';
    moreIcon.setAttribute('aria-hidden', 'true');
    more.append(moreText, moreIcon);
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
      const expanded = !panel.classList.contains('expanded');
      panel.classList.toggle('expanded', expanded);
      moreText.textContent = expanded ? more.dataset.less : more.dataset.more;
      more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      updateMore(panel);
    });

    panel.append(tabHeader, mask, more);
    contentWrap.append(panel);
    panels.push(panel);

    button.addEventListener('click', () => activate(index));
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        activate(next, true);
      }
    });
  });

  block.replaceChildren(...settings, inner);
  if (buttons.length) activate(0);

  // measure once the section is visible and on resize
  const ro = new ResizeObserver(() => {
    const active = panels.find((p) => p.classList.contains('active'));
    if (active) updateMore(active);
  });
  ro.observe(block);
}
