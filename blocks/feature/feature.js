/*
 * Feature block (replaces marketingSection, featureKicker, featureBanner).
 *
 * DA authoring tables:
 *
 * | Feature (marketing[, navy|purple|green|blue|white][, overlap][, short]) |      |
 * | (opt) icon image 48px / ## A passion for providing *solutions* / p / (opt) link | image |
 *
 * | Feature (kicker) |                                                             |
 * | ## Title / authors list / p / link "Read more"                     | image      |
 *   Authors list item: [photo] **Name, CFA**, Position
 *
 * | Feature (banner[, overlap]) |                                                  |
 * | ## **Local insight, global reach** / p                | desktop image / (opt) mobile image |
 */
import { buildAuthorInline, parseAuthorElement } from '../../scripts/block-utils.js';

const COLOURS = ['navy', 'purple', 'green', 'blue', 'white'];

function splitCells(block) {
  const pictures = [];
  const content = document.createElement('div');
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    if (cell.querySelector('picture') && !cell.textContent.trim()) {
      cell.querySelectorAll('picture').forEach((p) => pictures.push(p));
    } else {
      content.append(...cell.childNodes);
    }
  });
  [...content.children].forEach((el) => {
    if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('picture')) el.remove();
  });
  return { pictures, content };
}

function decorateLinks(content, cls) {
  [...content.querySelectorAll(':scope > p, :scope > .button-wrapper')].forEach((p) => {
    const a = p.querySelector('a[href]');
    if (!a || p.querySelectorAll('a').length !== 1 || p.textContent.trim() !== a.textContent.trim()) return;
    const link = document.createElement('a');
    link.href = a.getAttribute('href');
    link.className = cls;
    if (a.target) link.target = a.target;
    const span = document.createElement('span');
    span.textContent = a.textContent.trim();
    link.append(span);
    p.replaceWith(link);
  });
}

function buildMarketing(block, pictures, content) {
  if (!COLOURS.some((c) => block.classList.contains(c))) block.classList.add('navy');
  const wrap = document.createElement('section');
  wrap.className = 'feature-wrap';
  content.className = 'feature-content';

  // icon: picture-only first paragraph
  const first = content.firstElementChild;
  if (first && first.querySelector('picture') && !first.textContent.trim()) {
    first.className = 'feature-icon';
  }
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.classList.add('feature-title');
    heading.id = heading.id || `feature-title-${Math.random().toString(36).slice(2, 8)}`;
    wrap.setAttribute('aria-labelledby', heading.id);
  }
  decorateLinks(content, 'feature-link');
  content.querySelectorAll(':scope > p:not(.feature-icon)').forEach((p) => p.classList.add('feature-description'));

  const image = document.createElement('div');
  image.className = 'feature-image';
  if (pictures[0]) image.append(pictures[0]);
  wrap.append(content);
  if (pictures[0]) wrap.append(image);
  block.replaceChildren(wrap);
}

function buildKicker(block, pictures, content) {
  const inner = document.createElement('div');
  inner.className = 'feature-inner';
  const contentEl = document.createElement('div');
  contentEl.className = 'feature-content';
  content.className = 'feature-content-wrap';
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) heading.classList.add('feature-title');
  // authors list
  const children = [...content.children];
  const headingIndex = heading ? children.indexOf(heading) : -1;
  const list = children.find((el, i) => ['UL', 'OL'].includes(el.tagName) && i > headingIndex);
  if (list) {
    const authors = document.createElement('div');
    authors.className = 'feature-authors';
    [...list.children].forEach((li) => authors.append(buildAuthorInline(parseAuthorElement(li), 'feature')));
    list.replaceWith(authors);
  }
  decorateLinks(content, 'feature-link');
  content.querySelectorAll(':scope > p').forEach((p) => p.classList.add('feature-subtitle'));
  contentEl.append(content);
  inner.append(contentEl);
  if (pictures[0]) {
    const image = document.createElement('div');
    image.className = 'feature-image';
    image.append(pictures[0]);
    inner.append(image);
  }
  block.replaceChildren(inner);
}

function buildBanner(block, pictures, content) {
  const wrap = document.createElement('div');
  wrap.className = 'feature-wrap';
  content.className = 'feature-content';
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) heading.classList.add('feature-title');
  decorateLinks(content, 'feature-link');
  content.querySelectorAll(':scope > p').forEach((p) => p.classList.add('feature-title-text'));
  wrap.append(content);
  const [desktop, mobile] = pictures;
  if (desktop) {
    desktop.classList.add('feature-image-desktop');
    wrap.append(desktop);
    const m = mobile || desktop.cloneNode(true);
    m.classList.remove('feature-image-desktop');
    m.classList.add('feature-image-mobile');
    wrap.append(m);
  }
  block.replaceChildren(wrap);
}

export default function decorate(block) {
  const { pictures, content } = splitCells(block);
  if (block.classList.contains('kicker')) buildKicker(block, pictures, content);
  else if (block.classList.contains('banner')) buildBanner(block, pictures, content);
  else {
    block.classList.add('marketing');
    buildMarketing(block, pictures, content);
  }
}
