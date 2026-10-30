/*
 * Brightcove video player (replaces the live videoModal).
 *
 * A link to https://players.brightcove.net/{account}/{player}_default/index.html?videoId={id}
 * opens the player in a modal <dialog> instead of leaving the page; the href stays as authored,
 * so new-tab clicks and pages without JavaScript still reach the player. Used by
 * blocks/video and, for links in any other block or default content, by scripts.js.
 * Modal styles: styles/lazy-styles.css (.video-modal).
 */
import { fetchPlaceholders, placeholder } from './placeholders.js';

const PLAYER_HOST = 'players.brightcove.net';

/** True for a Brightcove player URL with a video id. */
export function isVideoUrl(href) {
  try {
    const url = new URL(href, window.location.href);
    return url.hostname === PLAYER_HOST && !!url.searchParams.get('videoId');
  } catch (e) {
    return false;
  }
}

/** Player URL for the iframe: the authored URL with autoplay on. */
export function embedUrl(href) {
  const url = new URL(href, window.location.href);
  url.searchParams.set('autoplay', 'true');
  return url.href;
}

let dialog;

/**
 * Closes the dialog (also where <dialog>.close is missing). The player goes at once (the
 * 'close' event, which also covers Escape, fires asynchronously).
 */
function closeDialog(d) {
  d.querySelector('.video-modal-player')?.replaceChildren();
  if (typeof d.close === 'function') {
    d.close();
    return;
  }
  d.removeAttribute('open');
  d.dispatchEvent(new Event('close'));
}

function buildDialog(ph) {
  const d = document.createElement('dialog');
  d.className = 'video-modal';
  d.setAttribute('aria-label', placeholder(ph, 'videoDialog', 'Video'));
  const wrap = document.createElement('div');
  wrap.className = 'video-modal-wrap';
  const frame = document.createElement('div');
  frame.className = 'video-modal-player';
  const transcript = document.createElement('a');
  transcript.className = 'video-modal-transcript';
  transcript.target = '_blank';
  transcript.rel = 'noopener';
  transcript.textContent = placeholder(ph, 'videoTranscript', 'Transcript');
  transcript.hidden = true;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'video-modal-close';
  close.setAttribute('aria-label', placeholder(ph, 'videoClose', 'Close'));
  close.addEventListener('click', () => closeDialog(d));
  wrap.append(frame, transcript, close);
  d.append(wrap);
  // a click on the backdrop (the dialog itself, outside the wrap) closes it
  d.addEventListener('click', (e) => {
    if (e.target === d) closeDialog(d);
  });
  // stop playback when the dialog closes (Escape too); the event fires asynchronously, so a
  // video opened again in the meantime stays
  d.addEventListener('close', () => {
    if (d.open) return;
    frame.replaceChildren();
    // back to the control that opened the player
    if (d.opener && d.opener.isConnected) d.opener.focus();
  });
  document.body.append(d);
  return d;
}

/**
 * Opens the player in the shared modal dialog.
 * @param {{href: string, title?: string, transcript?: string}} video
 * @returns {Promise<HTMLDialogElement>}
 */
export async function openVideo({ href, title, transcript }) {
  const opener = document.activeElement;
  const ph = await fetchPlaceholders();
  if (!dialog || !dialog.isConnected) dialog = buildDialog(ph);
  dialog.opener = opener && opener !== document.body ? opener : null;
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl(href);
  iframe.title = title || placeholder(ph, 'videoDialog', 'Video');
  iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  dialog.querySelector('.video-modal-player').replaceChildren(iframe);
  const link = dialog.querySelector('.video-modal-transcript');
  link.hidden = !transcript;
  if (transcript) link.href = transcript;
  else link.removeAttribute('href');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  // focus stays in this document (not in the player iframe), so Escape closes the dialog
  dialog.querySelector('.video-modal-close').focus();
  return dialog;
}

/**
 * Makes every player link under root open the modal (plain left clicks only; idempotent).
 * The transcript comes from the link's data-transcript, if a block set one.
 */
export function decorateVideoLinks(root) {
  root.querySelectorAll('a[href]').forEach((a) => {
    if (a.dataset.video === 'ready' || !isVideoUrl(a.getAttribute('href'))) return;
    a.dataset.video = 'ready';
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openVideo({ href: a.href, title: a.textContent.trim(), transcript: a.dataset.transcript });
    });
  });
}
