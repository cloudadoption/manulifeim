#!/usr/bin/env node
/*
 * Builds an offline mirror of captured live pages for visual comparison: the rendered snapshot
 * with the live stylesheets, fonts and images pointed at local copies, so it renders like live
 * without loading anything from www.manulifeim.com. Scripts were removed at capture, so
 * interactive parts (carousel, flyouts, mobile menu) show their initial state only.
 *
 *   node tools/importer/snapshot/mirror.mjs [<live path> ...]   (default: every captured page)
 *
 * Output: tools/importer/snapshots/mirror/<live path>.html, served by the dev server at
 * /tools/importer/snapshots/mirror/<live path>.html
 */
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import {
  SNAP_DIR, readState, readJson, writeFile, snapshotFile,
} from './lib.mjs';

const ASSETS = `/${SNAP_DIR}/assets`;
const state = readState();
const images = readJson(`${SNAP_DIR}/_images.json`, {});
const byUrl = {};
Object.entries(images).forEach(([u, e]) => {
  if (e.file) {
    byUrl[u] = e.file;
    byUrl[decodeURI(u)] = e.file;
  }
});

// fonts referenced relatively from the live CSS
const fontDir = `${SNAP_DIR}/assets/etc.clientlibs/jhi-commons-v1/clientlibs/clientlib-base/resources`;
mkdirSync(fontDir, { recursive: true });
['Light', 'Regular', 'Demibold', 'Bold'].forEach((w) => {
  const src = `fonts/manulifejhsans-${w.toLowerCase()}.woff2`;
  if (existsSync(src)) copyFileSync(src, `${fontDir}/ManulifeJHSans-${w}.woff2`);
});
if (existsSync('fonts/manulifejhserif-italic.woff2')) copyFileSync('fonts/manulifejhserif-italic.woff2', `${fontDir}/ManulifeJHSerif-Italic.woff2`);

const localImage = (u) => {
  try {
    const abs = new URL(u.replace(/&amp;/g, '&'), 'https://www.manulifeim.com').href;
    return byUrl[abs] || byUrl[decodeURI(abs)] || null;
  } catch (e) {
    return null;
  }
};

const paths = process.argv.slice(2).length ? process.argv.slice(2)
  : Object.keys(state).filter((p) => state[p].file);
let n = 0;
paths.forEach((p) => {
  const file = snapshotFile(p);
  if (!existsSync(file)) return;
  let html = readFileSync(file, 'utf-8');
  // stylesheets → local copies (unknown ones are dropped so nothing loads from live)
  html = html.replace(/<link[^>]+rel="stylesheet"[^>]*>/g, (tag) => {
    const href = (tag.match(/href="([^"]+)"/) || [])[1] || '';
    const { pathname, hostname } = new URL(href, 'https://www.manulifeim.com');
    if (hostname === 'www.manulifeim.com' && existsSync(`${SNAP_DIR}/assets${pathname}`)) {
      return `<link rel="stylesheet" href="${ASSETS}${pathname}">`;
    }
    return '';
  });
  // any other link (icons, preconnect, manifest) would load from live
  html = html.replace(/<link(?![^>]*href="\/tools\/)[^>]*>/g, '');
  // images (src/srcset) → /media-da copies, else a blank placeholder (never live)
  html = html.replace(/\s(src|srcset|data-src|data-srcset)="([^"]*)"/g, (m, attr, val) => {
    if (val.startsWith('data:') || val.startsWith('/media-da/')) return m;
    if (/srcset/.test(attr)) {
      const parts = val.split(/,\s+/).map((part) => {
        const [u, d] = part.trim().split(/\s+(?=\d+(?:\.\d+)?[wx]$)/);
        const l = localImage(u);
        return l ? `${l}${d ? ` ${d}` : ''}` : null;
      }).filter(Boolean);
      return parts.length ? ` ${attr}="${parts.join(', ')}"` : '';
    }
    const l = localImage(val);
    if (l) return ` ${attr}="${l}"`;
    return /^(https?:)?\/\//.test(val) || val.startsWith('/') ? ` ${attr}="data:,"` : m;
  });
  html = html.replace(/url\((&quot;|["'])?(\/content\/dam\/[^)"'&]+)(&quot;|["'])?\)/g, (m, q1, u) => {
    const l = localImage(u);
    return l ? `url(${l})` : 'url(data:,)';
  });
  // links stay inert in the mirror
  html = html.replace(/<base[^>]*>/g, '').replace('<head>', '<head><base target="_self">');
  writeFile(`${SNAP_DIR}/mirror/${p.replace(/^\//, '')}.html`, html);
  n += 1;
});
console.log(`mirrored ${n} pages`);
