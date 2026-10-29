import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export const ORIGIN = 'https://www.manulifeim.com';
export const SNAP_DIR = 'tools/importer/snapshots';
export const HOST_DIR = `${SNAP_DIR}/www.manulifeim.com`;
export const MEDIA_DIR = 'content/media-da';

/**
 * Image URL with a second URL glued into the host (live og:image
 * "https://www.manulifeim.comhttps://author-tmp..."), raw or normalized ("comhttps//").
 * Never fetched: the queues skip it; its _images.json record and the page hold stay.
 */
export const gluedHost = (u) => /^(?:https?:)?\/\/[^/?#]*?https?:?\/\//i.test(u);

export function parseCsv(text) {
  const out = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  const [head, ...body] = out.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function readJson(file, def) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : def;
}

export function writeFile(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

export const readState = () => readJson(`${SNAP_DIR}/_state.json`, {});
export const writeState = (s) => writeFileSync(`${SNAP_DIR}/_state.json`, `${JSON.stringify(s, null, 1)}\n`);

/** Path of the import snapshot for a live path, as run-bulk-import --html-dir expects it. */
export const snapshotFile = (livePath) => `${HOST_DIR}/${livePath.replace(/^\//, '')}.html`;
