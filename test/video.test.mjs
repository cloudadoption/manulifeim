/* scripts/video.js, blocks/video and the video promo (node --test + jsdom, no network). */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

const PLAYER = 'https://players.brightcove.net/640445594001/1QVD66lj_default/index.html?videoId=6241932992001';
const TRANSCRIPT = 'https://www.manulifeim.com/content/dam/x/video-transcript.srt';

function setup() {
  const virtualConsole = new VirtualConsole(); // drops jsdom's 'navigation not implemented'
  const dom = new JSDOM('<!DOCTYPE html><body><main></main></body>', { url: 'https://main--manulifeim--cloudadoption.aem.page/x', virtualConsole });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [] }) });
  return dom;
}

// fresh module instances per test (scripts/video.js keeps one shared dialog)
let n = 0;
const fresh = (path) => import(`${path}?t=${n += 1}`);

function blockFrom(html) {
  const main = document.querySelector('main');
  main.innerHTML = `<div class="video">${html}</div>`;
  return main.querySelector('.video');
}

const settle = () => new Promise((r) => { setTimeout(r, 0); });

beforeEach(() => setup());

test('isVideoUrl: Brightcove player links with a video id only', async () => {
  const { isVideoUrl } = await fresh('../scripts/video.js');
  assert.equal(isVideoUrl(PLAYER), true);
  assert.equal(isVideoUrl('https://players.brightcove.net/640445594001/1QVD66lj_default/index.html'), false);
  assert.equal(isVideoUrl('https://www.youtube.com/watch?v=abc'), false);
  assert.equal(isVideoUrl('/institutional/tw/en'), false);
  assert.equal(isVideoUrl('not a url ::'), false);
});

test('video block: poster, play button, caption; click opens the player modal with autoplay and transcript', async () => {
  const { default: decorate } = await fresh('../blocks/video/video.js');
  const block = blockFrom(`<div><div><picture><img src="/media-da/poster.jpg" alt="Municipal building"></picture>
    <p><a href="${PLAYER}">${PLAYER}</a></p><p>Building the case for healthy real estate webinar</p>
    <p><a href="${TRANSCRIPT}">Transcript</a></p></div></div>`);
  await decorate(block);
  const button = block.querySelector('button.video-media');
  assert.ok(button, 'play button');
  assert.ok(button.querySelector('picture img'), 'poster inside the button');
  assert.equal(button.getAttribute('aria-label'), 'Play video: Building the case for healthy real estate webinar');
  assert.equal(button.querySelector('.video-caption').textContent.trim(), 'Building the case for healthy real estate webinar', 'caption on the poster (live videoSmall)');
  assert.equal(block.querySelector('figcaption'), null);
  assert.equal(block.querySelectorAll('a').length, 0, 'player and transcript links are consumed');
  button.click();
  await settle();
  const dialog = document.querySelector('dialog.video-modal');
  assert.ok(dialog, 'modal dialog');
  const iframe = dialog.querySelector('iframe');
  const src = new URL(iframe.src);
  assert.equal(src.hostname, 'players.brightcove.net');
  assert.equal(src.searchParams.get('videoId'), '6241932992001');
  assert.equal(src.searchParams.get('autoplay'), 'true');
  const link = dialog.querySelector('.video-modal-transcript');
  assert.equal(link.hidden, false);
  assert.equal(link.href, TRANSCRIPT);
  dialog.querySelector('.video-modal-close').click();
  assert.equal(dialog.querySelector('iframe'), null, 'closing removes the player');
});

test('video block: rows split over cells and no transcript; without a player link only poster and caption', async () => {
  const { default: decorate } = await fresh('../blocks/video/video.js');
  const block = blockFrom(`<div><div><picture><img src="/media-da/p.jpg" alt=""></picture></div></div>
    <div><div><a href="${PLAYER}">${PLAYER}</a></div></div>`);
  await decorate(block);
  assert.ok(block.querySelector('button.video-media picture'));
  assert.equal(block.querySelector('button').getAttribute('aria-label'), 'Play video');
  assert.equal(block.querySelector('figcaption'), null);

  const plain = blockFrom('<div><div><picture><img src="/media-da/p.jpg" alt=""></picture><p>Caption only</p></div></div>');
  await decorate(plain);
  assert.equal(plain.querySelector('button'), null);
  assert.ok(plain.querySelector('div.video-media picture'));
  assert.equal(plain.querySelector('div.video-media .video-caption').textContent, 'Caption only');
});

