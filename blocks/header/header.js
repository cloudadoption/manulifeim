/*
 * Header: live `div.navigation[data-module=Header]` (top bar + fixed left icon rail) and
 * the site banner (`aside > .siteBanner`), built from the DA document /nav.
 *
 * /nav sections (see migration-work/analysis/chrome.md):
 *   1 brand    desktop logo image, mobile logo image, home link (`:mim-logo:` icon +
 *              a11y label), optional skip link (`#main-content`)
 *   2 tools    list: search link (label = placeholder, href = results page), region link
 *              (`#region-select`), "Log in" link, bold "Register for access" link,
 *              optional plain text "Open label | Close label" for the mobile menu button
 *   3 rail     list: first item = green home tile; other items `:icon: label` linked, or
 *              unlinked with a nested list = flyout
 *   4 banner   one paragraph per message (dismissible, remembered per session)
 */
import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
// eslint-disable-next-line import/no-cycle
import { openRegionSelector } from '../../scripts/scripts.js';
import { pageSignal } from '../../scripts/authoring.js';

const desktop = window.matchMedia('(width >= 801px)');
const hoverDesktop = window.matchMedia('(hover: hover) and (width >= 801px)');
const BANNER_KEY = 'mim-site-banner-dismissed';
const REGION_HASH = '#region-select';

let uid = 0;
const nextId = (prefix) => {
  uid += 1;
  return `${prefix}-${uid}`;
};

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  });
  children.flat().filter((c) => c !== null && c !== undefined && c !== '').forEach((c) => e.append(c));
  return e;
}

/** Monochrome icon from /icons/<name>.svg, drawn with currentColor through a CSS mask. */
function icon(name, cls = '') {
  const span = el('span', { class: `header-icon ${cls}`.trim(), 'aria-hidden': 'true' });
  span.style.setProperty('--header-icon', `url("${window.hlx.codeBasePath}/icons/${name}.svg")`);
  return span;
}

const iconName = (span) => {
  const c = span && [...span.classList].find((n) => n.startsWith('icon-'));
  return c ? c.substring(5) : '';
};

/** Visible text of a node without nested lists, collapsed. */
function labelOf(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  clone.querySelectorAll('ul, ol, .icon').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function normPath(p) {
  return (p || '/').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
}

function pathOf(href) {
  try {
    const u = new URL(href, window.location.href);
    return u.origin === window.location.origin ? normPath(u.pathname) : null;
  } catch (e) {
    return null;
  }
}

function isCurrent(href) {
  const p = pathOf(href);
  if (!p || p === '/') return false;
  const here = normPath(window.location.pathname);
  return here === p || here.startsWith(`${p}/`);
}

/* ---------- content parsing ---------- */

function listItems(section) {
  if (!section) return [];
  const list = section.querySelector('ul, ol');
  if (list) return [...list.children];
  return [...section.querySelectorAll('.default-content-wrapper > p')];
}

function parseBrand(section) {
  const brand = {
    home: '/', label: 'Home', iconName: 'mim-logo', desktop: null, mobile: null, skip: null,
  };
  if (!section) return brand;
  const pictures = [...section.querySelectorAll('picture, img')]
    .filter((p) => !p.closest('.icon') && (p.tagName === 'PICTURE' || !p.closest('picture')));
  [brand.desktop, brand.mobile] = pictures;
  section.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) {
      brand.skip = { href, label: labelOf(a) };
    } else if (!brand.homeSet) {
      brand.homeSet = true;
      brand.home = href;
      brand.label = labelOf(a) || brand.label;
      brand.iconName = iconName(a.querySelector('.icon')) || brand.iconName;
    }
  });
  return brand;
}

function parseTools(section) {
  const tools = {
    search: null, region: null, login: null, register: null, menu: ['Open Site Navigation', 'Close Site Navigation'],
  };
  listItems(section).forEach((item) => {
    const a = item.querySelector('a[href]');
    if (!a) {
      const parts = labelOf(item).split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length) tools.menu = [parts[0], parts[1] || parts[0].replace(/^Open/, 'Close')];
      return;
    }
    const href = a.getAttribute('href');
    const label = labelOf(a);
    const strong = a.closest('strong, b') || a.classList.contains('primary');
    if (href.startsWith('#')) tools.region = { label };
    else if (!strong && /\/search$/.test(normPath(pathOf(href) || href))) tools.search = { label, href };
    else if (strong) tools.register = { label, href };
    else tools.login = { label, href };
  });
  return tools;
}

