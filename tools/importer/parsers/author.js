/* eslint-disable */
/* global WebImporter */
/*
 * Parser: author. Live: article sidebar .author-container(s) + .manager-logo, grouped by
 * the page model into div.mim-authors.
 * Project contract (block-authoring.md, blocks/author/author.js):
 *   | Author |
 *   | photo | **Name** / Title / Company / [Read bio](/viewpoints/<slug>) |   (one row per author)
 *   | asset manager logo | [Manulife | CQS Investment Management](/viewpoints/assetManager/<slug>) |
 * Read bio and asset-manager links are rewritten to /viewpoints/all?author= / ?assetManager=.
 */
import {
  h, image, block, text, parseAuthorContainer, linkParagraph, norm,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [];
  [...element.children].forEach((c) => {
    if (c.classList.contains('author-container')) {
      const a = parseAuthorContainer(c);
      if (!a.name) return;
      const content = [h(document, 'p', h(document, 'strong', document.createTextNode(a.name)))];
      if (a.title) content.push(h(document, 'p', document.createTextNode(a.title)));
      if (a.company) content.push(h(document, 'p', document.createTextNode(a.company)));
      const bio = c.querySelector('a.author-container__link');
      if (bio) content.push(linkParagraph(document, bio.getAttribute('href'), text(bio) || 'Read bio'));
      const photo = image(document, c.querySelector('img'));
      rows.push([photo || '', content.filter(Boolean)]);
    } else if (c.classList.contains('manager-logo')) {
      const a = c.querySelector('a[href]');
      const img = c.querySelector('img');
      const name = norm(img ? img.getAttribute('alt') : '') || text(a);
      rows.push([image(document, img) || '', a ? linkParagraph(document, a.getAttribute('href'), name) : name]);
    }
  });
  element.replaceWith(block(document, 'Author', [], rows));
}
