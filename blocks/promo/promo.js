/*
 * Promo block (replaces simpleBanner): coloured promo banner, one or two items.
 *
 * DA authoring table (one row per item; `double` = two items side by side):
 *
 * | Promo[ (green|navy|blue|gold|violet|white)][ (double)] |                   |                  |
 * | image | ## Sustainable Asia Bond / p / link "Learn more"   | (opt) colour, e.g. blue |
 *
 * Colour: per-row third cell, else block variant, else green.
 */
const COLOURS = ['green', 'navy', 'blue', 'gold', 'violet', 'white'];

export default function decorate(block) {
  const blockColour = COLOURS.find((c) => block.classList.contains(c)) || 'green';
  const main = document.createElement('div');
  main.className = 'promo-main';

  const items = [...block.children].map((row) => {
    const cells = [...row.children];
    let colour = blockColour;
    let picture = null;
    const content = document.createElement('section');
    content.className = 'promo-content';
    cells.forEach((cell) => {
      const text = cell.textContent.trim().toLowerCase();
      if (!cell.querySelector('picture') && COLOURS.includes(text)) {
        colour = text;
      } else if (cell.querySelector('picture') && !cell.textContent.trim()) {
        if (!picture) picture = cell.querySelector('picture');
      } else {
        content.append(...cell.childNodes);
      }
    });

    const item = document.createElement('div');
    item.className = `promo-item promo-${colour}`;

    const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      heading.classList.add('promo-title');
      heading.id = heading.id || `promo-title-${Math.random().toString(36).slice(2, 8)}`;
      content.setAttribute('aria-labelledby', heading.id);
    }
    const subtitle = document.createElement('div');
    subtitle.className = 'promo-subtitle';
    const links = [];
    [...content.children].forEach((el) => {
      if (el === heading) return;
      const a = el.querySelector('a[href]');
      if (a && el.querySelectorAll('a').length === 1 && el.textContent.trim() === a.textContent.trim()
        && !el.querySelector('picture')) {
        const link = document.createElement('a');
        link.className = 'promo-link';
        link.href = a.getAttribute('href');
        if (a.target) link.target = a.target;
        const span = document.createElement('span');
        span.textContent = a.textContent.trim();
        link.append(span);
        links.push(link);
        el.remove();
        return;
      }
      if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) {
        el.remove();
        return;
      }
      subtitle.append(el);
    });
    if (subtitle.children.length) content.append(subtitle);
    content.append(...links);

    if (picture) {
      const image = document.createElement('div');
      image.className = 'promo-image';
      image.append(picture);
      item.append(image);
    } else {
      item.classList.add('promo-no-image');
    }
    item.append(content);
    return item;
  });

  if (items.length > 1) block.classList.add('double');
  main.append(...items);
  block.replaceChildren(main);
}
