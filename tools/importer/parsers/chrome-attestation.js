/* eslint-disable */
/*
 * Parser: live dialog#region-modal, current region pane (section.attestation--current,
 * Taiwan) -> DA fragment /institutional/tw/en/fragments/attestation (read by blocks/attestation).
 *   section 1  `## Disclaimer (Taiwan)` + the disclaimer text (.attestation__text)
 *   section 2  [Cancel](live a.attestation__cancel--region-select href)
 *              **[I agree](live chpLink = this site's home)**
 *              [Change region](#region-select)
 */
import {
  el, label, link, sections, richText,
} from './chrome-shared.js';

export default function parseAttestation(document) {
  const modal = document.querySelector('dialog#region-modal');
  const pane = modal && (modal.querySelector('section.attestation--current')
    || modal.querySelector('section.attestation[data-attestation-region="TW"]'));
  if (!pane) return sections(document, [[]]);
  const title = label(pane.querySelector('.region-select__title, h2'));
  const body = [el(document, 'h2', {}, title), ...richText(document, pane.querySelector('.attestation__text'))];

  const actions = [];
  const cancel = pane.querySelector('a.attestation__cancel--region-select[href]');
  const cancelLabel = label(cancel || pane.querySelector('.attestation__cancel')) || 'Cancel';
  actions.push(el(document, 'p', {}, link(document, cancel ? cancel.getAttribute('href') : 'https://www.manulifeim.com/', cancelLabel)));
  const chp = pane.querySelector('input[name="chpLink"]');
  const accept = pane.querySelector('.attestation__accept');
  actions.push(el(document, 'p', {}, link(document, (chp && chp.getAttribute('value')) || '/institutional/tw/en', label(accept) || 'I agree', { bold: true })));
  const change = pane.querySelector('.attestation__region-select-link');
  if (change) actions.push(el(document, 'p', {}, link(document, '#region-select', label(change))));
  return sections(document, [body, actions]);
}
