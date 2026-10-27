/*
 * Share block (live share-controls in the article sidebar): share links for the current page.
 *
 * DA authoring table, one row per action in display order (an empty block gets all six):
 *
 * | Share    |
 * | LinkedIn |
 * | Facebook |
 * | Twitter  |
 * | Email    |
 * | Copy     |
 * | Download |
 *
 * A first row that is not an action is the heading (default "Share"). Download prints the
 * page (live generates a PDF on its own server). Nothing is loaded from the networks.
 */
const ACTIONS = {
  linkedin: { label: 'LinkedIn', share: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  facebook: { label: 'Facebook', share: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  twitter: { label: 'Twitter', share: (u) => `https://twitter.com/intent/tweet?url=${u}` },
  email: {
    label: 'Email',
    href: (u) => `mailto:?subject=${encodeURIComponent('I\'d like to share a link with you ')}&body=${u}`,
  },
  copy: { label: 'Copy', button: true },
  download: { label: 'Download', button: true },
};

function icon(name) {
  const img = document.createElement('img');
  img.src = `${window.hlx?.codeBasePath || ''}/icons/share-${name}.svg`;
  img.alt = '';
  img.width = 22;
  img.height = 22;
  img.loading = 'lazy';
  img.className = 'share-icon';
  return img;
}

function caption(text) {
  const span = document.createElement('span');
  span.className = 'share-caption';
  span.textContent = text;
  return span;
}

function buildAction(name, url, status) {
  const a = ACTIONS[name];
  let el;
  if (a.button) {
    el = document.createElement('button');
    el.type = 'button';
    el.addEventListener('click', () => {
      if (name === 'download') {
        window.print();
        return;
      }
      const done = () => { status.textContent = 'Link copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done).catch(() => {});
    });
  } else {
    el = document.createElement('a');
    const enc = encodeURIComponent(url);
    el.href = a.share ? a.share(enc) : a.href(enc);
    if (a.share) {
      el.target = '_blank';
      el.rel = 'noopener';
      el.setAttribute('aria-label', `${a.label} (opens in a new tab)`);
    }
  }
  el.className = 'share-link';
  el.title = a.label;
  el.append(icon(name), caption(a.label));
  const li = document.createElement('li');
  li.className = 'share-item';
  li.append(el);
  return li;
}

export default function decorate(block) {
  let title = 'Share';
  const names = [];
  [...block.children].forEach((row, i) => {
    const value = row.textContent.trim();
    const key = value.toLowerCase();
    if (ACTIONS[key]) names.push(key);
    else if (i === 0 && value) title = value;
  });
  if (!names.length) names.push(...Object.keys(ACTIONS));

  const url = `${window.location.origin}${window.location.pathname}`;
  const heading = document.createElement('h2');
  heading.className = 'share-title';
  heading.textContent = title;
  const status = document.createElement('p');
  status.className = 'share-status';
  status.setAttribute('role', 'status');

  // live: social networks in one row, page actions (email, copy, download) in the next
  const social = names.filter((n) => ACTIONS[n].share);
  const actions = names.filter((n) => !ACTIONS[n].share);
  const lists = [social, actions].filter((l) => l.length).map((list) => {
    const ul = document.createElement('ul');
    ul.className = 'share-list';
    list.forEach((n) => ul.append(buildAction(n, url, status)));
    return ul;
  });
  block.replaceChildren(heading, ...lists, status);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', title);
}
