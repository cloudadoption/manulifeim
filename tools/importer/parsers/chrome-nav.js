/* eslint-disable */
/*
 * Parser: live header chrome -> DA document /nav (read by blocks/header).
 *   section 1 brand   desktop logo, mobile logo, [:mim-logo: Home](home), [Skip to main content](#main-content)
 *   section 2 tools   - [Search](search page)  - [Taiwan](#region-select)  - [Log in](live)
 *                     - **[Register for access](live)**  - Open Site Navigation | Close Site Navigation
 *   section 3 rail    - [:icon: Label](href) ... ; flyout = unlinked `:icon: Label` + nested list
 *   section 4 banner  one paragraph per site banner message
 * Live sources: div.navigation > a.navigation__skip, header.header, nav.sidebar, .siteBanner.
 */
import {
  el, label, imageParagraph, link, sections, norm,
} from './chrome-shared.js';
import { LIVE_ORIGIN, SITE_ROOT } from '../utils/links.js';

/* live rail icon image -> EDS icon name (icons/<name>.svg) */
const ICONS = [
  [/mim-logo/i, 'mim-logo'],
  [/handshake/i, 'handshake'],
  [/chess/i, 'chess'],
  [/eye/i, 'eye'],
  [/office|about/i, 'office'],
  [/leaf/i, 'leaf'],
  [/speech/i, 'speech-bubbles'],
];

function iconFor(img) {
  let src = (img && img.getAttribute('src')) || '';
  try {
    src = decodeURIComponent(src);
  } catch (e) {
    // keep raw
  }
  const file = src.split('/').pop();
  const hit = ICONS.find(([re]) => re.test(file));
  if (hit) return hit[1];
  return file.replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mim-logo';
}

function brandSection(document) {
  const header = document.querySelector('header.header');
  const out = [];
  if (!header) return out;
  const desktop = header.querySelector('img.header__logo--desktop') || header.querySelector('.header__logoLink img');
  const mobile = header.querySelector('img.header__logo--mobile');
  if (desktop) out.push(imageParagraph(document, desktop));
  if (mobile) out.push(imageParagraph(document, mobile));
  const homeA = header.querySelector('a.header__mobileLogoIcon') || header.querySelector('a.header__logoLink');
  const home = (homeA && homeA.getAttribute('href')) || `${LIVE_ORIGIN}${SITE_ROOT}`;
  const homeLabel = label(header.querySelector('.header__mobileLogoIcon .header__a11y'))
    || norm(homeA && homeA.getAttribute('title')) || 'Home';
  const homeIcon = iconFor(header.querySelector('.header__mobileLogoIcon img'));
  out.push(el(document, 'p', {}, link(document, home, `:${homeIcon}: ${homeLabel}`)));
  const skip = document.querySelector('a.navigation__skip');
  if (skip) out.push(el(document, 'p', {}, link(document, skip.getAttribute('href') || '#main-content', label(skip))));
  return out;
}

function toolsSection(document) {
  const header = document.querySelector('header.header');
  if (!header) return [];
  const items = [];
  const searchBox = header.querySelector('atomic-search-box[redirection-url]');
  const searchToggle = header.querySelector('.header__searchToggle');
  const searchLabel = norm(searchToggle && (searchToggle.getAttribute('title') || label(searchToggle))) || 'Search';
  const searchHref = (searchBox && searchBox.getAttribute('redirection-url')) || `${LIVE_ORIGIN}${SITE_ROOT}/search`;
  items.push(link(document, searchHref, searchLabel));

  const region = header.querySelector('.language__trigger, [data-modal-open="region-modal"]');
  if (region) items.push(link(document, '#region-select', label(region)));

  // CPS auth buttons open live CPS dialogs: Log in -> its data-redirect (the dashboard,
  // login area), Register -> the live page that hosts the register dialog (the site home)
  const login = header.querySelector('.header__cps-auth-group--logout [data-auth="login"]');
  if (login) {
    const href = login.getAttribute('data-redirect') || `${LIVE_ORIGIN}${SITE_ROOT}/dashboard`;
    items.push(link(document, href, norm(login.getAttribute('title')) || label(login), { live: href }));
  }
  const register = header.querySelector('.header__cps-auth-group--logout [data-auth="register"]');
  if (register) {
    const homeUrl = document.body.getAttribute('data-homepage-url') || `${LIVE_ORIGIN}${SITE_ROOT}`;
    items.push(link(document, homeUrl, norm(register.getAttribute('title')) || label(register), { bold: true, live: homeUrl }));
  }
  const menu = header.querySelector('.header__menuToggle');
  if (menu) {
    const open = menu.getAttribute('data-open-site-navigation') || 'Open Site Navigation';
    const close = menu.getAttribute('data-close-site-navigation') || 'Close Site Navigation';
    items.push(`${open} | ${close}`);
  }
  return [el(document, 'ul', {}, items.map((i) => el(document, 'li', {}, i)))];
}

function railSection(document) {
  const sidebar = document.querySelector('nav.sidebar');
  if (!sidebar) return [];
  const list = el(document, 'ul');
  sidebar.querySelectorAll(':scope > ul > li.sidebar__element').forEach((li) => {
    if (li.classList.contains('sidebar__element--mobile')) return; // region item: built from tools
    const a = li.querySelector(':scope > a.sidebar__link');
    const button = li.querySelector(':scope > button.sidebar__link');
    const img = li.querySelector('.sidebar__mainIcon--unselected') || li.querySelector('img');
    const name = iconFor(img);
    const text = label(li.querySelector('.sidebar__link > span')) || label(a || button);
    const item = el(document, 'li');
    if (a) item.append(link(document, a.getAttribute('href'), `:${name}: ${text}`));
    else item.append(document.createTextNode(`:${name}: ${text}`));
    const sub = li.querySelector(':scope > ul.subnav');
    if (sub) {
      const subList = el(document, 'ul');
      sub.querySelectorAll(':scope > li a[href]').forEach((s) => {
        subList.append(el(document, 'li', {}, link(document, s.getAttribute('href'), label(s))));
      });
      item.append(subList);
    }
    list.append(item);
  });
  return [list];
}

function bannerSection(document) {
  return [...document.querySelectorAll('.siteBanner .siteBanner__item')].map((item) => {
    const p = el(document, 'p');
    p.append(document.createTextNode(label(item.querySelector('.siteBanner__text') || item)));
    item.querySelectorAll('a.siteBanner__link[href]').forEach((a) => {
      p.append(document.createTextNode(' '), link(document, a.getAttribute('href'), label(a)));
    });
    return p;
  });
}

export default function parseNav(document) {
  return sections(document, [
    brandSection(document),
    toolsSection(document),
    railSection(document),
    bannerSection(document),
  ]);
}
