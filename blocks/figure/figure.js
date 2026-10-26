/*
 * Figure block (replaces landingImage2 / LandingImageCard, image with caption).
 *
 * DA authoring table (single column):
 *
 * | Figure[ (card)][ (top|left|right)] |
 * | **Yields to expected maturity …** (rich text above the image, optional) |
 * | image (chart svg/png)                                                   |
 * | Source: Manulife \| CQS, ICE, Bloomberg, … (caption, optional)          |
 *
 * Rows before the image row = text, rows after it = caption.
 * An optional second picture in the image row is used as the mobile image (≤800px).
 */
export default function decorate(block) {
  const content = document.createElement('div');
  content.className = 'figure-content';
  const figure = document.createElement('figure');
  figure.className = 'figure-image-inner';
  const caption = document.createElement('figcaption');
  caption.className = 'figure-caption';

  let imageSeen = false;
  [...block.children].forEach((row) => {
    const pictures = [...row.querySelectorAll('picture')];
    const text = row.textContent.trim();
    if (pictures.length && !imageSeen && !text) {
      imageSeen = true;
      pictures.forEach((pic, i) => {
        pic.classList.add(i === 0 ? 'figure-picture' : 'figure-picture-mobile');
      });
      // mobile image first so it can hide the desktop one at ≤800px
      if (pictures[1]) figure.append(pictures[1]);
      figure.append(pictures[0]);
      return;
    }
    if (pictures.length && !imageSeen) {
      // mixed row: picture and text in one cell
      imageSeen = true;
      [...row.querySelectorAll(':scope > div > *')].forEach((el) => {
        if (el.querySelector('picture') && !el.textContent.trim()) {
          const pic = el.querySelector('picture');
          pic.classList.add('figure-picture');
          figure.append(pic);
        } else if (figure.children.length) {
          caption.append(...el.childNodes, ' ');
        } else {
          content.append(el);
        }
      });
      return;
    }
    const cells = [...row.children];
    if (!imageSeen) {
      cells.forEach((c) => content.append(...c.childNodes));
    } else {
      cells.forEach((c) => {
        const ps = [...c.querySelectorAll(':scope > p')];
        if (ps.length) {
          ps.forEach((p, i) => {
            if (i > 0 || caption.childNodes.length) caption.append(document.createElement('br'));
            caption.append(...p.childNodes);
          });
        } else {
          caption.append(...c.childNodes);
        }
      });
    }
  });

  if (caption.textContent.trim()) figure.append(caption);
  [...content.children].forEach((el) => {
    if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
  });

  const card = document.createElement('div');
  card.className = 'figure-card';
  if (block.classList.contains('top')) {
    card.append(figure);
    if (content.children.length) card.append(content);
  } else {
    if (content.children.length) card.append(content);
    else block.classList.add('no-text');
    card.append(figure);
  }
  const inner = document.createElement('div');
  inner.className = 'figure-inner';
  inner.append(card);
  block.replaceChildren(inner);
}
