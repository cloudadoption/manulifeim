/* eslint-disable max-len */
/*
 * Author block (replaces author-container and manager-logo).
 *
 * DA authoring table (one row per author; optional asset-manager logo row):
 *
 * | Author[ (inline)] |                                                                |
 * | photo             | **Craig Scordellis** / Co-Chief Investment Officer, … / Manulife \| CQS Investment Management / link "Read bio" |
 * | logo image        | link → /viewpoints/assetManager/manulife-cqs-investment-management (logo row: no name) |
 *
 * Text cell: paragraphs in the order name, title, company, link.
 * Rows and cells get classes, the authored paragraphs stay as they are (Canvas edits them
 * in place); CSS styles them by position. On the logo row the link covers the logo and
 * its text is the accessible name.
 */
/* eslint-enable max-len */
import { isMediaCell } from '../../scripts/block-utils.js';

export default function decorate(block) {
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const media = cells.find(isMediaCell);
    const text = cells.find((c) => c !== media && c.textContent.trim());
    const links = text ? [...text.querySelectorAll('a[href]')] : [];
    // logo row: picture + a link only
    const linkOnly = links.length === 1 && text.textContent.trim() === links[0].textContent.trim();
    if (media && (!text || linkOnly)) {
      row.classList.add('author-manager-logo');
      media.classList.add('author-logo');
      text?.classList.add('author-logo-link');
      return;
    }
    row.classList.add('author-container');
    if (media) {
      media.classList.add('author-photo');
      media.querySelectorAll('img').forEach((img) => {
        img.addEventListener('error', () => media.classList.add('image-hidden'));
      });
    }
    text?.classList.add('author-text');
  });
}
