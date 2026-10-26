/*
 * Stores captured page records as snapshots on disk:
 *   snapshots/www.manulifeim.com/<live path>.html   rendered DOM, scripts removed (import source)
 * records the outcome per live path in snapshots/_state.json and appends to _log.jsonl.
 * Image URLs found in a snapshot are added to snapshots/_images.json for the image capture.
 */
import { readFileSync, appendFileSync } from 'fs';
import { gzipSync } from 'zlib';
import {
  parseCsv, readState, writeState, writeFile, snapshotFile, readJson, ORIGIN, SNAP_DIR,
} from './lib.mjs';

const IMG_RE = /(src|srcset|data-src|data-srcset|href)="([^"]+\.(?:jpe?g|png|gif|svg|webp)(?:\?[^"]*)?(?:\s+\d+[wx])?(?:,[^"]*)?)"|url\((?:&quot;|["'])?([^)"'&]+\.(?:jpe?g|png|gif|svg|webp))/gi;

export function imageUrls(html) {
  const found = new Set();
  html.replace(IMG_RE, (m, attr, value, cssUrl) => {
    // srcset lists "url descriptor" pairs; other attributes hold one URL that may contain spaces
    const parts = attr && /srcset/i.test(attr)
      ? value.split(/,\s+/).map((p) => p.trim().replace(/\s+\d+(?:\.\d+)?[wx]$/, ''))
      : [(value || cssUrl).trim()];
    parts.forEach((part) => {
      const u = part.replace(/&amp;/g, '&');
      if (!u || u.startsWith('data:')) return;
      try {
        const abs = new URL(u, ORIGIN);
        if (abs.hostname === 'www.manulifeim.com' && abs.pathname.startsWith('/content/dam/')) found.add(abs.href);
      } catch (e) { /* ignore */ }
    });
    return m;
  });
  return found;
}

/**
 * @param {object[]} batch records {url, status, finalUrl, redirectedFrom, title, rendered, raw,
 *   error, blocked, at, via}
 * @returns {{stored: number, blocked: object[], odd: object[], done: number, total: number,
 *   pendingImages: number}}
 */
export default function storeRecords(batch) {
  const rows = parseCsv(readFileSync('tools/migration-scope/pages.csv', 'utf-8'));
  const byPath = Object.fromEntries(rows.map((r) => [r.live_path, r]));
  const state = readState();
  const images = readJson(`${SNAP_DIR}/_images.json`, {});
  const blocked = [];
  let stored = 0;

  batch.forEach((rec) => {
    const livePath = new URL(rec.url).pathname;
    const row = byPath[livePath] || {};
    if (rec.blocked) {
      // blocked pages are not recorded as done; they are captured once the site responds
      blocked.push(rec);
      appendFileSync(`${SNAP_DIR}/_log.jsonl`, `${JSON.stringify({
        path: livePath, status: rec.status, blocked: true, at: rec.at, via: rec.via, error: rec.error,
      })}\n`);
      return;
    }
    const entry = {
      group: row.template_group,
      status: rec.status ?? null,
      finalUrl: rec.finalUrl,
      redirectedFrom: rec.redirectedFrom?.length ? rec.redirectedFrom : undefined,
      title: rec.title,
      at: rec.at,
      via: rec.via,
      error: rec.error,
    };
    if (rec.rendered && rec.status === 200) {
      writeFile(snapshotFile(livePath), rec.rendered);
      if (rec.raw) writeFile(snapshotFile(livePath).replace(/\.html$/, '.raw.html.gz'), gzipSync(rec.raw));
      entry.file = snapshotFile(livePath);
      entry.bytes = rec.rendered.length;
      const routeClass = rec.rendered.match(/data-route-class="([^"]*)"/);
      if (routeClass) [, entry.routeClass] = routeClass;
      imageUrls(rec.rendered).forEach((u) => {
        if (!images[u]) images[u] = { pages: [] };
        if (!images[u].pages.includes(livePath)) images[u].pages.push(livePath);
      });
      stored += 1;
    }
    state[livePath] = entry;
    appendFileSync(`${SNAP_DIR}/_log.jsonl`, `${JSON.stringify({ path: livePath, ...entry })}\n`);
  });

  writeState(state);
  writeFile(`${SNAP_DIR}/_images.json`, JSON.stringify(images, null, 1));
  return {
    stored,
    blocked,
    odd: batch.filter((r) => !r.blocked && (r.status !== 200 || r.error)),
    done: Object.values(state).filter((s) => s.status === 200).length,
    total: rows.length,
    pendingImages: Object.values(images).filter((i) => !i.file && !i.status).length,
  };
}
