#!/usr/bin/env node
/*
 * Captures the queued pages (snapshots/_queue.json, see queue.mjs) through the Bright Data
 * browser (BD_ENDPOINT, CDP), in one warm session per run: load /institutional/tw/en, accept the
 * attestation, then one page every 5-10 s. Every page is stored on disk as soon as it is read
 * (store.mjs), so a run can stop at any point and the next one resumes from _state.json.
 *
 *   node tools/importer/snapshot/bd-capture.mjs [--budget 480]            pages from _queue.json
 *   node tools/importer/snapshot/bd-capture.mjs --images [--budget 480]   images from _img-queue.json
 *
 * Stops at the first 403/429 (exit 2) and records it in snapshots/_blocked.json.
 * PLAYWRIGHT_MODULE overrides where the playwright package is loaded from.
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import storeRecords from './store.mjs';
import { ORIGIN, SNAP_DIR } from './lib.mjs';

const require = createRequire(import.meta.url);
const PW = process.env.PLAYWRIGHT_MODULE
  || '/home/node/.excat-marketplaces/excat-marketplace/excat/skills/excat-content-import/scripts/node_modules/playwright';
const { chromium } = require(PW);

const args = process.argv.slice(2);
const images = args.includes('--images');
const bi = args.indexOf('--budget');
const budgetMs = (bi === -1 ? 480 : Number(args[bi + 1])) * 1000;
const HOME = `${ORIGIN}/institutional/tw/en`;
const t0 = Date.now();
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

if (!process.env.BD_ENDPOINT) {
  console.error('BD_ENDPOINT is not set');
  process.exit(1);
}

function blockedAt(url, status, error) {
  writeFileSync(`${SNAP_DIR}/_blocked.json`, JSON.stringify({
    url, status, error, at: new Date().toISOString(), via: 'bd',
  }, null, 1));
}

async function warm(page) {
  const resp = await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const status = resp ? resp.status() : 0;
  if (status !== 200) return status;
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  const agree = page.getByRole('button', { name: 'I agree' });
  if (await agree.isVisible().catch(() => false)) await agree.click().catch(() => {});
  const reject = page.getByRole('button', { name: 'Reject optional cookies' });
  await reject.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => {});
  return status;
}

async function capturePage(page, url) {
  const rec = { url, at: new Date().toISOString(), via: 'bd' };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    rec.status = resp ? resp.status() : 0;
    rec.finalUrl = page.url();
    const chain = [];
    let r = resp && resp.request().redirectedFrom();
    while (r) {
      chain.push(r.url());
      r = r.redirectedFrom();
    }
    rec.redirectedFrom = chain;
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    await sleep(2000);
    rec.title = await page.title();
    rec.rendered = await page.evaluate(() => {
      const d = document.documentElement.cloneNode(true);
      d.querySelectorAll('script, noscript, iframe, link[rel=preload], link[rel=prefetch], link[rel=modulepreload]').forEach((e) => e.remove());
      return `<!DOCTYPE html>\n${d.outerHTML}`;
    });
  } catch (e) {
    rec.error = String(e.message || e).slice(0, 300);
  }
  if ([403, 429, 503].includes(rec.status) || /access denied/i.test(rec.title || '')) {
    rec.blocked = true;
    delete rec.rendered;
  }
  return rec;
}

async function fetchImages(page, urls) {
  return page.evaluate(async (list) => {
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const url = list[i];
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(url, { credentials: 'include' });
        // eslint-disable-next-line no-await-in-loop
        const blob = await r.blob();
        // eslint-disable-next-line no-await-in-loop
        const b64 = r.ok ? await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1]);
          fr.readAsDataURL(blob);
        }) : null;
        out.push({
          url, status: r.status, type: blob.type, b64,
        });
        if ([403, 429].includes(r.status)) break;
      } catch (e) {
        out.push({ url, status: 0, error: String(e.message || e) });
      }
    }
    return out;
  }, urls);
}

const browser = await chromium.connectOverCDP(process.env.BD_ENDPOINT, { timeout: 60000 });
let exitCode = 0;
try {
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const homeStatus = await warm(page);
  log(`warm-up ${HOME} -> ${homeStatus}`);
  if (homeStatus !== 200) {
    blockedAt(HOME, homeStatus, 'warm-up');
    exitCode = 2;
  } else if (images) {
    const { urls } = JSON.parse(readFileSync(`${SNAP_DIR}/_img-queue.json`, 'utf-8'));
    for (let i = 0; i < urls.length && Date.now() - t0 < budgetMs; i += 20) {
      const chunk = urls.slice(i, i + 20);
      // eslint-disable-next-line no-await-in-loop
      const res = await fetchImages(page, chunk);
      const file = `/tmp/img-${Date.now()}.json`;
      writeFileSync(file, JSON.stringify(res));
      try {
        log(execFileSync('node', ['tools/importer/snapshot/images.mjs', 'ingest', file]).toString().trim());
      } catch (e) {
        log(String(e.stdout || e.message).trim());
        exitCode = 2;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(2000);
    }
  } else {
    const { urls } = JSON.parse(readFileSync(`${SNAP_DIR}/_queue.json`, 'utf-8'));
    for (let i = 0; i < urls.length && Date.now() - t0 < budgetMs; i += 1) {
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const rec = await capturePage(page, urls[i]);
      const res = storeRecords([rec]);
      log(`${rec.status ?? '-'} ${urls[i].replace(ORIGIN, '')} ${rec.error || ''} (snapshots ${res.done}/${res.total})`);
      if (rec.blocked) {
        blockedAt(urls[i], rec.status, rec.error);
        exitCode = 2;
        break;
      }
      const wait = 5000 + Math.random() * 5000 - (Date.now() - started);
      // eslint-disable-next-line no-await-in-loop
      if (wait > 0) await sleep(wait);
    }
  }
  await page.close().catch(() => {});
} finally {
  await browser.close().catch(() => {});
}
process.exit(exitCode);