test('video small: the caption sits in the poster after the play label; a list of links follows the poster', async () => {
  const { default: decorate } = await fresh('../blocks/video/video.js');
  const main = document.querySelector('main');
  main.innerHTML = `<div class="video small"><div><div><p><picture><img src="/media-da/p.jpg" alt="Frances Donald"></picture></p>
    <p><a href="${PLAYER}">${PLAYER}</a></p><p>The global economic recovery might be underway.</p>
    <ul><li><a href="/institutional/tw/en/resources/documents/transcript-key-risks">Download transcript (PDF)</a></li></ul></div></div></div>`;
  const block = main.querySelector('.video');
  await decorate(block);
  const button = block.querySelector('button.video-media');
  assert.deepEqual([...button.children].map((c) => c.className || c.tagName.toLowerCase()), ['picture', 'video-play-icon', 'video-play-label', 'video-caption']);
  assert.equal(button.querySelector('.video-caption').textContent, 'The global economic recovery might be underway.');
  assert.equal(block.querySelector('figcaption'), null);
  assert.equal(button.getAttribute('aria-label'), 'Play video: The global economic recovery might be underway.');
  const list = block.querySelector(':scope > ul.video-links');
  assert.ok(list, 'links under the figure');
  assert.equal(list.previousElementSibling.tagName, 'FIGURE');
  assert.equal(list.querySelector('a').textContent, 'Download transcript (PDF)', 'a listed link stays a link (not the modal transcript)');
});

test('video (default): a list of links also shows under the poster, the caption is on the poster', async () => {
  const { default: decorate } = await fresh('../blocks/video/video.js');
  const block = blockFrom(`<div><div><picture><img src="/media-da/p.jpg" alt=""></picture><p><a href="${PLAYER}">${PLAYER}</a></p>
    <p>Caption</p><ul><li><a href="/x.pdf">Download</a></li><li><a href="/y.pdf">Slides</a></li></ul></div></div>`);
  await decorate(block);
  assert.equal(block.querySelector('button.video-media .video-caption').textContent, 'Caption');
  assert.deepEqual([...block.querySelectorAll('ul.video-links a')].map((a) => a.textContent), ['Download', 'Slides']);
});

test('player links anywhere open the modal on a plain click; modified clicks and other links are left alone', async () => {
  const { decorateVideoLinks } = await fresh('../scripts/video.js');
  const main = document.querySelector('main');
  main.innerHTML = `<p><a id="v" href="${PLAYER}">Watch the video</a></p><p><a id="o" href="/institutional/tw/en">Home</a></p>`;
  decorateVideoLinks(main);
  decorateVideoLinks(main); // idempotent
  const click = (el, init = {}) => {
    const e = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    el.dispatchEvent(e);
    return e;
  };
  assert.equal(click(document.getElementById('v'), { ctrlKey: true }).defaultPrevented, false);
  assert.equal(document.querySelector('dialog.video-modal'), null);
  assert.equal(click(document.getElementById('v')).defaultPrevented, true);
  await settle();
  assert.equal(document.querySelectorAll('dialog.video-modal').length, 1);
  assert.equal(document.querySelector('dialog.video-modal iframe').title, 'Watch the video');
  assert.equal(document.querySelector('.video-modal-transcript').hidden, true);
  assert.equal(document.getElementById('o').dataset.video, undefined);
});

test('video promo: the Transcript link moves onto the player link', async () => {
  const { default: decoratePromo } = await fresh('../blocks/promo/promo.js');
  const main = document.querySelector('main');
  main.innerHTML = `<div class="promo green"><div><div><picture><img src="/media-da/t.jpg" alt=""></picture></div>
    <div><h2>In this short video …</h2><p><a href="${PLAYER}">Watch now</a></p><p><a href="${TRANSCRIPT}">Transcript</a></p></div><div>green</div></div></div>`;
  decoratePromo(main.querySelector('.promo'));
  const links = [...main.querySelectorAll('.promo-content a')];
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, 'Watch now');
  assert.equal(links[0].dataset.transcript, TRANSCRIPT);
});
