/*
 * Feature block (replaces marketingSection, featureKicker, featureBanner).
 *
 * DA authoring tables:
 *
 * | Feature (marketing[, navy|purple|green|blue|white][, overlap][, short]) |      |
 * | (opt) icon image 48px / ## A passion for providing *solutions* / p / (opt) link | image |
 *
 * | Feature (kicker) |                                                             |
 * | ## Title / authors list / p / link "Read more"                     | image      |
 *   Authors list item: [photo] **Name, CFA**, Position
 *
 * | Feature (banner[, overlap]) |                                                  |
 * | ## **Local insight, global reach** / p                | desktop image / (opt) mobile image |
 *
 * Authored nodes stay in place (Canvas edits them): the block is the frame, its row is
 * display: contents, the cells are `feature-content` / `feature-image`; a plain link alone
 * in its paragraph is the arrow link (`a.link-cta`, set by decorateButtons).
 */
import { isMediaCell } from '../../scripts/block-utils.js';

const COLOURS = ['navy', 'purple', 'green', 'blue', 'white'];

function classifyCells(block) {
  let content = null;
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    if (isMediaCell(cell)) {
      cell.classList.add('feature-image');
      if (cell.querySelectorAll('picture').length > 1) block.classList.add('has-mobile-media');
    } else if (cell.textContent.trim() || cell.querySelector('picture')) {
      cell.classList.add('feature-content');
      content = content || cell;
      [...cell.children].forEach((el) => {
        if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
      });
    }
  });
  return content;
}

export default function decorate(block) {
  const kicker = block.classList.contains('kicker');
  const banner = block.classList.contains('banner');
  if (!kicker && !banner) {
    block.classList.add('marketing');
    if (!COLOURS.some((c) => block.classList.contains(c))) block.classList.add('navy');
  }
  const content = classifyCells(block);
  if (!content || kicker || banner) return;

  // marketing: icon = picture-only first paragraph; the block is a labelled region
  const first = content.firstElementChild;
  if (first && first.querySelector('picture') && !first.textContent.trim()) block.classList.add('has-icon');
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.id = heading.id || `feature-title-${Math.random().toString(36).slice(2, 8)}`;
    block.setAttribute('role', 'region');
    block.setAttribute('aria-labelledby', heading.id);
  }
}
