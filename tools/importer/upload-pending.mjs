#!/usr/bin/env node
/*
 * Uploads + previews every content page that passes the upload guard and is new or changed
 * since its last upload (local file newer than the upload record), in batches.
 *
 *   node tools/importer/upload-pending.mjs [--limit 60] [--list]
 *
 * Run check-images.mjs and check-content.mjs first so tools/importer/reports/live-images.json
 * and content-mismatch.json are current (pages listed in either are skipped).
 */
import {
  readFileSync, existsSync, readdirSync, statSync,
} from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const args = process.argv.slice(2);
const li = args.indexOf('--limit');
const limit = li === -1 ? 60 : Number(args[li + 1]);
const up = existsSync('tools/importer/reports/da-upload.json') ? JSON.parse(readFileSync('tools/importer/reports/da-upload.json', 'utf-8')) : {};
const live = JSON.parse(readFileSync('tools/importer/reports/live-images.json', 'utf-8')).hits || {};
// pages whose content does not belong to their snapshot (wrong import source)
const MISMATCH = 'tools/importer/reports/content-mismatch.json';
const wrong = existsSync(MISMATCH) ? JSON.parse(readFileSync(MISMATCH, 'utf-8')) : {};

const all = [];
(function walk(d) {
  readdirSync(d).forEach((f) => {
    const p = join(d, f);
    // media-da: images; migration-status: guides the team maintains (never uploaded from here)
    if (f === 'media-da' || p === join('content', 'migration-status')) return;
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.plain.html')) all.push(p.slice('content'.length, -'.plain.html'.length));
  });
}('content'));

const todo = all.filter((p) => !live[p] && !wrong[p]).filter((p) => {
  const r = up[p];
  if (!r) return true;
  const mtime = statSync(`content${p}.plain.html`).mtimeMs;
  return !(r.upload < 300 && r.preview < 300) || Date.parse(r.at) < mtime - 1000;
});
console.log(`${all.length} pages, ${Object.keys(live).length} waiting for images, ${Object.keys(wrong).length} with wrong content, ${todo.length} to upload`);
if (args.includes('--list')) {
  console.log(todo.join('\n'));
} else if (todo.length) {
  const out = execFileSync('node', ['tools/importer/da-upload.mjs', '--force', ...todo.slice(0, limit)], { maxBuffer: 64 * 1024 * 1024 }).toString();
  console.log(out.split('\n').filter((l) => !/upload 20[01] preview 200/.test(l)).join('\n'));
}
