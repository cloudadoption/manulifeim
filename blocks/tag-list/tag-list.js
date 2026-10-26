/*
 * Tag List block (replaces viewpoint-tags "All Tags"): collapsible tag links in columns.
 *
 * DA authoring table:
 *
 * | Tag List |
 *   (no rows) → tags and counts are built from the viewpoints query index (`tags` +
 *   `tagSlugs` columns), linking to /institutional/tw/en/viewpoints/all?tag={slug}
 *   (live /viewpoints/tag/{slug}; the listing block filters by ?tag=).
 *
 * Optional rows:
 * | Title | All Tags |
 * | list of links "Asia (173)" → /viewpoints/tag/asia   (static tags; used instead of the index) |
 */
import { fetchIndex } from '../../scripts/block-utils.js';
import { INDEX_URLS, SITE_ROOT, normalizeEntry } from '../../scripts/listing-core.js';

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
  let base = `${SITE_ROOT}/viewpoints/all?tag=`;
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
    let index = await fetchIndex(INDEX_URLS.viewpoints);
    if (!index.length) index = await fetchIndex();
    const counts = new Map();
    index.map(normalizeEntry).filter((e) => e.template === 'viewpoint').forEach((entry) => {
      entry.tags.forEach((tag, i) => {
        const slug = entry.tagSlugs.length === entry.tags.length ? entry.tagSlugs[i] : '';
        const cur = counts.get(tag) || { count: 0, slug };
        cur.count += 1;
        if (!cur.slug && slug) cur.slug = slug;
        counts.set(tag, cur);
      });
    });
    const slugOf = (t) => t.toLowerCase().replace(/[^0-9a-z]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    tags = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }))
      .map(([tag, { count, slug }]) => ({
        label: `${tag} (${count})`,
        href: base.includes('?') || base.endsWith('=') ? `${base}${encodeURIComponent(slug || slugOf(tag))}`
          : `${base.replace(/\/?$/, '/')}${slug || slugOf(tag)}`,
      }));
  }
  details.append(buildList(tags));
}
