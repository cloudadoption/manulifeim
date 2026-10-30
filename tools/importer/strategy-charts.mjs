#!/usr/bin/env node
/*
 * Adds the figures behind a strategy page's two live charts (Risk and return, Composition) as
 * Table blocks: one table per chart view, with the live view labels and the as-of date.
 *
 *   node tools/importer/strategy-charts.mjs --feed <feed.json> --snapshot <snapshot.html>
 *     <page.plain.html> [--out <file>]
 *
 * --feed is the saved fund-data GraphQL response (<snapshot>.feed-maestro-<shareClass>.json),
 * --snapshot the captured live page (view labels = the chart toggles, series names = the risk
 * legend). Without --out it only prints what it would add. Re-running changes nothing.
 *
 * Risk and return (scatter on live): per period N, strategy (Net) and primary benchmark with
 * annualized net return (performance Fund_Return_Net / Primary_Benchmark_Return yearN) and
 * annualized net standard deviation (riskMeasures std_dev_ratio_NYR fundValue / indexValue).
 * Composition (stacked bar on live): compositions.returns of the view's dataElement at
 * compositions.dates.asOfDate, largest first. Live drops zero slices and folds slices between
 * -1% and 1% into "Others (n)" when there are at least two of them (checked against the 22
 * default-view legends and the 3 live fallback data tables in the snapshots); the caption names
 * what Others holds. A section that already holds a table is left as is, except an imported live
 * fallback table (label | Value) whose figures equal the default view: it is replaced by the
 * full set.
 */
/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'fs';
// local tooling: jsdom is a devDependency (no build step, nothing here runs on the site)
// eslint-disable-next-line import/no-extraneous-dependencies
import { JSDOM, VirtualConsole } from 'jsdom';

export const RISK = 'Risk and return';
export const COMPOSITION = 'Composition';
export const RISK_COLUMNS = ['Annualized net strategy return', 'Annualized net standard deviation'];

/** 2026-09-30 -> 9/30/2026 (the live chart subheading format) */
export function liveDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? `${m}/${d}/${y}` : '';
}