function parseRail(section) {
  return listItems(section).map((li) => {
    const sub = li.querySelector(':scope > ul, :scope > ol');
    const a = [...li.querySelectorAll(':scope > a, :scope > p > a, :scope > strong > a')][0];
    const iconSpan = li.querySelector(':scope > .icon, :scope > a .icon, :scope > p .icon');
    return {
      label: labelOf(a || li),
      href: a ? a.getAttribute('href') : null,
      icon: iconName(iconSpan),
      children: sub ? [...sub.querySelectorAll(':scope > li')].map((c) => {
        const ca = c.querySelector('a[href]');
        return ca ? { label: labelOf(ca), href: ca.getAttribute('href') } : null;
      }).filter(Boolean) : [],
    };
  }).filter((item) => item.label || item.href);
}

/* ---------- top bar ---------- */

function buildSearch(tools, bar) {
  const { label, href } = tools.search || { label: 'Search', href: '/institutional/tw/en/search' };
  const inputId = nextId('header-search');
  const form = el(
    'form',
    {
      class: 'header-search-form', action: pathOf(href) || href, method: 'get', role: 'search',
    },
    el('label', { class: 'header-a11y', for: inputId }, label),
    el('input', {
      id: inputId, class: 'header-search-input', type: 'search', name: 'q', placeholder: label, autocomplete: 'off', enterkeyhint: 'search',
    }),
    el('button', { class: 'header-search-submit', type: 'submit', 'aria-label': label }, icon('magnifier')),
  );
  const panel = el('div', { class: 'header-search', id: nextId('header-search-panel') }, form);
  const toggle = el(
    'button',
    {
      type: 'button', class: 'header-button header-button-mobile header-search-toggle', title: label, 'aria-expanded': 'false', 'aria-controls': panel.id,
    },
    icon('magnifier', 'header-button-icon'),
    el('span', { class: 'header-caption' }, label),
  );
  toggle.addEventListener('click', () => {
    const open = !bar.classList.contains('search-open');
    bar.classList.toggle('search-open', open);
    toggle.setAttribute('aria-expanded', open);
    if (open) form.querySelector('input').focus();
  });
  return { panel, toggle };
}

function buildBar(brand, tools, block) {
  const bar = el('div', { class: 'header-bar' });

  const mobileIcon = el(
    'a',
    { class: 'header-logo-icon', href: brand.home, title: brand.label },
    el('img', {
      src: `${window.hlx.codeBasePath}/icons/${brand.iconName}.svg`, alt: '', width: 50, height: 50,
    }),
    el('span', { class: 'header-a11y' }, brand.label),
  );
  const logoLink = el('a', { class: 'header-logo-link', href: brand.home });
  if (brand.desktop) {
    brand.desktop.classList.add('header-logo-desktop');
    logoLink.append(brand.desktop);
  }
  if (brand.mobile) {
    brand.mobile.classList.add('header-logo-mobile');
    logoLink.append(brand.mobile);
  }
  if (!brand.desktop && !brand.mobile) logoLink.textContent = brand.label;
  logoLink.querySelectorAll('img').forEach((img) => {
    img.loading = 'eager';
    if (!img.alt) img.alt = brand.label;
  });
  bar.append(el('div', { class: 'header-logo' }, mobileIcon, logoLink));

  const search = buildSearch(tools, bar);
  bar.append(search.panel);

  const buttons = el('nav', { class: 'header-buttons', 'aria-label': 'User and Region Options' });
  const regionLabel = (tools.region && tools.region.label) || 'Taiwan';
  const region = el(
    'button',
    {
      type: 'button', class: 'header-button header-button-desktop header-region', title: 'Select a location', 'aria-label': `Select a location - ${regionLabel}`, 'aria-haspopup': 'dialog',
    },
    el('span', {}, regionLabel),
    icon('arrow-down', 'header-region-arrow'),
  );
  region.addEventListener('click', () => openRegionSelector());
  buttons.append(region, search.toggle);

  const auth = el('div', { class: 'header-auth' });
  if (tools.login) {
    auth.append(el(
      'a',
      { class: 'header-button header-login', href: tools.login.href, title: tools.login.label },
      icon('user', 'header-button-icon header-login-icon'),
      el('span', { class: 'header-caption' }, tools.login.label),
    ));
  }
  if (tools.register) {
    auth.append(el(
      'a',
      { class: 'header-register', href: tools.register.href, title: tools.register.label },
      el('span', { class: 'header-caption' }, tools.register.label),
    ));
  }
  buttons.append(auth);

  const [openLabel, closeLabel] = tools.menu;
  const caption = el('span', { class: 'header-caption' }, openLabel);
  const menuIcon = icon('mobile-menu', 'header-button-icon');
  const menu = el(
    'button',
    {
      type: 'button', class: 'header-button header-button-mobile header-menu-toggle', 'aria-expanded': 'false', 'aria-controls': 'header-rail',
    },
    menuIcon,
    caption,
  );
  menu.addEventListener('click', () => {
    const open = !block.classList.contains('menu-open');
    block.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', open);
    caption.textContent = open ? closeLabel : openLabel;
    menuIcon.style.setProperty('--header-icon', `url("${window.hlx.codeBasePath}/icons/${open ? 'close' : 'mobile-menu'}.svg")`);
    document.body.style.overflowY = open ? 'hidden' : '';
    // the page behind the open menu is out of reach for keyboard and screen readers
    document.querySelectorAll('body > main, body > footer').forEach((e) => { e.inert = open; });
    if (open) bar.classList.remove('search-open');
  });
  buttons.append(menu);
  bar.append(buttons);
  return bar;
}

