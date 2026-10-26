/* eslint-disable */
/* global WebImporter */
/*
 * Parser: section-nav-anchors. Live: .innerNavigationBar > .landingNav (LandingNav).
 * Project contract (block-authoring.md, blocks/section-nav/section-nav.js):
 *   | Section Nav (anchors[, left]) |      (no rows: the block collects the following
 *                                          sections with Section Metadata Nav Title / Id)
 * The live anchors (landingNav__trigger) are not imported: every live sectionBreak becomes
 * Section Metadata Id + Nav Title (page model). landingNav__list--left -> left.
 */
import { block } from '../utils/dom.js';

export default function parse(element, { document }) {
  const variants = ['anchors'];
  if (element.querySelector('.landingNav__list--left')) variants.push('left');
  element.replaceWith(block(document, 'Section Nav', variants, []));
}
