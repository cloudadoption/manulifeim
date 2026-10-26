#!/usr/bin/env node
/*
 * Imports captured pages from the snapshots (never the live site) with the excat bulk importer,
 * template by template, skipping pages already imported unless --force.
 *
 *   node tools/importer/run-captured.mjs [--template viewpoint] [--limit 40] [--force]
 *
 * Writes tools/importer/urls-<template>.txt and runs run-bulk-import.js with
 * --html-dir tools/importer/snapshots. Progress is recorded in tools/importer/reports/.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';

const SCRIPTS = '/home/node/.excat-marketplaces/excat-marketplace/excat/skills/excat-content-import/scripts';
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const only = opt('template', null);
const limit = Number(opt('limit', 1000));
const force = args.includes('--force');

const templates = JSON.parse(readFileSync('tools/importer/page-templates.json', 'utf-8')).templates;
const state = JSON.parse(readFileSync('tools/importer/snapshots/_state.json', 'utf-8'));
const linkMap = JSON.parse(readFileSync('tools/importer/link-map.json', 'utf-8'));

let total = 0;
templates.filter((t) => !only || t.name === only).forEach((t) => {
  const urls = t.urls.filter((u) => {
    const p = new URL(u).pathname;
    if (!state[p] || state[p].status !== 200) return false;
    const eds = (linkMap[p] || p).replace(/^\//, '');
    return force || !existsSync(`content/${eds}.plain.html`);
  }).slice(0, Math.max(0, limit - total));
  if (!urls.length) return;
  total += urls.length;
  const file = `tools/importer/urls-${t.name}.txt`;
  writeFileSync(file, `${urls.join('\n')}\n`);
  console.log(`== ${t.name}: ${urls.length} pages`);
  const cmd = ['--import-script', `tools/importer/import-${t.name}.bundle.js`, '--urls', file,
    '--html-dir', 'tools/importer/snapshots', ...(force ? ['--force'] : [])];
  try {
    const outText = execFileSync('node', [`${SCRIPTS}/run-bulk-import.js`, ...cmd], { maxBuffer: 64 * 1024 * 1024 }).toString();
    console.log(outText.split('\n').filter((l) => /✓|❌|⚠️|Completed|Success|Error|Protected|snapshot/i.test(l)).slice(-15).join('\n'));
  } catch (e) {
    console.log(String(e.stdout || '').split('\n').slice(-25).join('\n'));
    console.log(String(e.stderr || e.message).slice(-2000));
  }
});
console.log(`imported/attempted ${total}`);