/* ---------- rail ---------- */

function setFlyout(li, open) {
  const button = li.querySelector(':scope > .header-rail-link');
  if (!button) return;
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  li.classList.toggle('sub-open', open);
}

function buildFlyoutItem(item) {
  const subId = nextId('header-subnav');
  const button = el(
    'button',
    {
      type: 'button', class: 'header-rail-link has-sub', 'aria-expanded': 'false', 'aria-controls': subId,
    },
    item.icon ? icon(item.icon, 'header-rail-icon') : null,
    el('span', { class: 'header-rail-label' }, item.label),
    icon('arrow-right', 'header-rail-arrow'),
  );
  const sub = el('ul', { class: 'header-subnav', id: subId });
  item.children.forEach((c) => {
    sub.append(el('li', { class: 'header-subnav-item' }, el('a', { class: 'header-subnav-link', href: c.href }, c.label)));
  });
  const li = el('li', { class: 'header-rail-item' }, button, sub);

  let suppressFocusOpen = false;
  button.addEventListener('click', () => setFlyout(li, button.getAttribute('aria-expanded') !== 'true'));
  li.addEventListener('focusin', (e) => {
    if (!desktop.matches || suppressFocusOpen) return;
    // keyboard focus opens the flyout (mouse focus is handled by click / hover)
    if (e.target !== button || button.matches(':focus-visible')) setFlyout(li, true);
  });
  li.addEventListener('focusout', (e) => {
    if (!li.contains(e.relatedTarget) && desktop.matches) setFlyout(li, false);
  });
  li.addEventListener('mouseleave', () => {
    if (hoverDesktop.matches && !li.contains(document.activeElement)) setFlyout(li, false);
  });
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && li.classList.contains('sub-open')) {
      e.stopPropagation();
      setFlyout(li, false);
      suppressFocusOpen = true;
      button.focus();
      suppressFocusOpen = false;
    } else if (e.key === 'ArrowDown' && e.target === button) {
      e.preventDefault();
      setFlyout(li, true);
      const first = sub.querySelector('a');
      if (first) first.focus();
    }
  });
  if (item.children.some((c) => isCurrent(c.href))) li.classList.add('active');
  return li;
}

