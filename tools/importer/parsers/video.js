/* eslint-disable */
/* global WebImporter */
/*
 * Parser: video. Live: .videoKicker > .videoSmall__container (poster image, play button with
 * data-videomodal / data-brightcoveid / data-playerid, description).
 * Project contract (blocks/video/video.js; EDS library Video: 1 column, 2 rows):
 *   | Video |
 *   | poster image                                                                       |
 *   |   https://players.brightcove.net/{account}/{player}_default/index.html?videoId={id} |
 *   |   caption (optional) / [Transcript](url) (optional, from data-transcript-url)      |
 * Poster, player link, caption and transcript share the one content cell.
 * Without a video id the component stays default content (poster + caption).
 */
import {
  h, image, block, text, linkParagraph, richText,
} from '../utils/dom.js';
import { absoluteAssetUrl } from '../utils/links.js';
import VIDEO_ACCOUNTS from '../video-accounts.json';

/**
 * Brightcove player URL from an element carrying the live data-* attributes, or ''. A button
 * without data-brightcoveid takes its account and player from video-accounts.json (checked
 * against players.brightcove.net), else it has no URL.
 */
export function playerUrl(el) {
  const src = el && (el.matches('[data-videomodal]') ? el : el.querySelector('[data-videomodal]'));
  if (!src) return '';
  const video = (src.getAttribute('data-videomodal') || '').trim();
  const known = VIDEO_ACCOUNTS[video];
  let account = (src.getAttribute('data-brightcoveid') || '').trim();
  let player = (src.getAttribute('data-playerid') || '').trim() || 'default';
  if (!account && known) ({ account, player } = known);
  if (!/^\d+$/.test(video) || !/^\d+$/.test(account)) return '';
  return `https://players.brightcove.net/${account}/${player}_default/index.html?videoId=${video}`;
}

/** Transcript URL from data-transcript-url (absolute on the live origin), or ''. */
export function transcriptUrl(el) {
  const src = el && (el.matches('[data-transcript-url]') ? el : el.querySelector('[data-transcript-url]'));
  const t = src ? (src.getAttribute('data-transcript-url') || '').trim() : '';
  return t ? absoluteAssetUrl(t) : '';
}

export default function parse(element, { document }) {
  const url = playerUrl(element);
  if (!url) {
    element.replaceWith(...richText(document, element));
    return;
  }
  const content = [];
  const poster = image(document, element.querySelector('.videoSmall__image, img'));
  if (poster) content.push(poster);
  content.push(linkParagraph(document, url, url));
  const caption = text(element.querySelector('.videoSmall__description'));
  if (caption) content.push(h(document, 'p', caption));
  const transcript = transcriptUrl(element);
  if (transcript) content.push(linkParagraph(document, transcript, 'Transcript'));
  element.replaceWith(block(document, 'Video', [], [[content]]));
}
