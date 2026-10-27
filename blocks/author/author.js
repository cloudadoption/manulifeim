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
 * Text cell: paragraphs in the order name, title, company, link (a single paragraph
 * with line breaks also works).
 */
/* eslint-enable max-len */
function lines(cell) {
  const out = [];
  [...cell.children].forEach((el) => {
    if (el.querySelector('picture') && !el.textContent.trim()) return;
    if (el.tagName === 'P' || el.tagName === 'DIV') {
      el.innerHTML.split(/<br\s*\/?>/i).forEach((part) => {
        const tmp = document.createElement('div');
        tmp.innerHTML = part;
        if (tmp.textContent.trim()) out.push(tmp);
      });
    } else if (el.textContent.trim()) {
      const tmp = document.createElement('div');
      tmp.append(el.cloneNode(true));
      out.push(tmp);
    }
  });
  if (!cell.children.length && cell.textContent.trim()) {
    const tmp = document.createElement('div');
    tmp.textContent = cell.textContent.trim();
    out.push(tmp);
  }
  return out;
}

function linkOnly(el) {
  const a = el.querySelector('a[href]');
  return a && el.textContent.trim() === a.textContent.trim() ? a : null;
}

function buildIconLink(a, cls) {
  const link = document.createElement('a');
  link.className = cls;
  link.href = a.getAttribute('href');
  if (a.target) link.target = a.target;
  const span = document.createElement('span');
  span.textContent = a.textContent.trim();
  link.append(span);
  return link;
}

export default function decorate(block) {
  const inline = block.classList.contains('inline');
  const out = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const picture = row.querySelector('picture');
    const textCells = cells.filter((c) => c.textContent.trim());
    const textLines = textCells.flatMap((c) => lines(c));
    const link = textLines.map(linkOnly).find((a) => a);
    const nonLink = textLines.filter((l) => !linkOnly(l));

    // asset manager logo row
    if (picture && !nonLink.length) {
      const logo = document.createElement('div');
      logo.className = 'author-manager-logo';
      const wrapperLink = link || row.querySelector('a[href]');
      if (wrapperLink) {
        const a = document.createElement('a');
        a.href = wrapperLink.getAttribute('href');
        a.setAttribute('aria-label', wrapperLink.textContent.trim() || picture.querySelector('img')?.alt || 'Asset manager');
        a.append(picture);
        logo.append(a);
      } else {
        logo.append(picture);
      }
      out.push(logo);
      return;
    }

    const container = document.createElement('div');
    container.className = 'author-container';
    if (picture) {
      const photo = document.createElement('div');
      photo.className = 'author-photo';
      photo.append(picture);
      photo.querySelectorAll('img').forEach((img) => {
        img.addEventListener('error', () => photo.classList.add('image-hidden'));
      });
      container.append(photo);
    }
    const text = document.createElement('div');
    text.className = 'author-text';
    const [name, title, ...rest] = nonLink;
    const company = rest.map((r) => r.textContent.trim()).join(' ');
    if (inline) {
      const p = document.createElement('p');
      p.className = 'author-personal-data';
      const add = (cls, value) => {
        if (!value) return;
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = value;
        p.append(span);
      };
      add('author-name', name && (title || company) ? `${name.textContent.trim()}, ` : name?.textContent.trim());
      add('author-title', title?.textContent.trim());
      add('author-company', company);
      text.append(p);
    } else {
      const add = (cls, value) => {
        if (!value) return;
        const p = document.createElement('p');
        p.className = cls;
        p.textContent = value;
        text.append(p);
      };
      // live: "Craig Scordellis," above the title / company
      add('author-name', name && (title || company) ? `${name.textContent.trim()},` : name?.textContent.trim());
      add('author-title', title?.textContent.trim());
      add('author-company', company);
    }
    if (link) text.append(buildIconLink(link, 'author-link'));
    container.append(text);
    out.push(container);
  });
  block.replaceChildren(...out);
}
