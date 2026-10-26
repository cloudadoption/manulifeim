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
 */
/* eslint-enable max-len */
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

export default function decorate(block) {
  const card = document.createElement('div');
  card.className = 'team-card';
  const bios = [];

  [...block.children].forEach((row) => {
    const article = document.createElement('article');
    article.className = 'team-member';
    const content = document.createElement('div');
    content.className = 'team-content';
    const photoWrap = document.createElement('div');
    photoWrap.className = 'team-photo';

    const body = document.createElement('div');
    [...row.children].forEach((cell) => {
      if (cell.querySelector('picture') && !cell.textContent.trim()) {
        if (!photoWrap.children.length) photoWrap.append(cell.querySelector('picture'));
      } else {
        body.append(...cell.childNodes);
      }
    });
    if (!photoWrap.children.length) {
      const p = [...body.children].find((el) => el.querySelector('picture') && !el.textContent.trim());
      if (p) {
        photoWrap.append(p.querySelector('picture'));
        p.remove();
      }
    }
    [...body.children].forEach((el) => {
      if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
    });

    let nameEl = body.querySelector('h1, h2, h3, h4, h5, h6');
    if (!nameEl) {
      const first = body.firstElementChild;
      if (first && first.querySelector('strong, b') && first.textContent.trim() === first.querySelector('strong, b').textContent.trim()) {
        nameEl = document.createElement('h4');
        nameEl.textContent = first.textContent.trim();
        first.replaceWith(nameEl);
      }
    }
    const header = document.createElement('header');
    header.className = 'team-header';
    let titleEl = null;
    if (nameEl) {
      const children = [...body.children];
      titleEl = children[children.indexOf(nameEl) + 1];
      if (titleEl && titleEl.tagName !== 'P') titleEl = null;
      nameEl.classList.add('team-name');
      header.append(nameEl);
      if (titleEl) {
        const t = document.createElement('div');
        t.className = 'team-title';
        t.innerHTML = titleEl.innerHTML;
        titleEl.remove();
        header.append(t);
      }
    }

    // LinkedIn link
    const linkedin = [...body.querySelectorAll('a[href*="linkedin.com"]')]
      .find((a) => a.closest('p') && a.closest('p').textContent.trim() === a.textContent.trim());
    if (linkedin) {
      const p = linkedin.closest('p');
      linkedin.className = 'team-linkedin';
      p.replaceWith(linkedin);
      header.append(linkedin);
    }

    const bio = document.createElement('div');
    bio.className = 'team-bio';
    bio.append(...body.childNodes);
    content.append(header);
    if (bio.textContent.trim()) {
      content.append(bio);
      bios.push(bio);
    }

    if (photoWrap.children.length) {
      const img = photoWrap.querySelector('img');
      if (img && !img.alt && nameEl) img.alt = nameEl.textContent.trim();
    }
    article.append(content, photoWrap);
    card.append(article);
  });

  block.replaceChildren(card);
  bios.forEach((bio) => setupCollapse(bio));
}
