/* eslint-disable */
/* global WebImporter */
/*
 * Parser: cards-tiles. Live: .infoContainer (InfoCard) on all plain pages; also the
 * press-release archive notice (oneColumn).
 * Project contract (block-authoring.md, blocks/cards/cards.js); same row shape as the
 * library Cards / Cards (no images):
 *   | Cards (tiles[, one|two|three|four][, overlap][, facts]) |
 *   | (opt) image | ## Title / p / (opt) [Learn more](...) |   (one row per tile)
 * Columns: oneColumn -> one, threeColumns -> three, fourColumns -> four, none -> (two, default).
 * overlapping-component -> overlap. Tiles of p label + h3 value -> facts.
 */
import {
  image, linkFrom, block, richText,
} from '../utils/dom.js';

const COLS = { oneColumn: 'one', twoColumns: '', threeColumns: 'three', fourColumns: 'four' };

export default function parse(element, { document }) {
  const tilesEl = element.querySelector('.infoContainer__tiles');
  const variants = ['tiles'];
  const m = tilesEl && tilesEl.className.match(/infoContainer__tiles--(\w+)/);
  if (m && COLS[m[1]]) variants.push(COLS[m[1]]);
  if (element.classList.contains('overlapping-component')) variants.push('overlap');

  const tiles = [...element.querySelectorAll('.infoContainer__tile')];
  const facts = tiles.length > 0 && tiles.every((t) => {
    const kids = [...(t.querySelector('.text') || t).querySelectorAll('p, h1, h2, h3, h4, h5, h6')];
    return kids.length === 2 && kids[0].tagName === 'P' && kids[1].tagName === 'H3' && !t.querySelector('img');
  });
  if (facts) variants.push('facts');

  const rows = tiles.map((tile) => {
    const img = image(document, tile.querySelector(':scope > img, .infoContainer__image'));
    const content = [];
    tile.querySelectorAll(':scope > .text, :scope > .rtf, :scope > div:not(.infoContainer__image)').forEach((t) => {
      content.push(...richText(document, t));
    });
    tile.querySelectorAll(':scope > a').forEach((a) => content.push(linkFrom(document, a)));
    const cellContent = content.filter(Boolean);
    return img ? [img, cellContent] : [cellContent];
  }).filter((r) => r.flat().length);

  element.replaceWith(block(document, 'Cards', variants, rows));
}
