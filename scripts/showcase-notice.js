/**
 * Showcase notice: a modal telling visitors that this replica is a technical showcase, not an
 * official Manulife Investment Management website. Same behaviour as the Lufthansa replica
 * (moved-permanently/lh-com scripts/showcase-notice.js).
 *
 * - Loaded from loadDelayed() (scripts/scripts.js), about 3.5 s after load: no LCP impact.
 * - Waits until the Taiwan attestation prompt is accepted (body.attestation-blur removed),
 *   so the two modals never stack.
 * - Native <dialog> opened with showModal(). Escape does not close it (the cancel event is
 *   prevented, closedby="none" where supported, and a close without the button reopens it);
 *   only the "I understand" button does.
 * - The button stores the acknowledgement in localStorage 'mim-showcase-acknowledged': the
 *   notice shows once per browser for every page. Without storage the button still closes it
 *   for the current page view.
 * - Never shown inside iframes (DA preview, Universal Editor) or under /tools/.
 */
import { loadCSS } from './aem.js';

export const STORAGE_KEY = 'mim-showcase-acknowledged';

const TEXT = {
  title: 'Technical showcase',
  text: 'This page is a technical showcase, not an official Manulife Investment Management website. It is for demonstration purposes only.',
  button: 'I understand',
};

/* the attestation dialog fades out over 300 ms after "I agree" */
const AFTER_ATTESTATION_MS = 400;

let shown = false;

function isAcknowledged() {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return false;
  }
}

function acknowledge() {
  try {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch (e) {
    // storage blocked: the notice closes for this page view only
  }
}

/**
 * Whether the notice applies to the current page view.
 * @returns {boolean}
 */
export function shouldShowNotice() {
  if (window.self !== window.top) return false;
  if (window.location.pathname.startsWith('/tools/')) return false;
  return !isAcknowledged();
}

/**
 * Resolves once the attestation prompt is no longer pending.
 * @returns {Promise<void>}
 */
function attestationSettled() {
  const pending = () => document.body.classList.contains('attestation-blur');
  if (!pending()) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (pending()) return;
      observer.disconnect();
      setTimeout(resolve, AFTER_ATTESTATION_MS);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
}

function buildDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'showcase-notice';
  dialog.lang = 'en';
  dialog.setAttribute('aria-labelledby', 'showcase-notice-title');
  dialog.setAttribute('aria-describedby', 'showcase-notice-text');
  dialog.setAttribute('closedby', 'none');

  const title = document.createElement('h2');
  title.id = 'showcase-notice-title';
  title.className = 'showcase-notice-title';
  title.textContent = TEXT.title;

  const text = document.createElement('p');
  text.id = 'showcase-notice-text';
  text.className = 'showcase-notice-text';
  text.textContent = TEXT.text;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button primary showcase-notice-button';
  button.textContent = TEXT.button;

  dialog.append(title, text, button);
  return { dialog, button };
}

/**
 * Shows the notice once per page view, unless acknowledged or not applicable.
 */
export default async function showShowcaseNotice() {
  if (shown || !shouldShowNotice()) return;
  shown = true;
  await attestationSettled();
  await loadCSS(`${window.hlx.codeBasePath}/styles/showcase-notice.css`);

  const { dialog, button } = buildDialog();
  let confirmed = false;
  // Escape (and any other close request) must not dismiss the notice
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  dialog.addEventListener('close', () => {
    // browsers may skip a cancelable cancel event (no user activation): reopen
    if (!confirmed && dialog.isConnected) dialog.showModal();
  });
  button.addEventListener('click', () => {
    confirmed = true;
    acknowledge();
    dialog.close();
    dialog.remove();
    document.documentElement.classList.remove('showcase-notice-open');
  });

  document.body.append(dialog);
  document.documentElement.classList.add('showcase-notice-open');
  dialog.showModal();
}
