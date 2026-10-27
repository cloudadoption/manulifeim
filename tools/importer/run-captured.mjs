#!/usr/bin/env node
/*
 * Imports captured pages from the snapshots (never the live site) with the excat bulk importer,
 * template by template, skipping pages already imported unless --force.
 *
 *   node tools/importer/run-captured.mjs [--template viewpoint] [--limit 40] [--force]
 *   node tools/importer/run-captured.mjs --paths /institutional/tw/en/QMSR,/institutional/tw/en/x
 *     (re-imports exactly these live paths, implies --force)
 *
 * Writes tools/importer/urls-<template>.txt and runs run-bulk-import.js with --html-dir on a
 * staged copy of the batch's snapshots (tools/importer/snapshots/_import). Each staged copy
 * gets a click guard: the bulk importer's dismissPopups clicks visible "accept"/"agree"
 * elements, and with no CSS loaded the live attestation link ("I agree" ->
 * https://www.manulifeim.com/institutional/kr/en/<path>) is visible, so an unguarded import
 * navigates to live and imports whatever live returns (often the Korea homepage).
 */
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync,
} from 'fs';
import { dirname } from 'path';
import { execFileSync } from 'child_process';

const SCRIPTS = '/home/node/.excat-marketplaces/excat-marketplace/excat/skills/excat-content-import/scripts';
const SNAP = 'tools/importer/snapshots';
const STAGE = `${SNAP}/_import`;
const GUARD = '<script data-mim-import-guard>'
  + 'document.addEventListener("click",function(e){e.preventDefault();},true);'
  + 'document.addEventListener("submit",function(e){e.preventDefault();},true);'
  + 'window.open=function(){return null;};</script>'
  // overlays the page model drops anyway; hidden, dismissPopups skips them instead of
  // retrying clicks on covered buttons until Playwright's timeout
  + '<style data-mim-import-guard>#onetrust-consent-sdk,#region-modal,.xfpage,.videoModal'
  + '{display:none!important}</style>';
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const only = opt('template', null);
const limit = Number(opt('limit', 1000));
const paths = (opt('paths', '') || '').split(',').filter(Boolean);
const force = args.includes('--force') || paths.length > 0;

const templates = JSON.parse(readFileSync('tools/importer/page-templates.json', 'utf-8')).templates;
const state = JSON.parse(readFileSync(`${SNAP}/_state.json`, 'utf-8'));
const linkMap = JSON.parse(readFileSync('tools/importer/link-map.json', 'utf-8'));

/** Copies the batch's snapshots (+ image sidecars) to STAGE with the click guard in <head>. */
function stage(urls) {
  rmSync(STAGE, { recursive: true, force: true });
  urls.forEach((u) => {
    const { host, pathname } = new URL(u);
    const src = `${SNAP}/${host}${pathname}.html`;
    const dst = `${STAGE}/${host}${pathname}.html`;
    mkdirSync(dirname(dst), { recursive: true });
    const html = readFileSync(src, 'utf-8');
    const head = html.search(/<head[^>]*>/i);
    const at = head === -1 ? 0 : head + html.slice(head).indexOf('>') + 1;
    writeFileSync(dst, `${html.slice(0, at)}${GUARD}${html.slice(at)}`);
    const sidecar = src.replace(/\.html$/, '.images.json');
    if (existsSync(sidecar)) copyFileSync(sidecar, dst.replace(/\.html$/, '.images.json'));
  });
}

let total = 0;
templates.filter((t) => !only || t.name === only).forEach((t) => {
  const urls = t.urls.filter((u) => {
    const p = new URL(u).pathname;
    if (!state[p] || state[p].status !== 200) return false;
    if (paths.length) return paths.includes(p);
    const eds = (linkMap[p] || p).replace(/^\//, '');
    return force || !existsSync(`content/${eds}.plain.html`);
  }).slice(0, Math.max(0, limit - total));
  if (!urls.length) return;
  total += urls.length;
  const file = `tools/importer/urls-${t.name}.txt`;
  writeFileSync(file, `${urls.join('\n')}\n`);
  console.log(`== ${t.name}: ${urls.length} pages`);
  stage(urls);
  const cmd = ['--import-script', `tools/importer/import-${t.name}.bundle.js`, '--urls', file,
    '--html-dir', STAGE, ...(force ? ['--force'] : [])];
  try {
    const outText = execFileSync('node', [`${SCRIPTS}/run-bulk-import.js`, ...cmd], { maxBuffer: 64 * 1024 * 1024 }).toString();
    console.log(outText.split('\n').filter((l) => /✓|❌|⚠️|Completed|Success|Error|Protected|snapshot/i.test(l)).slice(-15).join('\n'));
  } catch (e) {
    console.log(String(e.stdout || '').split('\n').slice(-25).join('\n'));
    console.log(String(e.stderr || e.message).slice(-2000));
  }
});
rmSync(STAGE, { recursive: true, force: true });
console.log(`imported/attempted ${total}`);
