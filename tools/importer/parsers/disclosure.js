/* eslint-disable */
/* global WebImporter */
/*
 * Parser: disclosure. Live: .disclosures > details.disc / div.disc (Disclosure) and
 * .viewpointDisclaimer (older articles, "Important Disclosures" dropdown).
 * Project contract (block-authoring.md, blocks/disclosure/disclosure.js):
 *   | Disclosure[ (inset)][ (open)] |
 *   | Important disclosures | rich text (p, lists, small, sup, links; last line = approval code) |
 * disc--inset (and viewpointDisclaimer) -> inset; disabled trigger (homepage AUM note) -> open.
 */
import { block, richText, text } from '../utils/dom.js';

export default function parse(element, { document }) {
  const variants = [];
  const rows = [];
  if (element.classList.contains('viewpointDisclaimer')) {
    variants.push('inset');
    const label = text(element.querySelector('.viewpoint-disclaimer__toggle')) || 'Important disclosures';
    rows.push([label, richText(document, element.querySelector('.viewpoint-disclaimer__content'))]);
  } else {
    const discs = [...element.querySelectorAll('.disc')];
    discs.forEach((d) => {
      if (d.classList.contains('disc--inset') && !variants.includes('inset')) variants.push('inset');
      if (d.querySelector('.disc__trigger--disabled') && !variants.includes('open')) variants.push('open');
      const label = text(d.querySelector('.disc__label')) || 'Important disclosures';
      rows.push([label, richText(document, d.querySelector('.disc__content'))]);
    });
  }
  element.replaceWith(block(document, 'Disclosure', variants, rows.filter((r) => r[1].length)));
}
