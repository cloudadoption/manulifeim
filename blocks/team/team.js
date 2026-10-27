/* eslint-disable max-len */
/*
 * Team block (replaces teamMembers): member cards with photo, name, title and bio.
 *
 * DA authoring table (one row per member):
 *
 * | Team  |                                                                         |
 * | photo | #### Kenglin Tan / Senior Portfolio Manager, Asia ex-Japan Equity (p) / bio paragraphs / list: **Education:** …, **Joined the company:** 2006, **Began career:** 2000 |
 *
 * Without a heading, the first bold paragraph is the name. Bios taller than 112px
 * collapse with a "Read more" / "Collapse" toggle (live TeamMemberReadMore).
 * An optional LinkedIn link (linkedin.com) in the text cell becomes the profile link.
 *
 * Rows and cells get classes (team-member, team-photo, team-content); the name and title
 * are the first two elements of the text cell and styled by position. On pages the bio
 * paragraphs move into a collapsible .team-bio; in Canvas nothing moves.
 */
/* eslint-enable max-len */
import isAuthoring from '../../scripts/authoring.js';
import { isMediaCell } from '../../scripts/block-utils.js';

const COLLAPSED_HEIGHT = 112;

function buildToggle(bio) {
  const details = document.createElement('details');
  details.className = 'team-read-more';
  const summary = document.createElement('summary');
  summary.className = 'team-read-more-trigger';
  summary.setAttribute('aria-label', 'Read more');
  const more = document.createElement('span');
  more.className = 'team-more';
  const plus = document.createElement('span');
  plus.className = 'team-toggle-icon team-icon-plus';
  plus.setAttribute('aria-hidden', 'true');
  more.append(plus, document.createTextNode('Read more'));
  summary.append(more);
  const content = document.createElement('div');
  content.className = 'team-read-more-content';
  const less = document.createElement('button');
  less.type = 'button';
  less.className = 'team-less';
  const minus = document.createElement('span');
  minus.className = 'team-toggle-icon team-icon-minus';
  minus.setAttribute('aria-hidden', 'true');
  less.append(minus, document.createTextNode('Collapse'));
  content.append(less);
  details.append(summary, content);

  details.addEventListener('toggle', () => {
    bio.classList.toggle('team-bio-collapsed', !details.open);
    summary.setAttribute('aria-label', details.open ? 'Collapse' : 'Read more');
  });
  less.addEventListener('click', () => {
    details.open = false;
    summary.focus();
  });
  return details;
}

function setupCollapse(bio) {
  const evaluate = () => {
    if (!bio.isConnected || !bio.offsetHeight) return false;
    if (bio.scrollHeight > COLLAPSED_HEIGHT + 1) {
      bio.classList.add('team-bio-collapsed');
      bio.after(buildToggle(bio));
    }
    return true;
  };
  if (evaluate()) return;
  // sections are hidden until loaded: measure once the bio has a size
  const ro = new ResizeObserver(() => {
    if (evaluate()) ro.disconnect();
  });
  ro.observe(bio);
}

/** A paragraph holding only a LinkedIn link (the profile link next to the name). */
function isLinkedin(el) {
  const a = el.querySelector('a[href*="linkedin.com"]');
  return !!a && el.textContent.trim() === a.textContent.trim();
}

export default function decorate(block) {
  const bios = [];
  [...block.children].forEach((row) => {
    row.classList.add('team-member');
    row.setAttribute('role', 'article');
    let content = null;
    [...row.children].forEach((cell) => {
      if (isMediaCell(cell)) cell.classList.add('team-photo');
      else if (!content) {
        content = cell;
        cell.classList.add('team-content');
      }
    });
    if (!content) return;
    [...content.children].forEach((el) => {
      if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
    });
    const name = content.firstElementChild;
    const img = row.querySelector('.team-photo img');
    if (img && !img.alt && name) img.alt = name.textContent.trim();
    const linkedin = [...content.children].find(isLinkedin);
    linkedin?.classList.add('team-linkedin');
    // Canvas: the paragraphs stay as authored; the read-more collapse is for pages only
    if (isAuthoring()) return;
    const kids = [...content.children].filter((k) => k !== linkedin);
    const titled = kids[1] && kids[1].tagName === 'P';
    const bioEls = kids.slice(titled ? 2 : 1);
    if (bioEls.some((e) => e.textContent.trim())) {
      const bio = document.createElement('div');
      bio.className = 'team-bio';
      bioEls[0].before(bio);
      bio.append(...bioEls);
      bios.push(bio);
    }
  });
  bios.forEach((bio) => setupCollapse(bio));
}