function buildRail(items, tools) {
  const list = el('ul', { class: 'header-rail-list' });
  items.forEach((item, i) => {
    if (i === 0) {
      list.append(el(
        'li',
        { class: 'header-rail-item header-rail-top' },
        el(
          'a',
          { class: 'header-rail-link', href: item.href || '/' },
          el('img', {
            src: `${window.hlx.codeBasePath}/icons/${item.icon || 'mim-logo'}.svg`, alt: '', width: 80, height: 80,
          }),
          el('span', { class: 'header-a11y' }, item.label),
        ),
      ));
      return;
    }
    if (item.children.length) {
      list.append(buildFlyoutItem(item));
      return;
    }
    const current = item.href && isCurrent(item.href);
    list.append(el(
      'li',
      { class: `header-rail-item${current ? ' active' : ''}` },
      el(
        item.href ? 'a' : 'span',
        { class: 'header-rail-link', href: item.href || undefined, 'aria-current': current ? 'page' : undefined },
        item.icon ? icon(item.icon, 'header-rail-icon') : null,
        el('span', { class: 'header-rail-label' }, item.label),
      ),
    ));
  });

  // mobile-only: region selector and CPS buttons (live sidebar__element--mobile / __cpsMobile)
  const regionLabel = (tools.region && tools.region.label) || 'Taiwan';
  const region = el(
    'button',
    { type: 'button', class: 'header-rail-link', 'aria-label': 'Select a location' },
    icon('globe', 'header-rail-icon'),
    el('span', { class: 'header-rail-label' }, regionLabel),
  );
  region.addEventListener('click', () => openRegionSelector());
  list.append(el('li', { class: 'header-rail-item header-rail-mobile' }, region));
  if (tools.register || tools.login) {
    list.append(el(
      'li',
      { class: 'header-rail-cps' },
      tools.register ? el('a', { class: 'header-rail-register', href: tools.register.href, title: tools.register.label }, tools.register.label) : null,
      tools.login ? el('a', { class: 'header-rail-login', href: tools.login.href, title: tools.login.label }, tools.login.label) : null,
    ));
  }
  return el('nav', { class: 'header-rail', id: 'header-rail', 'aria-label': 'Main Navigation' }, list);
}

/* ---------- site banner ---------- */

function buildBanner(section) {
  if (!section) return null;
  const messages = [...section.querySelectorAll('.default-content-wrapper > p')].filter((p) => p.textContent.trim());
  if (!messages.length) return null;
  const signature = messages.map((p) => p.textContent.trim()).join('|');
  try {
    if (sessionStorage.getItem(BANNER_KEY) === signature) return null;
  } catch (e) {
    // storage unavailable: show the banner
  }
  const list = el('div', { class: 'header-banner-messages' });
  messages.forEach((p) => {
    const text = el('span', { class: 'header-banner-text' });
    while (p.firstChild) text.append(p.firstChild);
    list.append(el('div', { class: 'header-banner-item' }, text));
  });
  const close = el('button', { type: 'button', class: 'header-banner-close', 'aria-label': 'Close alert message' }, icon('close'));
  // a labelled region, not an aside: a complementary landmark may not sit inside the banner
  const banner = el('div', { class: 'header-banner', role: 'region', 'aria-label': 'Site notice' }, el('div', { class: 'header-banner-inner' }, list, close));
  close.addEventListener('click', () => {
    banner.remove();
    try {
      sessionStorage.setItem(BANNER_KEY, signature);
    } catch (e) {
      // ignore
    }
  });
  return banner;
}

/* ---------- block ---------- */

function closeAll(block) {
  const bar = block.querySelector('.header-bar');
  const menu = block.querySelector('.header-menu-toggle');
  if (block.classList.contains('menu-open') && menu) menu.click();
  if (bar && bar.classList.contains('search-open')) block.querySelector('.header-search-toggle').click();
  block.querySelectorAll('.header-rail-item.sub-open').forEach((li) => setFlyout(li, false));
}

/**
 * loads and decorates the header
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);
  const sections = fragment ? [...fragment.querySelectorAll(':scope > .section')] : [];

  const brand = parseBrand(sections[0]);
  const tools = parseTools(sections[1]);
  const rail = parseRail(sections[2]);

  block.textContent = '';
  const main = document.querySelector('main');
  const skip = brand.skip || { href: '#main-content', label: 'Skip to main content' };
  if (main && !main.id && skip.href.length > 1) main.id = skip.href.substring(1);
  block.append(el('a', { class: 'header-skip', href: skip.href }, skip.label));
  block.append(buildBar(brand, tools, block));
  block.append(buildRail(rail, tools));
  const banner = buildBanner(sections[3]);
  if (banner) block.append(banner);

  // any `#region-select` link on the page (e.g. authored content) opens the region selector
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest(`a[href="${REGION_HASH}"]`);
    if (a && !a.closest('dialog')) {
      e.preventDefault();
      openRegionSelector();
    }
  }, { signal: pageSignal() });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll(block);
  }, { signal: pageSignal() });
  desktop.addEventListener('change', () => closeAll(block), { signal: pageSignal() });
}
