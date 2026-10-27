/*
 * Figure block (replaces landingImage2 / LandingImageCard, image with caption).
 *
 * DA authoring table (single column):
 *
 * | Figure[ (card)][ (top|left|right)] |
 * | **Yields to expected maturity …** (rich text above the image, optional) |
 * | image (chart svg/png)                                                   |
 * | Source: Manulife \| CQS, ICE, Bloomberg, … (caption, optional)          |
 *
 * Rows before the image row = text, rows after it = caption.
 * An optional second picture in the image row is used as the mobile image (≤800px).
 *
 * The cells stay in place (Canvas edits them): `figure-content`, `figure-image`,
 * `figure-caption`; CSS lays them out.
 */
import { isMediaCell } from '../../scripts/block-utils.js';

export default function decorate(block) {
  let imageSeen = false;
  let text = false;
  let caption = null;
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    if (!imageSeen && isMediaCell(cell)) {
      imageSeen = true;
      cell.classList.add('figure-image');
      if (cell.querySelectorAll('picture').length > 1) block.classList.add('has-mobile-media');
    } else if (!imageSeen) {
      cell.classList.add('figure-content');
      [...cell.children].forEach((el) => {
        if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
      });
      text = text || !!cell.textContent.trim();
    } else if (cell.textContent.trim()) {
      cell.classList.add('figure-caption');
      caption = caption || cell;
    }
  });
  if (!text) block.classList.add('no-text');
  block.setAttribute('role', 'figure');
  if (caption) {
    caption.id = caption.id || `figure-caption-${Math.random().toString(36).slice(2, 8)}`;
    block.setAttribute('aria-labelledby', caption.id);
  }
}
