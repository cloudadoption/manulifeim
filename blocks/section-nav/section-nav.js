/*
 * Section Nav block (replaces innerNavigationBar / landingNav and pressCategories).
 *
 * DA authoring tables:
 *
 * | Section Nav (anchors[, left]) |
 *   (no rows) → items are built from the following sections that carry
 *   Section Metadata `Nav Title` (and optional `Id`; default id = slug of the nav title).
 *   Optional rows `Label | #anchor` (or a list of links) override the automatic items.
 *
 * | Section Nav (links)            |
 * | list of links: Press releases → /about-us/press-releases/category/press-releases, … |
 *   The item matching the current path is active.
 */
import { toClassName } from '../../scripts/aem.js';

function readSectionMeta(section) {
  const meta = {
    id: section.dataset.id || section.id || '',
    navTitle: section.dataset.navTitle || section.dataset.navtitle || '',
  };
  const md = section.querySelector('div.section-metadata');
  if (md) {
    [...md.children].forEach((row) => {
      const key = toClassName(row.children[0]?.textContent || '');
      const value = row.children[1]?.textContent.trim() || '';
      if (key === 'id' && !meta.id) meta.id = value;
      if (key === 'nav-title' && !meta.navTitle) meta.navTitle = value;
    });
  }
  return meta;
}

function collectSectionItems(block) {
  const main = block.closest('main') || document.querySelector('main');
  if (!main) return [];
  const own = block.closest('.section');
  const sections = [...main.querySelectorAll(':scope > .section, :scope > div')];
  const start = own ? sections.indexOf(own) : -1;
  const items = [];
  sections.slice(start + 1).forEach((section) => {
    const { id, navTitle } = readSectionMeta(section);
    if (!navTitle) return;
    const anchor = id || toClassName(navTitle);
    if (!section.id) section.id = anchor;
    items.push({ label: navTitle, href: `#${section.id}`, target: section });
  });
  return items;
}

function collectAuthoredLinks(block) {
  const items = [];
  [...block.querySelectorAll('a[href]')].forEach((a) => {
    items.push({ label: a.textContent.trim(), href: a.getAttribute('href') });
  });
  if (!items.length) {
    // rows `Label | #anchor` without links
    [...block.children].forEach((row) => {
      const [label, target] = [...row.children].map((c) => c.textContent.trim());
      if (label && target && target.startsWith('#')) items.push({ label, href: target });
    });
  }
  return items;
}

function buildDropdown(items, onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'section-nav-mobile';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'section-nav-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const id = `section-nav-dropdown-${Math.random().toString(36).slice(2, 8)}`;
  trigger.setAttribute('aria-controls', id);
  trigger.textContent = items[0]?.label || '';
  const dropdown = document.createElement('div');
  dropdown.className = 'section-nav-dropdown';
  dropdown.id = id;
  const ul = document.createElement('ul');
  const links = items.map((item, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'section-nav-dropdown-item';
    a.href = item.href;
    a.dataset.index = i;
    a.tabIndex = -1;
    const check = document.createElement('span');
    check.className = 'section-nav-check';
    check.setAttribute('aria-hidden', 'true');
    a.append(check, document.createTextNode(item.label));
    li.append(a);
    ul.append(li);
    return a;
  });
  dropdown.append(ul);
  wrap.append(trigger, dropdown);

  const close = () => {
    wrap.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    links.forEach((l) => { l.tabIndex = -1; });
  };
  const open = () => {
    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    links.forEach((l) => { l.tabIndex = 0; });
  };
  trigger.addEventListener('click', () => (wrap.classList.contains('open') ? close() : open()));
  links.forEach((a, i) => a.addEventListener('click', () => {
    close();
    onSelect(i);
  }));
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      trigger.focus();
    }
  });

  return {
    el: wrap,
    setActive(i) {
      trigger.textContent = items[i]?.label || '';
      links.forEach((l, j) => l.setAttribute('aria-selected', i === j ? 'true' : 'false'));
    },
  };
}

