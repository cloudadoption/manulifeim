/* eslint-disable */
/*
 * Parser: live footer.footer -> DA document /footer (read by blocks/footer).
 *   section 1     logo image, then one list per live menu (primary, secondary)
 *   section 2     legal text (.footer__copyrights--header paragraphs)
 *   section 3..5  one section per .footer__copyrights__element column (live: the bold links
 *                 column, a column of two empty paragraphs, an empty column)
 * Empty live paragraphs (&nbsp;) are kept as a zero-width space (markdown drops blank ones), so
 * the spacing matches live; a live column without any paragraph stays an empty section.
 */
import {
  el, label, imageParagraph, link, sections, norm,
} from './chrome-shared.js';

const EMPTY = '\u200b';

function paragraphs(document, container) {
  if (!container) return [];
  return [...container.children]
    .filter((n) => /^(P|H[1-6]|UL|OL)$/.test(n.tagName))
    .map((n) => {
      const clone = n.cloneNode(true);
      clone.querySelectorAll('svg, script, style').forEach((x) => x.remove());
      [clone, ...clone.querySelectorAll('*')].forEach((x) => {
        ['class', 'style', 'id', 'draggable'].forEach((a) => x.removeAttribute(a));
      });
      if (!norm(clone.textContent) && !clone.querySelector('img')) clone.textContent = EMPTY;
      return clone;
    });
}

export default function parseFooter(document) {
  const footer = document.querySelector('footer.footer');
  if (!footer) return sections(document, [[]]);
  const upper = [];
  const logo = footer.querySelector('.footer__upper-part__image img');
  // live alt is "John Hancock Investments " on the Manulife IM logo
  if (logo) upper.push(imageParagraph(document, logo, 'Manulife Investment Management'));
  footer.querySelectorAll('.footer__upper-part__menus > ul').forEach((ul) => {
    const list = el(document, 'ul');
    ul.querySelectorAll(':scope > li a[href]').forEach((a) => {
      list.append(el(document, 'li', {}, link(document, a.getAttribute('href'), label(a))));
    });
    upper.push(list);
  });
  const columns = [...footer.querySelectorAll('.footer__copyrights__element')].map((c) => {
    const nodes = paragraphs(document, c);
    return nodes;
  });
  return sections(document, [upper, paragraphs(document, footer.querySelector('.footer__copyrights--header')), ...columns]);
}
