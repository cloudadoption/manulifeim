/* eslint-disable */
/* global WebImporter */
/*
 * Parser: social-links. Live: .social ("Stay connected" tiles; author profile LinkedIn).
 * Project contract (block-authoring.md, blocks/social-links/social-links.js):
 *   | Social Links |
 *   | icon image (Icon_Linkedin.svg) | [Manulife Investment Management](https://www.linkedin.com/...) |
 */
import {
  image, block, text, linkParagraph,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [...element.querySelectorAll('a.social__link, .social__item a')].map((a) => {
    const icon = image(document, a.querySelector('img'), '');
    const label = text(a.querySelector('.social__label')) || text(a);
    return [icon || '', linkParagraph(document, a.getAttribute('href'), label)];
  });
  element.replaceWith(block(document, 'Social Links', [], rows));
}