function buildAnchors(block) {
  let items = collectAuthoredLinks(block);
  if (!items.length) items = collectSectionItems(block);
  const inner = document.createElement('div');
  inner.className = 'section-nav-inner';
  if (!items.length) {
    block.replaceChildren(inner);
    return;
  }

  const nav = document.createElement('nav');
  nav.className = 'section-nav-onpage';
  nav.setAttribute('aria-label', 'on-page navigation');
  const ul = document.createElement('ul');
  ul.className = 'section-nav-list';
  const triggers = items.map((item) => {
    const li = document.createElement('li');
    li.className = 'section-nav-item';
    const a = document.createElement('a');
    a.className = 'section-nav-trigger';
    a.href = item.href;
    a.textContent = item.label;
    li.append(a);
    ul.append(li);
    return a;
  });
  nav.append(ul);

  let current = -1;
  const setActive = (i) => {
    if (i === current) return;
    current = i;
    triggers.forEach((t, j) => {
      t.classList.toggle('active', i === j);
      if (i === j) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    });
    // eslint-disable-next-line no-use-before-define
    dropdown.setActive(Math.max(i, 0));
  };
  const dropdown = buildDropdown(items, (i) => setActive(i));
  inner.append(dropdown.el, nav);
  block.replaceChildren(inner);

  const targets = items.map((item) => item.target
    || document.getElementById(decodeURIComponent(item.href.replace(/^#/, ''))));
  let ticking = false;
  const update = () => {
    ticking = false;
    const offset = block.getBoundingClientRect().height + 1;
    let active = -1;
    targets.forEach((t, i) => {
      if (t && t.getBoundingClientRect().top - offset <= 1) active = i;
    });
    setActive(active);
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

function buildLinks(block) {
  const items = collectAuthoredLinks(block);
  const wrapper = document.createElement('div');
  wrapper.className = 'section-nav-inner';
  const here = new URL(window.location.href);
  const path = here.pathname.replace(/\/$/, '');
  let activeIndex = -1;
  let fallback = -1;
  items.forEach((item, i) => {
    let u;
    try {
      u = new URL(item.href, window.location.href);
    } catch (e) {
      return;
    }
    const p = u.pathname.replace(/\/$/, '');
    const query = [...u.searchParams.entries()];
    if (query.length) {
      // query links (press categories: ?category=archive) match on path + parameters;
      // without the parameter in the URL the first one is the default (live root listing)
      if (p !== path) return;
      const same = query.every(([k, v]) => here.searchParams.get(k) === v);
      if (activeIndex === -1 && same) activeIndex = i;
      else if (fallback === -1 && !query.some(([k]) => here.searchParams.has(k))) fallback = i;
    } else if (activeIndex === -1 && (path === p || path.startsWith(`${p}/`))) activeIndex = i;
  });
  if (activeIndex === -1) activeIndex = fallback;

  // mobile: native select (live pressCategories__select)
  const mobile = document.createElement('div');
  mobile.className = 'section-nav-mobile';
  const select = document.createElement('select');
  select.className = 'section-nav-select';
  select.setAttribute('aria-label', 'Categories');
  items.forEach((item, i) => {
    const opt = document.createElement('option');
    opt.value = item.href;
    opt.textContent = item.label;
    if (i === activeIndex) opt.selected = true;
    select.append(opt);
  });
  select.addEventListener('change', () => { window.location.href = select.value; });
  mobile.append(select);

  const ul = document.createElement('ul');
  ul.className = 'section-nav-list';
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'section-nav-item';
    if (i === activeIndex) li.classList.add('active');
    const a = document.createElement('a');
    a.className = 'section-nav-link';
    a.href = item.href;
    a.textContent = item.label;
    if (i === activeIndex) a.setAttribute('aria-current', 'page');
    li.append(a);
    ul.append(li);
  });
  const nav = document.createElement('nav');
  nav.className = 'section-nav-onpage';
  nav.setAttribute('aria-label', 'Categories');
  nav.append(ul);
  wrapper.append(mobile, nav);
  block.replaceChildren(wrapper);
}

export default function decorate(block) {
  if (block.classList.contains('links')) buildLinks(block);
  else {
    block.classList.add('anchors');
    buildAnchors(block);
  }
}