const pct = (v, scale = 1) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * scale).toFixed(2)}%` : '–');

/** Composition slices of one view as shown on live: [{ label, value, members? }] */
export function compositionRows(shareClass, element) {
  const comp = shareClass?.compositions;
  const asOf = comp?.dates?.asOfDate;
  const rows = (comp?.returns || [])
    .filter((r) => r.dataElement === element && r.date === asOf && typeof r.value === 'number' && r.value !== 0)
    .sort((a, b) => b.value - a.value)
    .map((r) => ({ label: r.label, value: r.value }));
  const small = rows.filter((r) => Math.abs(r.value) < 1);
  if (small.length < 2) return rows;
  return [
    ...rows.filter((r) => Math.abs(r.value) >= 1),
    { label: `Others (${small.length})`, value: small.reduce((s, r) => s + r.value, 0), members: small },
  ];
}

/** Risk and return rows of one period: [[series, return, std dev]] or null without fund data */
export function riskRows(shareClass, years, names = []) {
  const perf = (el) => (shareClass?.performance?.returns || []).find((r) => r.dataElement === el);
  const risk = (shareClass?.riskMeasures?.returns || []).find((r) => r.dataElement === `std_dev_ratio_${years}YR`);
  const fundReturn = perf('Fund_Return_Net')?.[`year${years}`];
  if (typeof fundReturn !== 'number' || typeof risk?.fundValue !== 'number') return null;
  const strategy = names[0] || `${shareClass.name} (Net)`;
  const benchmark = names[1] || shareClass.strategyData?.compPrimaryBenchmarkName
    || shareClass.strategyData?.repPrimaryBenchmarkName || 'Benchmark';
  return [
    [strategy, pct(fundReturn, 100), pct(risk.fundValue, 100)],
    [benchmark, pct(perf('Primary_Benchmark_Return')?.[`year${years}`], 100), pct(risk.indexValue, 100)],
  ];
}

/** Chart toggle labels and risk legend names of the captured live page */
export function liveViews(snapshotHtml) {
  // the captured page's CSS is not needed (and jsdom cannot parse all of it)
  const { document } = new JSDOM(snapshotHtml, { virtualConsole: new VirtualConsole() }).window;
  const views = {};
  document.querySelectorAll('.strategyDetail__chartButtons').forEach((buttons) => {
    const head = buttons.parentElement?.querySelector('h2, h3, h4');
    const name = head?.textContent.trim();
    if (name) views[name] = [...buttons.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean);
  });
  const legend = document.querySelector('.plotChart__legend');
  const names = legend
    ? [...new Set([...legend.querySelectorAll('text, tspan')].map((t) => t.textContent.trim()).filter(Boolean))]
    : [];
  return { views, names };
}

function cell(doc, content) {
  const c = doc.createElement('div');
  if (typeof content === 'string') c.textContent = content;
  else if (content) c.append(content);
  return c;
}

function tableBlock(doc, variant, title, rows, caption) {
  const block = doc.createElement('div');
  block.className = `table ${variant}`;
  const row = (cells) => {
    const r = doc.createElement('div');
    cells.forEach((c) => r.append(cell(doc, c)));
    block.append(r);
  };
  const h = doc.createElement('h3');
  h.textContent = title;
  row([h]);
  rows.forEach(row);
  if (caption) row([caption]);
  return block;
}

/** Table blocks for every view of both charts: { [RISK]: [block], [COMPOSITION]: [block] } */
export function chartTables(doc, shareClass, { views = {}, names = [] } = {}) {
  const out = { [RISK]: [], [COMPOSITION]: [] };
  const riskAsOf = liveDate(shareClass?.riskMeasures?.dates?.asOfDate
    || shareClass?.performance?.dates?.asOfDate);
  (views[RISK] || ['3 years', '5 years', '7 years', '10 years']).forEach((label) => {
    const rows = riskRows(shareClass, parseInt(label, 10), names);
    if (!rows) return;
    const table = [['', ...RISK_COLUMNS], ...rows];
    out[RISK].push(tableBlock(doc, 'header-row-column', label, table, `as of ${riskAsOf}`));
  });
  const compAsOf = liveDate(shareClass?.compositions?.dates?.asOfDate);
  (views[COMPOSITION] || []).forEach((label) => {
    const rows = compositionRows(shareClass, label.replace(/ /g, '_'));
    if (!rows.length) return;
    const others = rows.find((r) => r.members);
    const note = others ? `. ${others.label}: ${others.members.map((m) => `${m.label} ${pct(m.value)}`).join(', ')}` : '';
    out[COMPOSITION].push(tableBlock(doc, 'header-column', label, rows.map((r) => [r.label, pct(r.value)]), `as of ${compAsOf}${note}`));
  });
  return out;
}

/** label -> number of each figure row of a table block (header and caption rows skipped) */
function figures(block) {
  const out = {};
  [...block.children].forEach((row) => {
    const [label, value] = [...row.children].map((c) => c.textContent.trim());
    const n = parseFloat(String(value).replace('%', ''));
    if (label && Number.isFinite(n) && row.children.length === 2) out[label] = n.toFixed(2);
  });
  return out;
}

/** true when an imported table holds exactly the figures of a generated view table */
function sameFigures(imported, generated) {
  if (!generated) return false;
  const [a, b] = [figures(imported), figures(generated)];
  const keys = Object.keys(b);
  return keys.length > 0 && keys.length === Object.keys(a).length
    && keys.every((k) => a[k] === b[k]);
}

/** Inserts the tables after the "as of" line of the two chart sections; returns a report */
export function addChartTables(doc, shareClass, live) {
  const tables = chartTables(doc, shareClass, live);
  const report = [];
  [RISK, COMPOSITION].forEach((name) => {
    const h2 = [...doc.querySelectorAll('h2')].find((h) => h.textContent.trim() === name);
    if (!h2) { report.push(`${name}: section not found`); return; }
    const section = h2.parentElement;
    const existing = section.querySelector('.table');
    // the live fallback is one untitled table; ours have view titles
    const fallback = existing && name === COMPOSITION && !existing.querySelector('h3')
      && section.querySelectorAll('.table').length === 1 && sameFigures(existing, tables[name][0]);
    if (existing && !fallback) {
      report.push(`${name}: has a table, left as is`);
      return;
    }
    if (!tables[name].length) { report.push(`${name}: no data`); return; }
    if (existing) {
      existing.remove();
      report.push(`${name}: imported live fallback table equals the default view, replaced`);
    }
    const next = h2.nextElementSibling;
    const anchor = next?.tagName === 'P' && /^as of /i.test(next.textContent.trim()) ? next : h2;
    anchor.after(...tables[name]);
    const titles = tables[name].map((t) => t.querySelector('h3').textContent);
    report.push(`${name}: ${titles.length} tables (${titles.join(', ')})${anchor === h2 ? ', no as-of line in section' : ''}`);
  });
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2);
  const opt = (n) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? null : args[i + 1];
  };
  const page = args.find((a, i) => !a.startsWith('--') && !['--feed', '--snapshot', '--out'].includes(args[i - 1]));
  if (!page || !opt('feed') || !opt('snapshot')) {
    console.error('usage: strategy-charts.mjs --feed <feed.json> --snapshot <snapshot.html> <page.plain.html> [--out <file>]');
    process.exit(2);
  }
  const feed = JSON.parse(readFileSync(opt('feed'), 'utf8'));
  const shareClass = (feed.response || feed).data?.shareClass;
  if (!shareClass) {
    console.error('no shareClass in feed');
    process.exit(1);
  }
  const { window } = new JSDOM(`<body>${readFileSync(page, 'utf8')}</body>`);
  const report = addChartTables(window.document, shareClass, liveViews(readFileSync(opt('snapshot'), 'utf8')));
  console.log(`${shareClass.id} ${page}\n  ${report.join('\n  ')}`);
  if (opt('out')) writeFileSync(opt('out'), window.document.body.innerHTML);
}
