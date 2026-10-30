/* eslint-disable */
/* global WebImporter */
/*
 * Parser: strategy-section. Live: section.strategyDetail__section, one data panel of the
 * React StrategyDetail component on strategy pages (Key facts, Performance, Calendar year
 * returns, Risk and return, Characteristics, Top 10 issuers, Composition). The page model
 * (utils/page-model.js) gives each panel its own section, with the panel's sectionBreak as
 * Id / Nav Title so the page's anchor navigation still lands on it.
 * Output, existing project blocks only:
 *   ## Panel heading
 *   ### Chart heading (when the panel also has one: Performance > Average annual total
 *       returns, Characteristics > Portfolio characteristics)
 *   as of 9/30/2026 (paragraph)
 *   | Table (header-column) |            Key facts: one row per fact (name | value)
 *   | Table (header-row-column) |        each rendered data table (swatches dropped)
 *   | Disclosure (inset) | Important Disclosures | rich text |   the panel's disclosure
 * Chart-only panels (Risk and return, Composition: SVG plots, data only in the live JSON)
 * keep heading, date and disclosure; the chart itself is not migrated.
 */
import { h, block, text, richText } from '../utils/dom.js';

function tableRows(document, table) {
  const trs = [...table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')];
  return trs.map((tr) => [...tr.children].filter((c) => /^T[DH]$/.test(c.tagName)).map((c) => {
    const copy = c.cloneNode(true);
    copy.querySelectorAll('i').forEach((i) => { if (!text(i)) i.remove(); }); // legend swatches
    const nodes = richText(document, copy);
    return nodes.length ? nodes : '';
  })).filter((cells) => cells.length);
}

export default function parse(element, { document }) {
  const out = [];
  const panel = text(element.querySelector('.strategyDetail__heading'));
  const chart = text(element.querySelector('.strategyDetail__chartHeading'));
  if (panel) out.push(h(document, 'h2', panel));
  if (chart) out.push(h(document, panel ? 'h3' : 'h2', chart));
  const asOf = text(element.querySelector('.strategyDetail__subheading, .strategyDetail__chartSubheading'));
  if (asOf) out.push(h(document, 'p', asOf));

  const facts = [...element.querySelectorAll('.strategyDetail__keyFact')]
    .map((f) => [text(f.querySelector('dt')), text(f.querySelector('dd'))])
    .filter(([name, value]) => name && value);
  if (facts.length) out.push(block(document, 'Table', ['header-column'], facts));

  element.querySelectorAll('table').forEach((table) => {
    const rows = tableRows(document, table);
    if (rows.length) out.push(block(document, 'Table', ['header-row-column'], rows));
  });

  const disc = element.querySelector('.strategyDetail__disclosureContent');
  const body = disc ? richText(document, disc) : [];
  if (body.length) {
    const label = text(element.querySelector('.strategyDetail__disclosure .disc__label')) || 'Important disclosures';
    out.push(block(document, 'Disclosure', ['inset'], [[label, body]]));
  }

  if (out.length) element.replaceWith(...out);
  else element.remove();
}
