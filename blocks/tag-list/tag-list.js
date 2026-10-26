/*
 * Tag List block (replaces viewpoint-tags "All Tags"): collapsible tag links in columns.
 *
 * DA authoring table:
 *
 * | Tag List |
 *   (no rows) → tags and counts are built from /query-index.json (`tags` column),
 *   linking to /viewpoints/tag/{slug}.
 *
 * Optional rows:
 * | Title | All Tags |
 * | list of links "Asia (173)" → /viewpoints/tag/asia   (static tags; used instead of the index) |
 */
import { toClassName } from '../../scripts/aem.js';
import { fetchIndex, splitList } from '../../scripts/block-utils.js';

function buildList(tags) {
  const ul = document.createElement('ul');
  ul.className = 'tag-list-list';
  tags.forEach(({ label, href }) => {
    const li = document.createElement('li');
    li.className = 'tag-list-item';
    const a = document.createElement('a');
    a.className = 'tag-list-link';
    a.href = href;
    a.textContent = label;
    li.append(a);
    ul.append(li);
  });
  return ul;
}

export default async function decorate(block) {
  let title = 'All Tags';
  let base = '/viewpoints/tag/';
  const authored = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length >= 2 && key === 'title' && !cells[1].querySelector('a')) {
      title = cells[1].textContent.trim() || title;
      return;
    }
    if (cells.length >= 2 && key === 'base' && !cells[1].querySelector('a')) {
      base = cells[1].textContent.trim() || base;
      return;
    }
    row.querySelectorAll('a[href]').forEach((a) => {
      authored.push({ label: a.textContent.trim(), href: a.getAttribute('href') });
    });
  });

  const details = document.createElement('details');
  details.className = 'tag-list-details';
  details.open = true;
  const summary = document.createElement('summary');
  const h2 = document.createElement('h2');
  h2.className = 'tag-list-title';
  h2.textContent = title;
  summary.append(h2);
  details.append(summary);
  block.replaceChildren(details);

  let tags = authored;
  if (!tags.length) {
    const index = await fetchIndex();
    const counts = new Map();
    index.forEach((entry) => {
      splitList(entry.tags).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    tags = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }))
      .map(([tag, count]) => ({
        label: `${tag} (${count})`,
        href: `${base.replace(/\/?$/, '/')}${toClassName(tag)}`,
      }));
  }
  details.append(buildList(tags));
}
