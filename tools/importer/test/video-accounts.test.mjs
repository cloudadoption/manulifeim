/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/*
 * Offline test for parsers/video.js playerUrl: a live video button without data-brightcoveid
 * takes its account from tools/importer/video-accounts.json (checked against
 * players.brightcove.net); buttons with an account are unchanged. No browser, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const { playerUrl } = await import(pathToFileURL(join(here, '..', 'parsers', 'video.js')).href);
const ACCOUNTS = JSON.parse(readFileSync(join(here, '..', 'video-accounts.json'), 'utf8'));

const button = (attrs) => new JSDOM(`<button ${attrs}>Play video</button>`).window.document.querySelector('button');

test('a button without account takes the checked account and the default player', () => {
  // global-macro-outlook-an-uneven-recovery: data-playerid of an unknown player, no account
  assert.equal(playerUrl(button('data-videomodal="6169714962001" data-playerid="Hkm5d1IMZe"')), 'https://players.brightcove.net/207397170001/default_default/index.html?videoId=6169714962001');
  // global-macro-outlook-navigating-covid-19: no account, no player
  assert.equal(playerUrl(button('data-videomodal="6148085086001"')), 'https://players.brightcove.net/207397170001/default_default/index.html?videoId=6148085086001');
});

test('an account on the button wins; an unknown id without account has no player URL', () => {
  assert.equal(playerUrl(button('data-videomodal="6378841654112" data-brightcoveid="640445594001" data-playerid="33YR0rw7vm"')), 'https://players.brightcove.net/640445594001/33YR0rw7vm_default/index.html?videoId=6378841654112');
  assert.equal(playerUrl(button('data-videomodal="6000000000001"')), '');
});

test('every entry of video-accounts.json names a numeric account and a player', () => {
  Object.entries(ACCOUNTS).filter(([k]) => !k.startsWith('_')).forEach(([id, v]) => {
    assert.match(id, /^\d+$/);
    assert.match(v.account, /^\d+$/);
    assert.ok(v.player);
  });
});
