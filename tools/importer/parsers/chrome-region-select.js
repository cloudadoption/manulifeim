/* eslint-disable */
/*
 * Parser: live dialog#region-modal country pane -> DA fragment
 * /institutional/tw/en/fragments/region-select (read by blocks/attestation).
 *   `## Select a location`, then per live group `### Americas` + a list of country links.
 * Each country links to its live site (the target of that country's "I agree" link;
 * fallback https://www.manulifeim.com/institutional/<cc>/<lang> from data-region-select-link).
 * Live quirk kept: Taiwan is not in the list.
 */
import {
  el, label, link, sections,
} from './chrome-shared.js';
import { LIVE_ORIGIN } from '../utils/links.js';

function targetFor(modal, code) {
  const pane = modal.querySelector(`section.attestation[data-code="${code}"]`);
  const accept = pane && pane.querySelector('a.attestation__accept[href]');
  if (accept) return accept.getAttribute('href');
  const chp = pane && pane.querySelector('input[name="chpLink"]');
  if (chp && chp.getAttribute('value')) return chp.getAttribute('value');
  const [cc, ...lang] = code.split('-');
  return `${LIVE_ORIGIN}/institutional/${cc.toLowerCase()}/${lang.join('-').toLowerCase() || 'en'}`;
}

export default function parseRegionSelect(document) {
  const modal = document.querySelector('dialog#region-modal');
  const section = modal && modal.querySelector('.region-select__country-section');
  if (!section) return sections(document, [[]]);
  const out = [el(document, 'h2', {}, label(section.querySelector('.region-select__title')) || 'Select a location')];
  section.querySelectorAll('.region-select__group-label').forEach((h) => {
    out.push(el(document, 'h3', {}, label(h)));
    const group = h.parentElement.querySelector('ul.region-select__country-group');
    const list = el(document, 'ul');
    (group ? [...group.querySelectorAll('[data-region-select-link]')] : []).forEach((b) => {
      const href = targetFor(modal, b.getAttribute('data-region-select-link'));
      list.append(el(document, 'li', {}, link(document, href, label(b))));
    });
    out.push(list);
  });
  return sections(document, [out]);
}
