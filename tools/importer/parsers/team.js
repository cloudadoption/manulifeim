/* eslint-disable */
/* global WebImporter */
/*
 * Parser: team. Live: .teamMembers (strategy "Managed by", team pages, author profile).
 * Project contract (block-authoring.md, blocks/team/team.js):
 *   | Team |
 *   | photo | #### Name / p Title / bio paragraphs / list: **Education:** ..., **Joined the company:** ..., **Began career:** ... |
 * The live read-more markup (TeamMemberReadMore) is not imported; the block rebuilds it.
 * A LinkedIn link in the bio stays as the profile link.
 */
import {
  h, image, block, text, richText,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [...element.querySelectorAll('.teamMembers__member')].map((m) => {
    const content = [];
    const name = m.querySelector('.teamMembers__name');
    if (text(name)) content.push(h(document, 'h4', text(name)));
    const title = m.querySelector('.teamMembers__title');
    if (text(title)) content.push(h(document, 'p', title.innerHTML.trim()));
    const bio = m.querySelector('.teamMembers__bio');
    if (bio) content.push(...richText(document, bio));
    m.querySelectorAll('a[href*="linkedin.com"]').forEach((a) => {
      if (!bio || !bio.contains(a)) {
        const p = h(document, 'p');
        const link = document.createElement('a');
        link.setAttribute('href', a.getAttribute('href'));
        link.textContent = text(a) || 'LinkedIn';
        p.append(link);
        content.push(p);
      }
    });
    const photo = image(document, m.querySelector('.teamMembers__photo, .teamMembers__photoWrapper img'));
    return [photo || '', content];
  });
  element.replaceWith(block(document, 'Team', [], rows));
}
