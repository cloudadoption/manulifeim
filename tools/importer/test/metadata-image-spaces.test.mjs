/* eslint-disable max-len, import/no-unresolved, import/extensions, import/no-extraneous-dependencies */
/* global globalThis */
/*
 * Offline test for transformers/metadata.js: the og:image URL keeps its inner whitespace, so a DAM
 * file name with a double space (how-retirement-investments-align-with-long-term-environmental-goals:
 * "Viewpoint -  How …") still matches the stored image instead of becoming a URL that 404s.
 * Other metadata values are still whitespace-normalised. No browser, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { register } from 'module';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}`)}`);
const metadata = (await import(pathToFileURL(join(here, '..', 'transformers', 'metadata.js')).href)).default;

const HERO = 'https://www.manulifeim.com/content/dam/jhi-investments/JHINV/public/Corporate/Viewpoints/Viewpoints/iinv-6681-cn-institutional---retirement-viewpoint----how-retirement-investments-align-with-long-term-environmental-goals/IINV-6681 CN Institutional and Retirement Viewpoint -  How retirement investments align with long-term environmental goals_hero.jpg';

test('og:image keeps its double space; the description is still normalised', () => {
  const { document } = new JSDOM(`<html><head><title>How retirement investments align</title>
    <meta name="description" content="  Two   spaces  ">
    <meta property="og:image" content=" ${HERO} "></head><body><main></main></body></html>`, { url: 'https://www.manulifeim.com/institutional/tw/en/viewpoints/sustainability/x' }).window;
  let cells;
  globalThis.WebImporter = { Blocks: { getMetadataBlock: (doc, c) => { cells = c; return doc.createElement('table'); } } };
  const ctx = {};
  metadata('beforeTransform', document.body, { document, ctx, template: { name: 'viewpoint' } });
  metadata('afterTransform', document.body, { document, ctx, template: { name: 'viewpoint' } });
  assert.equal(ctx.metadata.Image, HERO);
  assert.equal(cells.Image.getAttribute('src'), new URL(HERO).href);
  assert.match(cells.Image.getAttribute('src'), /Viewpoint%20-%20%20How/);
  assert.equal(ctx.metadata.Description, 'Two spaces');
});
