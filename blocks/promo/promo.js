/*
 * Promo block (replaces simpleBanner): coloured promo banner, one or two items.
 *
 * DA authoring table (one row per item; `double` = two items side by side):
 *
 * | Promo[ (green|navy|blue|gold|violet|white)][ (double)] |                   |                  |
 * | image | ## Sustainable Asia Bond / p / link "Learn more"   | (opt) colour, e.g. blue |
 *
 * Colour: per-row third cell, else block variant, else green.
 * Rows become promo items and cells promo-image / promo-content / promo-colour in place
 * (Canvas edits them); a plain link alone in its paragraph is the arrow link.
 */
import { isMediaCell } from '../../scripts/block-utils.js';

const COLOURS = ['green', 'navy', 'blue', 'gold', 'violet', 'white'];

export default function decorate(block) {
  const blockColour = COLOURS.find((c) => block.classList.contains(c)) || 'green';
  const rows = [...block.children];
  rows.forEach((row) => {
    let colour = blockColour;
    let picture = false;
    [...row.children].forEach((cell) => {
      const text = cell.textContent.trim().toLowerCase();
      if (!cell.querySelector('picture') && COLOURS.includes(text)) {
        colour = text;
        cell.classList.add('promo-colour');
      } else if (isMediaCell(cell) && !picture) {
        picture = true;
        cell.classList.add('promo-image');
      } else {
        cell.classList.add('promo-content');
        [...cell.children].forEach((el) => {
          if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
        });
        const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
          heading.id = heading.id || `promo-title-${Math.random().toString(36).slice(2, 8)}`;
          cell.setAttribute('role', 'region');
          cell.setAttribute('aria-labelledby', heading.id);
        }
      }
    });
    row.classList.add('promo-item', `promo-${colour}`);
    if (!picture) row.classList.add('promo-no-image');
  });
  if (rows.length > 1) block.classList.add('double');
}
