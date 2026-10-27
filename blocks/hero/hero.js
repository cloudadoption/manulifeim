/*
 * Hero block (replaces rotatingBanner, extendedHeroBanner2, heroHeader2 / heroHeader).
 *
 * DA authoring tables:
 *
 * | Hero (carousel) |                                                        |
 * | Speed           | 5                     (optional; seconds per slide)    |
 * | image           | # Title (slide 1 h1, others h2) / p / **link**         |
 * | image           | ## Title / p / **link**                                |
 *
 * | Hero (banner[, light][, overlap][, tall]) |                                |
 * | desktop image   | (optional p <sup>Q4 2025</sup>) / # Title / p / **link** |
 * | mobile image (optional row) |                                            |
 *
 * | Hero (page-header[, dark]) |                                             |
 * | (optional) icon image 48px | # Title / p subtitle / (optional) link CTA  |
 *
 * Bold link = primary button, italic link = secondary (white) button.
 * Without a variant the block renders as `banner`.
 */

import isAuthoring from '../../scripts/authoring.js';

function toClassList(block) {
  return [...block.classList];
}

function isEmptyParagraph(el) {
  return el.tagName === 'P' && !el.querySelector('img, picture') && !el.textContent.trim();
}

/**
 * Split the authored cells into pictures and a content cell.
 * @param {Element} block
 * @returns {{ pictures: Element[], content: Element }}
 */
function collectCells(block) {
  const pictures = [];
  const content = document.createElement('div');
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    const hasText = [...cell.children].some((el) => !el.querySelector('picture') && el.tagName !== 'PICTURE' && el.textContent.trim())
      || [...cell.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!hasText) {
      cell.querySelectorAll('picture').forEach((pic) => pictures.push(pic));
    } else {
      // pictures inside a text cell (e.g. icon) stay in the content
      content.append(...cell.childNodes);
    }
  });
  return { pictures, content };
}

/**
 * Turns links in the content into hero buttons and groups them.
 * @param {Element} content
 * @param {string} linkClass
 */
function decorateLinks(content, linkClass) {
  const buttons = document.createElement('div');
  buttons.className = 'hero-buttons';
  [...content.querySelectorAll('a[href]')].forEach((a) => {
    const p = a.closest('p, div.button-wrapper, li');
    if (!p || p.parentElement !== content) return;
    if (p.textContent.trim() !== a.textContent.trim()) return;
    const secondary = !!a.closest('em') || a.classList.contains('secondary');
    a.className = linkClass;
    if (secondary) a.classList.add(`${linkClass}-secondary`);
    buttons.append(a);
    p.remove();
  });
  if (buttons.children.length) content.append(buttons);
}

/**
 * Title, subtitle classes; flatten empty paragraphs.
 * @param {Element} content
 */
function decorateText(content) {
  [...content.children].forEach((el) => {
    if (isEmptyParagraph(el)) el.remove();
  });
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.classList.add('hero-title');
    // a paragraph holding only a <sup>/<sub> before the heading is the eyebrow ("Q4 2025")
    const prev = heading.previousElementSibling;
    if (prev && prev.tagName === 'P' && prev.querySelector('sup, sub')
      && prev.textContent.trim() === prev.querySelector('sup, sub').textContent.trim()) {
      // keep the authored nesting: live <sub><sup><strong> is 0.7 x 0.7 of the title, bold
      const eyebrow = document.createElement('span');
      eyebrow.className = 'hero-eyebrow';
      eyebrow.append(...prev.childNodes);
      heading.prepend(eyebrow, document.createElement('br'));
      prev.remove();
    }
  }
  content.querySelectorAll(':scope > p').forEach((p) => {
    if (!p.querySelector('picture')) p.classList.add('hero-subtitle');
  });
  return heading;
}

/* ---------------- carousel ---------------- */

