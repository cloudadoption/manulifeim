/*
 * Hero block (replaces rotatingBanner, extendedHeroBanner2, heroHeader2 / heroHeader).
 *
 * DA authoring tables:
 *
 * | Hero (carousel) |                                                        |
 * | Speed           | 5                     (optional; seconds per slide)    |
 * | image           | # Title / p / **link**                                 |
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
 *
 * Authored nodes stay where they are (Canvas edits them in place): rows and cells get
 * classes, CSS styles the tags inside. Only the button paragraphs move, into one
 * `.hero-buttons` group per content cell.
 */

import isAuthoring from '../../scripts/authoring.js';
import { isMediaCell } from '../../scripts/block-utils.js';

function isEmptyParagraph(el) {
  return el.tagName === 'P' && !el.querySelector('img, picture') && !el.textContent.trim();
}

/**
 * Content cell: drops empty paragraphs and groups the button paragraphs.
 * @param {Element} cell
 * @returns {Element|null} the heading
 */
function decorateContent(cell) {
  [...cell.children].forEach((el) => { if (isEmptyParagraph(el)) el.remove(); });
  const buttons = [...cell.querySelectorAll(':scope > p.button-wrapper')];
  if (buttons.length) {
    const group = document.createElement('div');
    group.className = 'hero-buttons';
    buttons[0].before(group);
    group.append(...buttons);
  }
  return cell.querySelector('h1, h2, h3, h4, h5, h6');
}

/* ---------------- carousel ---------------- */

function eager(slide, first) {
  slide.querySelectorAll('img').forEach((img) => {
    img.loading = 'eager';
    if (first) img.fetchPriority = 'high';
  });
}

function buildCarousel(block) {
  let speed = 5;
  const slides = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const label = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length >= 2 && label === 'speed' && !row.querySelector('picture')) {
      const v = parseFloat(cells[1].textContent);
      if (v > 0) speed = v;
      row.dataset.config = 'speed';
      return;
    }
    slides.push(row);
  });

  slides.forEach((row, i) => {
    row.classList.add('hero-slide');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-roledescription', 'slide');
    [...row.children].forEach((cell) => {
      if (isMediaCell(cell)) {
        cell.classList.add('hero-slide-image');
      } else if (cell.textContent.trim()) {
        cell.classList.add('hero-slide-content', 'hero-content');
        const heading = decorateContent(cell);
        if (heading) {
          heading.id = heading.id || `hero-slide-title-${i}`;
          row.setAttribute('aria-labelledby', heading.id);
        }
      }
    });
    if (!row.hasAttribute('aria-labelledby')) row.setAttribute('aria-label', `Slide ${i + 1} of ${slides.length}`);
    // the first slide is the LCP image; the next one loads early so it never fades in grey
    if (i < 2) eager(row, i === 0);
  });

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');
  block.setAttribute('aria-label', 'Highlights');
  block.style.setProperty('--hero-speed', `${speed}s`);

  // one slide, or authoring in Canvas: all slides stacked, no controls and no timer
  if (slides.length < 2 || isAuthoring()) {
    if (slides.length > 1) block.classList.add('static');
    slides[0]?.classList.add('active');
    return;
  }

  const controls = document.createElement('div');
  controls.className = 'hero-controls';
  controls.setAttribute('role', 'group');
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
  const pills = slides.map((_, i) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'hero-pill';
    pill.dataset.index = i;
    pill.innerHTML = '<span class="hero-pill-item"><span class="hero-pill-track"><span class="hero-pill-fill"></span></span></span>';
    bar.append(pill);
    return pill;
  });
  controls.append(prev, bar, next);
  block.append(controls);

  let current = 0;
  // reduced motion: start paused (the user can still play)
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let held = false; // hover / focus / touch inside the carousel
  let timer = null;

  const stopTimer = () => {
    if (timer) timer.cancel();
    timer = null;
  };

  const render = () => {
    const running = !paused && !held;
    // announce slide changes only when the user drives them
    block.setAttribute('aria-live', running ? 'off' : 'polite');
    slides.forEach((s, i) => {
      const active = i === current;
      s.classList.toggle('active', active);
      s.inert = !active;
      s.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    pills.forEach((p, i) => {
      const active = i === current;
      p.classList.toggle('active', active);
      p.classList.toggle('paused', active && paused);
      if (active) p.setAttribute('aria-current', 'true');
      else p.removeAttribute('aria-current');
      p.setAttribute('aria-label', active ? `Slide ${i + 1}: ${paused ? 'play' : 'pause'}` : `Slide ${i + 1}`);
    });
    stopTimer();
    if (paused) return;
    // progress fill and slide timer in one: Web Animations keep working without CSS animation
    const fill = pills[current].querySelector('.hero-pill-fill');
    timer = fill.animate([{ width: '0%' }, { width: '100%' }], {
      duration: speed * 1000, easing: 'linear', fill: 'forwards',
    });
    timer.onfinish = () => {
      timer = null;
      // eslint-disable-next-line no-use-before-define
      goTo(current + 1);
    };
    if (held) timer.pause();
  };

  const goTo = (i) => {
    current = (i + slides.length) % slides.length;
    eager(slides[(current + 1) % slides.length], false);
    render();
  };

  const hold = (on) => {
    held = on;
    if (!timer) {
      render();
      return;
    }
    if (on) timer.pause();
    else timer.play();
    block.setAttribute('aria-live', !paused && !held ? 'off' : 'polite');
  };

  pills.forEach((p, i) => p.addEventListener('click', () => {
    if (i === current) {
      paused = !paused;
      render();
    } else {
      goTo(i);
    }
  }));
  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  // pause while the pointer (mouse only), focus or a finger is inside
  block.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hold(true); });
  block.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hold(false); });
  block.addEventListener('focusin', () => hold(true));
  block.addEventListener('focusout', (e) => { if (!block.contains(e.relatedTarget)) hold(false); });
  block.addEventListener('touchstart', () => hold(true), { passive: true });

  render();
}

/* ---------------- banner ---------------- */

function buildBanner(block) {
  let media = 0;
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    if (isMediaCell(cell)) {
      media += 1;
      cell.classList.add('hero-media', media === 1 ? 'hero-media-primary' : 'hero-media-mobile');
    } else if (cell.textContent.trim() || cell.querySelector('picture')) {
      cell.classList.add('hero-content');
      decorateContent(cell);
    }
  });
  if (!media) block.classList.add('no-image');
  if (media > 1) block.classList.add('has-mobile-media');
}

/* ---------------- page header ---------------- */

function buildPageHeader(block) {
  let icon = false;
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    if (isMediaCell(cell)) {
      icon = true;
      cell.classList.add('hero-icon');
    } else if (cell.textContent.trim() || cell.querySelector('picture')) {
      cell.classList.add('hero-content');
      decorateContent(cell);
      // an icon can also be the first paragraph of the content cell
      const first = cell.firstElementChild;
      if (first && first.querySelector('picture') && !first.textContent.trim()) icon = true;
    }
  });
  if (icon) block.classList.add('has-icon');
}

export default function decorate(block) {
  if (block.classList.contains('carousel')) {
    buildCarousel(block);
  } else if (block.classList.contains('page-header')) {
    buildPageHeader(block);
  } else {
    if (!block.classList.contains('banner')) block.classList.add('banner');
    buildBanner(block);
  }
}
