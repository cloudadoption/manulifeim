/*
 * Footer: live `footer.footer`, built from the DA document /footer.
 *
 * /footer sections (see migration-work/analysis/chrome.md):
 *   1 upper     logo image, then one list per menu (1st = primary, 2nd = secondary)
 *   2 legal     copyright / legal paragraphs (live .footer__copyrights--header)
 *   3..n        one section per legal column (live .footer__copyrights__element),
 *               typically bold links; live renders three columns, the last two empty
 */
import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

function el(tag, cls, ...children) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  children.flat().filter(Boolean).forEach((c) => e.append(c));
  return e;
}

const contentOf = (section) => (section && section.querySelector('.default-content-wrapper')) || section;

/** External links (not this site, not www.manulifeim.com) open in a new tab, as live. */
function decorateLinks(root) {
  root.querySelectorAll('a[href]').forEach((a) => {
    let url;
    try {
      url = new URL(a.getAttribute('href'), window.location.href);
    } catch (e) {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    if (url.origin === window.location.origin || /(^|\.)manulifeim\.com$/i.test(url.hostname)) return;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', `${a.textContent.trim()} (opens in a new tab)`);
  });
}

function buildUpper(section) {
  const upper = el('div', 'footer-upper');
  if (!section) return upper;
  const root = contentOf(section);
  const picture = root.querySelector('picture, img');
  if (picture) {
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    if (img) {
      img.loading = 'lazy';
      img.draggable = false;
    }
    upper.append(el('div', 'footer-logo', picture));
  }
  const menus = el('nav', 'footer-menus');
  menus.setAttribute('aria-label', 'footer navigation');
  [...root.querySelectorAll(':scope > ul, :scope > ol')].forEach((list, i) => {
    const menu = el('ul', `footer-menu ${i === 0 ? 'footer-menu-primary' : 'footer-menu-secondary'}`);
    [...list.children].forEach((li) => {
      const item = el('li', 'footer-menu-item');
      while (li.firstChild) item.append(li.firstChild);
      menu.append(item);
    });
    menus.append(menu);
  });
  if (menus.children.length) upper.append(menus);
  return upper;
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);
  const sections = fragment ? [...fragment.querySelectorAll(':scope > .section')] : [];

  block.textContent = '';
  block.append(buildUpper(sections[0]));
  block.append(el('hr', 'footer-divider'));

  const copyrights = el('div', 'footer-copyrights');
  if (sections[1]) {
    const legal = el('div', 'footer-legal');
    legal.append(...contentOf(sections[1]).childNodes);
    copyrights.append(legal);
  }
  const columns = el('div', 'footer-columns');
  sections.slice(2).forEach((section) => {
    const column = el('div', 'footer-column');
    column.append(...contentOf(section).childNodes);
    columns.append(column);
  });
  if (columns.children.length) copyrights.append(columns);
  block.append(copyrights);

  // footer links are text links: undo decorateButtons and restore the authored bold / italic
  block.querySelectorAll('.button-wrapper, .button-container').forEach((p) => p.classList.remove('button-wrapper', 'button-container'));
  block.querySelectorAll('a.button').forEach((a) => {
    const bold = a.classList.contains('primary') || a.classList.contains('accent');
    const italic = a.classList.contains('secondary') || a.classList.contains('accent');
    a.classList.remove('button', 'primary', 'secondary', 'accent');
    if (!a.className) a.removeAttribute('class');
    let node = a;
    [[italic, 'em'], [bold, 'strong']].forEach(([on, tag]) => {
      if (!on) return;
      const wrap = document.createElement(tag);
      node.replaceWith(wrap);
      wrap.append(node);
      node = wrap;
    });
  });
  decorateLinks(block);
}