function buildCarousel(block) {
  const rows = [...block.children];
  let speed = 5;
  const slides = [];
  rows.forEach((row) => {
    const cells = [...row.children];
    const label = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length >= 2 && label === 'speed' && !row.querySelector('picture')) {
      const v = parseFloat(cells[1].textContent);
      if (v > 0) speed = v;
      return;
    }
    slides.push(row);
  });

  const slider = document.createElement('div');
  slider.className = 'hero-slider';
  slider.setAttribute('role', 'region');
  slider.setAttribute('aria-roledescription', 'carousel');
  slider.setAttribute('aria-live', 'polite');
  slider.style.setProperty('--hero-speed', `${speed}s`);

  const slideEls = slides.map((row, i) => {
    const slide = document.createElement('div');
    slide.className = 'hero-slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.dataset.index = i;

    const pic = row.querySelector('picture');
    const img = document.createElement('div');
    img.className = 'hero-image';
    if (pic) {
      // hidden slides never enter the viewport, so lazy images would still be loading when
      // the slide fades in (grey hero): load all slide images up front, the first one first
      pic.querySelectorAll('img').forEach((im) => {
        im.loading = 'eager';
        if (i === 0) im.fetchPriority = 'high';
      });
      img.append(pic);
    }
    const gradient = document.createElement('div');
    gradient.className = 'hero-gradient';

    const content = document.createElement('div');
    content.className = 'hero-content';
    [...row.children].forEach((cell) => {
      if (cell.textContent.trim()) content.append(...cell.childNodes);
    });
    let heading = decorateText(content);
    // only the first slide keeps an h1
    if (heading && i > 0 && heading.tagName === 'H1') {
      const h2 = document.createElement('h2');
      h2.className = heading.className;
      h2.innerHTML = heading.innerHTML;
      heading.replaceWith(h2);
      heading = h2;
    }
    if (heading) {
      heading.id = heading.id || `hero-slide-title-${i}`;
      slide.setAttribute('aria-labelledby', heading.id);
    } else {
      slide.setAttribute('aria-label', `Slide ${i + 1}`);
    }
    decorateLinks(content, 'hero-link');
    slide.append(img, gradient, content);
    return slide;
  });

  const slidesWrap = document.createElement('div');
  slidesWrap.className = 'hero-slides';
  slidesWrap.append(...slideEls);
  slider.append(slidesWrap);

  // one slide, or authoring in Canvas: all slides stacked, no controls and no timer
  if (slideEls.length < 2 || isAuthoring()) {
    if (slideEls.length > 1) block.classList.add('static');
    slideEls[0]?.classList.add('active');
    block.replaceChildren(slider);
    return;
  }

  // controls
  const controls = document.createElement('div');
  controls.className = 'hero-controls';
  controls.setAttribute('aria-label', 'Slide controls');
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'hero-prev';
  prev.setAttribute('aria-label', 'Previous Slide');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'hero-next';
  next.setAttribute('aria-label', 'Next Slide');
  const bar = document.createElement('div');
  bar.className = 'hero-progressbar';
  const pills = slideEls.map((_, i) => {
    const parent = document.createElement('div');
    parent.className = 'hero-pill';
    parent.tabIndex = 0;
    parent.setAttribute('role', 'button');
    parent.setAttribute('aria-label', `Slide ${i + 1}`);
    parent.dataset.index = i;
    const item = document.createElement('div');
    item.className = 'hero-pill-item';
    const track = document.createElement('span');
    track.className = 'hero-pill-track';
    const fill = document.createElement('div');
    fill.className = 'hero-pill-fill';
    track.append(fill);
    item.append(track);
    parent.append(item);
    bar.append(parent);
    return parent;
  });
  controls.append(prev, bar, next);
  slider.append(controls);
  block.replaceChildren(slider);

  let current = 0;
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const render = () => {
    slideEls.forEach((s, i) => {
      const active = i === current;
      s.classList.toggle('active', active);
      s.setAttribute('aria-hidden', active ? 'false' : 'true');
      s.querySelectorAll('a, button').forEach((el) => {
        if (active) el.removeAttribute('tabindex');
        else el.tabIndex = -1;
      });
    });
    pills.forEach((p, i) => {
      const active = i === current;
      p.classList.toggle('active', active);
      p.classList.toggle('paused', active && paused);
      p.setAttribute('aria-current', active ? 'true' : 'false');
      p.setAttribute('aria-label', active
        ? `Slide ${i + 1}: ${paused ? 'play' : 'pause'}`
        : `Slide ${i + 1}`);
      // restart the fill animation
      const fill = p.querySelector('.hero-pill-fill');
      fill.style.animation = 'none';
      // eslint-disable-next-line no-unused-expressions
      fill.offsetWidth;
      fill.style.animation = '';
    });
    slider.classList.toggle('paused', paused);
  };

  const goTo = (i) => {
    current = (i + slideEls.length) % slideEls.length;
    render();
  };

  pills.forEach((p, i) => {
    p.querySelector('.hero-pill-fill').addEventListener('animationend', () => {
      if (!paused && i === current) goTo(current + 1);
    });
    const activate = () => {
      if (i === current) {
        paused = !paused;
        render();
      } else {
        goTo(i);
      }
    };
    p.addEventListener('click', activate);
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));

  render();
}

