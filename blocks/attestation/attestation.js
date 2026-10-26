/*
 * Attestation / region selector modal (live dialog#region-modal.attestation__modal).
 * Not an authored block: scripts.js opens it as a prompt on first visit and the header opens
 * it from the region button. Content comes from two DA fragments:
 *   /institutional/tw/en/fragments/attestation    section 1: `## Disclaimer (Taiwan)` + text,
 *                                                 section 2: Cancel link, bold "I agree" link,
 *                                                 `#region-select` "Change region" link
 *   /institutional/tw/en/fragments/region-select  `## Select a location`, then `### group` +
 *                                                 list of country links (live sites)
 *
 * Modes (live classes in brackets):
 *   prompt, one pane  [attestation__modal--prompt-1pane]  first visit: only the Taiwan pane,
 *                     no close button, page blurred; Cancel = link to https://www.manulifeim.com/
 *   prompt, two panes [attestation__modal--prompt]  after "Change region": country list slides
 *                     in; Cancel (live .attestation__cancel--prompt) returns to one pane
 *   region selector   [no prompt class]  header "Taiwan" button: both panes + close button;
 *                     Escape / backdrop / close button close it
 * "I agree" stores localStorage['mim-inst-attestation-accepted-TW'] and closes the dialog.
 */
import { getMetadata, loadCSS } from '../../scripts/aem.js';
// eslint-disable-next-line import/no-cycle
import { loadFragment } from '../fragment/fragment.js';
// eslint-disable-next-line import/no-cycle
import { ATTESTATION_KEY } from '../../scripts/scripts.js';

const REGION_HASH = '#region-select';
const ATTESTATION_PATH = '/institutional/tw/en/fragments/attestation';
const REGION_SELECT_PATH = '/institutional/tw/en/fragments/region-select';
const TRANSITION_MS = 300;

let modalPromise = null;

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  });
  children.flat().filter((c) => c !== null && c !== undefined && c !== '').forEach((c) => e.append(c));
  return e;
}

function icon(name, cls) {
  const span = el('span', { class: `attestation-icon ${cls || ''}`.trim(), 'aria-hidden': 'true' });
  span.style.setProperty('--attestation-icon', `url("${window.hlx.codeBasePath}/icons/${name}.svg")`);
  return span;
}

const text = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');

function fragmentPath(metaName, fallback) {
  const meta = getMetadata(metaName);
  return meta ? new URL(meta, window.location).pathname : fallback;
}

const sectionsOf = (fragment) => (fragment ? [...fragment.querySelectorAll(':scope > .section')] : []);
const contentOf = (section) => (section && section.querySelector('.default-content-wrapper')) || section;

/* ---------- content ---------- */

function parseAttestation(fragment) {
  const [body, actions] = sectionsOf(fragment);
  const data = {
    title: 'Disclaimer (Taiwan)', text: [], cancel: null, accept: 'I agree', changeRegion: 'Change region',
  };
  if (body) {
    const root = contentOf(body);
    const title = root.querySelector('h1, h2');
    if (title) {
      data.title = text(title);
      title.remove();
    }
    data.text = [...root.childNodes];
  }
  const links = actions ? [...actions.querySelectorAll('a[href]')] : [];
  links.forEach((a) => {
    const href = a.getAttribute('href');
    const strong = a.closest('strong, b') || a.classList.contains('primary');
    if (href === REGION_HASH) data.changeRegion = text(a);
    else if (strong) data.accept = text(a);
    else if (!data.cancel) data.cancel = { label: text(a), href };
  });
  if (!data.cancel) data.cancel = { label: 'Cancel', href: 'https://www.manulifeim.com/' };
  return data;
}

function parseRegions(fragment) {
  const root = contentOf(sectionsOf(fragment)[0]);
  const data = { title: 'Select a location', groups: [] };
  if (!root) return data;
  const title = root.querySelector('h1, h2');
  if (title) data.title = text(title);
  let group = null;
  [...root.children].forEach((n) => {
    if (/^H[3-6]$/.test(n.tagName)) {
      group = { label: text(n), countries: [] };
      data.groups.push(group);
    } else if ((n.tagName === 'UL' || n.tagName === 'OL')) {
      if (!group) {
        group = { label: '', countries: [] };
        data.groups.push(group);
      }
      n.querySelectorAll('a[href]').forEach((a) => group.countries.push({ label: text(a), href: a.getAttribute('href') }));
    }
  });
  return data;
}

/* ---------- dialog ---------- */

function buildCountries(regions) {
  const scroll = el('div', { class: 'attestation-scroll' });
  regions.groups.forEach((g) => {
    const list = el('ul', { class: 'attestation-country-group' });
    g.countries.forEach((c) => list.append(el('li', {}, el('a', { class: 'attestation-country-link', href: c.href }, c.label))));
    scroll.append(el('div', {}, g.label ? el('h3', { class: 'attestation-group-label' }, g.label) : null, list));
  });
  return el(
    'div',
    { class: 'attestation-countries' },
    el('h2', { class: 'attestation-title', id: 'region-modal-title', tabindex: '-1' }, regions.title),
    scroll,
  );
}

