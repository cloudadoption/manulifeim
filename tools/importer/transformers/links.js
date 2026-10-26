/*
 * Links transformer (afterTransform, runs after the parsers and the section flattening).
 * Applies the central rules of utils/links.js (documented in LINKS.md) to every link and
 * makes every image src an absolute https://www.manulifeim.com URL (the bulk importer
 * later swaps them for the local /media-da copies through the snapshot sidecar maps).
 * Links that still point at www.manulifeim.com are collected in payload.ctx.unmigrated
 * for the import report.
 */
import { rewriteLinks, absoluteAssetUrl } from '../utils/links.js';
import { bestSrc } from '../utils/dom.js';

export default function transform(hookName, element, payload) {
  if (hookName !== 'afterTransform') return;
  const { document } = payload;
  const ctx = payload.ctx || {};
  if (!ctx.unmigrated) ctx.unmigrated = new Map();
  if (!ctx.rules) ctx.rules = {};
  rewriteLinks(document.body, ctx);
  document.body.querySelectorAll('img').forEach((img) => {
    const src = bestSrc(img);
    if (!src) {
      img.remove();
      return;
    }
    img.setAttribute('src', absoluteAssetUrl(src));
    ['srcset', 'data-src', 'data-srcset', 'loading', 'class', 'id', 'data-module', 'data-emptytext', 'draggable']
      .forEach((a) => img.removeAttribute(a));
  });
  // drop presentation attributes the importer does not need
  document.body.querySelectorAll('[style], [target], [aria-label], [data-module]').forEach((n) => {
    ['style', 'target', 'aria-label', 'data-module'].forEach((a) => n.removeAttribute(a));
  });
}
