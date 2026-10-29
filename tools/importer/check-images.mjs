#!/usr/bin/env node
/*
 * Lists content pages whose images still point at the live site (not downloaded yet). Such
 * pages must not go to DA: preview would pull the image from www.manulifeim.com (403 for
 * Edge Delivery too) and the page would show a broken image. Also lists pages over the
 * preview limit of 200 distinct images (counted by file name).
 *
 *   node tools/importer/check-images.mjs [--quiet] [<eds path> ...]
 *
 * Checks <img src> and <source srcset> of content/**.plain.html (all pages, or the paths
 * given). Writes tools/importer/reports/live-images.json; exit code 1 when a page is listed.
 * da-upload.mjs uses liveImages() and skips such pages unless --allow-live-images.
 */
import {
  readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync,
} from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

// also the live host with a second URL glued on: og:image "manulifeim.comhttps://..."
// on live, "manulifeim.comhttps//..." after the importer's URL normalization
const LIVE = /^(?:https?:)?\/\/(?:www\.)?manulifeim\.com(?:\/|https?:?\/\/)/i;
export const PAGE_IMAGE_LIMIT = 200;

/** Distinct image file names of a page's <img src> (query and path ignored). */
export function imageNames(html) {
  const names = [...html.matchAll(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => m[1].split(/[?#]/)[0].split('/').pop()).filter(Boolean);
  return [...new Set(names)];
}

/** Live image URLs used by a page's markup (deduplicated). */
export function liveImages(html) {
  const urls = new Set();
  [...html.matchAll(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)].forEach((m) => {
    if (LIVE.test(m[1].trim())) urls.add(m[1].trim());
  });
  [...html.matchAll(/<source\b[^>]*?\ssrcset\s*=\s*["']([^"']+)["']/gi)].forEach((m) => {
    m[1].split(',').map((s) => s.trim().split(/\s+/)[0]).filter((u) => LIVE.test(u))
      .forEach((u) => urls.add(u));
  });
  return [...urls];
}

function listPages(dir = 'content', out = []) {
  readdirSync(dir).forEach((f) => {
    const p = join(dir, f);
    if (f === 'media-da') return;
    if (statSync(p).isDirectory()) listPages(p, out);
    else if (f.endsWith('.plain.html')) out.push(p.replace(/^content/, '').replace(/\.plain\.html$/, ''));
  });
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const given = args.filter((a) => a.startsWith('/'));
  const pages = (given.length ? given : listPages()).sort();
  const hits = {};
  const over = {};
  pages.forEach((p) => {
    const file = `content${p}.plain.html`;
    if (!existsSync(file)) return;
    const html = readFileSync(file, 'utf-8');
    const urls = liveImages(html);
    if (urls.length) hits[p] = urls;
    const n = imageNames(html).length;
    if (n > PAGE_IMAGE_LIMIT) over[p] = n;
  });
  const listed = Object.keys(hits);
  mkdirSync('tools/importer/reports', { recursive: true });
  writeFileSync('tools/importer/reports/live-images.json', `${JSON.stringify({
    checked: pages.length, pages: listed.length, at: new Date().toISOString(), hits, overImageLimit: over,
  }, null, 1)}\n`);
  if (!quiet) listed.forEach((p) => console.log(`${p}  ${hits[p].length} live image(s)  ${hits[p][0]}`));
  const total = new Set(Object.values(hits).flat()).size;
  console.log(`${listed.length}/${pages.length} pages still use live images (${total} distinct URLs); see tools/importer/reports/live-images.json`);
  Object.entries(over).forEach(([p, n]) => console.log(`${p}  ${n} distinct images (preview limit ${PAGE_IMAGE_LIMIT})`));
  console.log(`${Object.keys(over).length} pages over ${PAGE_IMAGE_LIMIT} distinct images`);
  process.exit(listed.length || Object.keys(over).length ? 1 : 0);
}