function buildPane(att) {
  const textBox = el('div', { class: 'attestation-text', lang: 'en' });
  textBox.append(...att.text);
  const cancelLink = el('a', { class: 'attestation-cancel attestation-cancel-link', href: att.cancel.href, role: 'button' }, att.cancel.label);
  const cancelPrompt = el('button', { class: 'attestation-cancel attestation-cancel-prompt', type: 'button' }, att.cancel.label);
  const accept = el('button', { class: 'attestation-accept', type: 'button' }, att.accept);
  const change = el('button', { class: 'attestation-region-select-link', type: 'button' }, att.changeRegion, icon('arrow-right'));
  const pane = el(
    'section',
    { class: 'attestation-pane', 'aria-labelledby': 'attestation-pane-title' },
    el('h2', { class: 'attestation-title', id: 'attestation-pane-title', tabindex: '-1' }, att.title),
    el(
      'div',
      { class: 'attestation-content' },
      textBox,
      el('div', { class: 'attestation-buttons' }, cancelLink, cancelPrompt, accept),
    ),
    el('div', { class: 'attestation-region-select' }, change),
  );
  return {
    pane, accept, cancelPrompt, change,
  };
}

function lockScroll(lock) {
  document.documentElement.style.overflow = lock ? 'hidden' : '';
}

async function buildModal() {
  const [, attFragment, regionFragment] = await Promise.all([
    loadCSS(`${window.hlx.codeBasePath}/blocks/attestation/attestation.css`),
    loadFragment(fragmentPath('attestation', ATTESTATION_PATH)),
    loadFragment(fragmentPath('region-select', REGION_SELECT_PATH)),
  ]);
  const att = parseAttestation(attFragment);
  const regions = parseRegions(regionFragment);

  const dialog = el('dialog', { id: 'region-modal', class: 'attestation-modal', 'aria-labelledby': 'attestation-pane-title' });
  const countries = buildCountries(regions);
  const {
    pane, accept, cancelPrompt, change,
  } = buildPane(att);
  const close = el('button', {
    class: 'attestation-close', type: 'button', title: 'Close', 'aria-label': 'Close',
  }, icon('close'));
  dialog.append(el(
    'div',
    { class: 'attestation-wrap' },
    countries,
    el('div', { class: 'attestation-business' }, pane),
    close,
  ));
  document.body.append(dialog);

  const isPrompt = () => dialog.classList.contains('prompt');
  const setOnePane = (one) => {
    dialog.classList.toggle('one-pane', one);
    dialog.setAttribute('aria-labelledby', one ? 'attestation-pane-title' : 'region-modal-title');
    countries.inert = one;
  };

  const hide = () => {
    dialog.classList.remove('open');
    lockScroll(false);
    const finish = () => {
      if (dialog.open) dialog.close();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else setTimeout(finish, TRANSITION_MS);
  };

  accept.addEventListener('click', () => {
    try {
      localStorage.setItem(ATTESTATION_KEY, 'true');
    } catch (e) {
      // storage unavailable: accept for this page view only
    }
    dialog.classList.remove('prompt');
    document.body.classList.remove('attestation-blur');
    hide();
  });
  change.addEventListener('click', () => {
    setOnePane(false);
    const first = countries.querySelector('.attestation-country-link');
    (first || countries.querySelector('.attestation-title')).focus();
  });
  cancelPrompt.addEventListener('click', () => {
    setOnePane(true);
    pane.querySelector('.attestation-title').focus();
  });
  close.addEventListener('click', hide);

  // Escape / backdrop never dismiss the prompt; they close the region selector
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!isPrompt()) hide();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && !isPrompt()) hide();
  });
  dialog.addEventListener('close', () => {
    if (isPrompt()) {
      // the prompt cannot be dismissed without accepting
      dialog.showModal();
      return;
    }
    dialog.classList.remove('open');
    lockScroll(false);
  });

  return {
    dialog,
    // pages outside the replica (e.g. the boilerplate root) have no disclaimer fragment
    hasAttestation: !!attFragment,
    show(prompt, onePane = prompt) {
      dialog.classList.toggle('prompt', prompt);
      setOnePane(onePane);
      if (!dialog.open) dialog.showModal();
      lockScroll(true);
      requestAnimationFrame(() => {
        dialog.classList.add('open');
        const focusTarget = onePane ? pane.querySelector('.attestation-title') : countries.querySelector('.attestation-title');
        focusTarget.focus({ preventScroll: true });
      });
    },
  };
}

function modal() {
  if (!modalPromise) modalPromise = buildModal();
  return modalPromise;
}

const accepted = () => {
  try {
    return !!localStorage.getItem(ATTESTATION_KEY);
  } catch (e) {
    return false;
  }
};

/** First-visit prompt: Taiwan disclaimer only, page blurred until "I agree". */
export async function showAttestation() {
  const m = await modal();
  if (!m.hasAttestation) {
    document.body.classList.remove('attestation-blur');
    return;
  }
  m.show(true);
}

/** Region selector (header "Taiwan" button, `#region-select` links). */
export async function showRegionSelector() {
  const m = await modal();
  if (!accepted()) {
    // still a prompt: open the two-pane prompt instead of a dismissible selector
    m.show(true, false);
    return;
  }
  m.show(false);
}

/** Not an authored block: an "Attestation" table in a document renders nothing. */
export default function decorate(block) {
  block.remove();
}