/* ---------------- banner ---------------- */

function buildBanner(block) {
  const { pictures, content } = collectCells(block);
  const wrap = document.createElement('div');
  wrap.className = 'hero-wrap';

  const [desktop, mobile] = pictures;
  if (desktop) {
    desktop.classList.add('hero-image-desktop');
    wrap.append(desktop);
    const mobilePic = mobile || desktop.cloneNode(true);
    mobilePic.classList.remove('hero-image-desktop');
    mobilePic.classList.add('hero-image-mobile');
    mobilePic.querySelectorAll('img').forEach((img) => { img.loading = 'lazy'; });
    wrap.append(mobilePic);
  } else {
    block.classList.add('no-image');
  }

  content.className = 'hero-content';
  decorateText(content);
  decorateLinks(content, 'hero-link');
  wrap.append(content);
  block.replaceChildren(wrap);
}

/* ---------------- page header ---------------- */

function buildPageHeader(block) {
  const { pictures, content } = collectCells(block);
  const banner = document.createElement('div');
  banner.className = 'hero-banner';
  content.className = 'hero-content';

  // an icon can sit in its own cell or as the first paragraph of the content cell
  let icon = pictures[0];
  if (!icon) {
    const first = content.firstElementChild;
    if (first && first.querySelector('picture') && !first.textContent.trim()) {
      icon = first.querySelector('picture');
      first.remove();
    }
  }
  const heading = decorateText(content);
  if (icon) {
    icon.classList.add('hero-icon');
    content.prepend(icon);
  }
  if (heading && !icon) heading.classList.add('hero-title-first');

  // CTA link: plain link with arrow
  [...content.querySelectorAll('a[href]')].forEach((a) => {
    const p = a.closest('p, div.button-wrapper');
    if (!p || p.parentElement !== content || p.textContent.trim() !== a.textContent.trim()) return;
    a.className = 'hero-cta';
    p.classList.remove('hero-subtitle', 'button-wrapper');
    p.classList.add('hero-cta-wrapper');
    const strong = a.closest('strong, em');
    if (strong && p.contains(strong)) strong.replaceWith(a);
  });

  banner.append(content);
  block.replaceChildren(banner);
}

export default function decorate(block) {
  const classes = toClassList(block);
  if (classes.includes('carousel')) {
    buildCarousel(block);
  } else if (classes.includes('page-header')) {
    buildPageHeader(block);
  } else {
    if (!classes.includes('banner')) block.classList.add('banner');
    buildBanner(block);
  }
}
