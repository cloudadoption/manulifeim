/*
 * Case Study Sidebar block (replaces caseStudyDetail__sidebar).
 *
 * DA authoring table:
 *
 * | Case Study Sidebar |                                                        |
 * | logo image         |                                                        |
 * | link "Explore all our ESG case studies" → /sustainable-investing-case-studies |
 * | Tags               | Natural resources, Timber, Biodiversity, Environmental, Agriculture |
 *
 * Tags may be plain text (comma-separated or one per paragraph/list item) or links.
 * Plain tags link to `{listing}?theme={slug}` where listing = the "Explore" link
 * path (default /sustainable-investing-case-studies).
 */
import { toClassName } from '../../scripts/aem.js';

const DEFAULT_LISTING = '/sustainable-investing-case-studies';

export default function decorate(block) {
  let logo = null;
  let link = null;
  let tags = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (key === 'tags' && cells.length >= 2) {
      const value = cells.slice(1);
      value.forEach((cell) => {
        const anchors = [...cell.querySelectorAll('a[href]')];
        if (anchors.length) {
          anchors.forEach((a) => tags.push({ label: a.textContent.trim(), href: a.getAttribute('href') }));
          return;
        }
        const parts = cell.querySelectorAll('li, p').length
          ? [...cell.querySelectorAll('li, p')].map((el) => el.textContent)
          : cell.textContent.split(',');
        parts.flatMap((t) => t.split(',')).map((t) => t.trim()).filter((t) => t)
          .forEach((label) => tags.push({ label }));
      });
      return;
    }
    const pic = row.querySelector('picture');
    if (pic && !logo) {
      logo = pic;
      return;
    }
    const a = row.querySelector('a[href]');
    if (a && !link) link = a;
  });

  let listing = DEFAULT_LISTING;
  if (link) {
    try {
      listing = new URL(link.href, window.location.href).pathname.replace(/\/$/, '') || DEFAULT_LISTING;
    } catch (e) {
      // keep default
    }
  }
  tags = tags.map((t) => ({ ...t, href: t.href || `${listing}?theme=${toClassName(t.label)}` }));

  const aside = document.createElement('aside');
  aside.className = 'case-study-sidebar-inner';
  if (logo) {
    const logoWrap = document.createElement('div');
    logoWrap.className = 'case-study-sidebar-logo';
    const figure = document.createElement('figure');
    figure.append(logo);
    logoWrap.append(figure);
    aside.append(logoWrap);
  }
  if (link) {
    const p = document.createElement('p');
    p.className = 'case-study-sidebar-link';
    const a = document.createElement('a');
    a.className = 'case-study-sidebar-link-anchor';
    a.href = link.getAttribute('href');
    if (link.target) a.target = link.target;
    const span = document.createElement('span');
    span.textContent = link.textContent.trim();
    a.append(span);
    p.append(a);
    aside.append(p);
  }
  if (tags.length) {
    const wrap = document.createElement('div');
    wrap.className = 'case-study-sidebar-tags';
    const ul = document.createElement('ul');
    ul.className = 'case-study-sidebar-pills';
    tags.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'case-study-sidebar-pill';
      const a = document.createElement('a');
      a.className = 'case-study-sidebar-pill-link';
      a.href = t.href;
      a.textContent = t.label;
      li.append(a);
      ul.append(li);
    });
    wrap.append(ul);
    aside.append(wrap);
  }
  block.replaceChildren(aside);
}
