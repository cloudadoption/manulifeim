/* eslint-disable max-len */
/*
 * Title block (replaces richTitle): section heading + optional right-aligned link.
 *
 * DA authoring table:
 *
 * | Title                                      |                                  |
 * | ## We're committed to making a positive *impact* | link "Learn more about sustainability" (optional) |
 */
/* eslint-enable max-len */
export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  const all = document.createElement('div');
  cells.forEach((c) => all.append(...c.childNodes));

  let heading = all.querySelector('h1, h2, h3, h4, h5, h6');
  if (!heading) {
    // fall back to the first text paragraph as an h2
    const first = [...all.children].find((el) => el.textContent.trim() && !el.querySelector('a'));
    if (first) {
      heading = document.createElement('h2');
      heading.innerHTML = first.innerHTML;
      first.replaceWith(heading);
    }
  }

  const text = document.createElement('div');
  text.className = 'title-text';
  if (heading) {
    heading.classList.add('title-heading');
    text.append(heading);
  }

  const link = [...all.querySelectorAll('a[href]')].find((a) => !heading || !heading.contains(a));
  const children = [text];
  if (link) {
    const wrap = document.createElement('div');
    wrap.className = 'title-link';
    const a = document.createElement('a');
    a.href = link.getAttribute('href');
    a.className = 'title-link-anchor';
    if (link.target) a.target = link.target;
    const span = document.createElement('span');
    span.textContent = link.textContent.trim();
    a.append(span);
    wrap.append(a);
    children.push(wrap);
  }
  block.replaceChildren(...children);
}
