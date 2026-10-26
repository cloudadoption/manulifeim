/* eslint-disable max-len */
/*
 * Link List block (replaces linkList2 and moreInsights).
 *
 * DA authoring tables:
 *
 * | Link List[ (card)]          |
 * | (opt) subtitle text / (opt) ## title |
 * | link "Click here to go to the MCQS homepage" |
 * | link …                      |
 *   (links can also be one list in a single cell)
 *
 * | Link List (inline) |                                                 |
 * | More insight       | links (list or paragraphs): Climate Opportunities, Asset Allocation Views |
 */
/* eslint-enable max-len */
function iconLink(a, cls) {
  const link = document.createElement('a');
  link.className = cls;
  link.href = a.getAttribute('href');
  if (a.target) link.target = a.target;
  const span = document.createElement('span');
  span.className = `${cls}-text`;
  span.textContent = a.textContent.trim();
  link.append(span);
  return link;
}

export default function decorate(block) {
  const inline = block.classList.contains('inline');
  const titles = [];
  const subtitles = [];
  const links = [];

  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    const anchors = [...cell.querySelectorAll('a[href]')];
    if (!anchors.length) {
      const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) titles.push(heading.textContent.trim());
      else if (cell.textContent.trim()) {
        (inline ? titles : subtitles).push(cell.textContent.trim());
      }
      return;
    }
    // text before links in the same cell
    const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && !heading.querySelector('a')) titles.push(heading.textContent.trim());
    anchors.forEach((a) => {
      if (a.closest('h1, h2, h3, h4, h5, h6')) return;
      links.push(a);
    });
  });

  const ul = document.createElement('ul');
  ul.className = 'link-list-list';
  links.forEach((a) => {
    const li = document.createElement('li');
    li.className = 'link-list-item';
    li.append(iconLink(a, 'link-list-link'));
    ul.append(li);
  });

  const inner = document.createElement('div');
  inner.className = 'link-list-inner';
  if (inline) {
    const title = document.createElement('div');
    title.className = 'link-list-title';
    const h2 = document.createElement('h2');
    h2.textContent = titles[0] || '';
    title.append(h2);
    inner.append(title, ul);
  } else {
    const [heading] = titles;
    if (heading) {
      const h = document.createElement('h2');
      h.className = 'link-list-heading';
      h.textContent = heading;
      inner.append(h);
    }
    subtitles.forEach((s) => {
      const p = document.createElement('p');
      p.className = 'link-list-subtitle';
      p.textContent = s;
      inner.append(p);
    });
    inner.append(ul);
  }
  block.replaceChildren(inner);
}
