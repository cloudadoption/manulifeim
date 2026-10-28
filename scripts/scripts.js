// first: sets html[quick-edit] before any decoration
import isAuthoring, { renewPageSignal } from './authoring.js';
import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  getMetadata,
  toClassName,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s, // avoid stack overflow
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/**
 * Template names (the `Template` metadata, kebab-case): home, plain, viewpoints,
 * viewpoint (article), press-release-root, press-release, case-study-list,
 * case-study-detail, search. Live route classes (e.g. `caseStudyDetail`) and the
 * aliases below are accepted too.
 */
const TEMPLATE_ALIASES = {
  article: 'viewpoint',
  'viewpoint-detail': 'viewpoint',
  'case-study': 'case-study-detail',
  'case-study-listing': 'case-study-list',
  'press-release-listing': 'press-release-root',
};

/* templates with page-level layout rules in styles/templates.css */
const STYLED_TEMPLATES = ['viewpoint', 'case-study-detail', 'press-release', 'case-study-list'];

/**
 * Adds `template-<name>` and `theme-<name>` classes to the body. The classes are
 * prefixed so they cannot collide with block class names (e.g. a `search` block).
 * @returns {string} the normalised template name, or an empty string
 */
function decorateTemplateAndTheme() {
  const value = getMetadata('template');
  let template = '';
  if (value) {
    const name = toClassName(value.trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2'));
    template = TEMPLATE_ALIASES[name] || name;
    document.body.classList.add(`template-${template}`);
  }
  const theme = getMetadata('theme');
  if (theme) {
    theme.split(',').forEach((t) => {
      if (t.trim()) document.body.classList.add(`theme-${toClassName(t.trim())}`);
    });
  }
  return template;
}

/* Taiwan disclaimer acceptance (same key as live, any truthy value) */
export const ATTESTATION_KEY = 'mim-inst-attestation-accepted-TW';

function isAttestationAccepted() {
  try {
    return !!localStorage.getItem(ATTESTATION_KEY);
  } catch (e) {
    return false;
  }
}

/**
 * Opens the "Select a location" region selector (header region button, `#region-select` links).
 */
export async function openRegionSelector() {
  if (isAuthoring()) return;
  // eslint-disable-next-line import/no-cycle
  const { showRegionSelector } = await import('../blocks/attestation/attestation.js');
  await showRegionSelector();
}

/**
 * Shows the attestation prompt (first visit): Taiwan disclaimer, page blurred until accepted.
 */
async function loadAttestationPrompt() {
  try {
    // eslint-disable-next-line import/no-cycle
    const { showAttestation } = await import('../blocks/attestation/attestation.js');
    await showAttestation();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Attestation failed', error);
    document.body.classList.remove('attestation-blur');
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => f.pathname.includes('/fragments/') && !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization; a plain link alone in its paragraph is a
    // CTA link: blocks that show it with an arrow style `.<block> a.link-cta` (default content
    // keeps the plain link look)
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) {
      p.classList.add('link-cta-wrapper');
      a.classList.add('link-cta');
      return;
    }

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  // blur the page before first paint until the disclaimer is accepted (modal loads after LCP);
  // never in authoring, nor on the nav/footer/fragment documents
  const chromePath = /^\/(nav|footer)$|\/fragments\//.test(window.location.pathname);
  const attestationPending = !isAuthoring() && !chromePath && !isAttestationAccepted();
  if (attestationPending) document.body.classList.add('attestation-blur');
  // the class survives the body swaps Canvas does between edits
  else document.body.classList.remove('attestation-blur');
  // banner closed this session (blocks/header): no space reserved for it (styles.css)
  try {
    if (sessionStorage.getItem('mim-site-banner-dismissed')) document.documentElement.classList.add('site-alert-dismissed');
  } catch (e) {
    // storage unavailable: keep the reserve
  }
  const template = decorateTemplateAndTheme();
  const templateStyles = STYLED_TEMPLATES.includes(template)
    ? loadCSS(`${window.hlx.codeBasePath}/styles/templates.css`).catch(() => {})
    : null;
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    if (templateStyles) await templateStyles;
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }
  // right after the LCP section, not awaited: the dialog and its fragments load in parallel
  // with the rest of the page
  if (attestationPending) loadAttestationPrompt();

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const header = doc.querySelector('body > header');
  const footer = doc.querySelector('body > footer');
  const main = doc.querySelector('main');
  await Promise.all([main && loadSections(main), header && loadHeader(header)]);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  if (footer) await loadFooter(footer);

  if (main && getMetadata('links').trim().toLowerCase() === 'new-tab') {
    const { default: openLinksInNewTab } = await import('./link-target.js');
    openLinksInNewTab(main, new URL(window.location.href));
  }

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  import('./consent-check.js');
  // load anything that can be postponed to the latest here
  // showcase notice ("not an official Manulife website"), well after LCP; not in authoring
  if (!isAuthoring()) {
    window.setTimeout(() => {
      import('./showcase-notice.js').then(({ default: showShowcaseNotice }) => showShowcaseNotice());
    }, 3500);
  }
}

/**
 * Decorates and loads the page. Exported for the quick-edit plugin, which calls it again on the
 * same document after each structural edit in Canvas.
 * @param {Document} doc
 */
export async function loadPage(doc = document) {
  renewPageSignal();
  await loadEager(doc);
  await loadLazy(doc);
  loadDelayed();
}

if (isAuthoring()) {
  // literal specifier: preview.da.live then stops appending its own quick-edit bootstrap
  // eslint-disable-next-line import/no-unresolved
  import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js')
    .then(({ default: loadQuickEdit }) => loadQuickEdit(undefined, loadPage))
    // eslint-disable-next-line no-console
    .catch((e) => console.warn('quick-edit unavailable', e));
}
loadPage();
