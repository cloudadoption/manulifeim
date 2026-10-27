/* eslint-disable max-len */
/*
 * Disclosure block (replaces disclosures > details.disc).
 *
 * DA authoring table (one row per disclosure):
 *
 * | Disclosure[ (inset)][ (open)] |                                                  |
 * | Important disclosures         | rich text (p, lists, small, sup, links; last line = approval code) |
 *
 * The rich-text cell may hold only a link to /fragments/disclosures/{name}.
 * A single-cell row uses the label "Important disclosures".
 * `open` = always expanded, trigger disabled (homepage AUM footnote).
 * The body cells move into the details element as they are (Canvas edits them in place).
 */
/* eslint-enable max-len */
import isAuthoring from '../../scripts/authoring.js';

const DEFAULT_LABEL = 'Important disclosures';

/**
 * Summary (or a static label row for `open`). The authored label nodes move into it; a
 * one-cell row gets the default label as generated text.
 */
function buildTrigger(labelCell, open) {
  const trigger = document.createElement(open ? 'div' : 'summary');
  trigger.className = 'disclosure-trigger';
  if (open) trigger.classList.add('disclosure-trigger-disabled');
  const content = document.createElement('div');
  content.className = 'disclosure-trigger-content';
  const icon = document.createElement('span');
  icon.className = 'disclosure-main-icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'disclosure-label';
  if (labelCell && labelCell.textContent.trim()) {
    // a one-paragraph label (as aem.page may render it) gives its inline content
    const only = labelCell.children.length === 1 ? labelCell.firstElementChild : null;
    const source = only && only.tagName === 'P' ? only : labelCell;
    text.append(...source.childNodes);
  } else {
    text.textContent = DEFAULT_LABEL;
  }
  trigger.setAttribute('aria-label', text.textContent.trim());
  content.append(icon, text);
  if (!open) {
    const arrow = document.createElement('span');
    arrow.className = 'disclosure-arrow-icon';
    arrow.setAttribute('aria-hidden', 'true');
    content.append(arrow);
  }
  trigger.append(content);
  return trigger;
}

/** Body cell: drops empty paragraphs, wraps whole-paragraph footnotes like live. */
function decorateBody(body) {
  body.classList.add('disclosure-content');
  body.querySelectorAll(':scope > p').forEach((p) => {
    if (!p.textContent.trim() && !p.querySelector('picture, img, a')) p.remove();
  });
  // live sets the approval code (last line, e.g. "5796846") in <small>; pages only
  const last = body.lastElementChild;
  if (!isAuthoring() && last?.tagName === 'P' && /^[A-Z]{0,4}[:\s-]*\d{6,8}$/.test(last.textContent.trim())
    && !last.querySelector('small')) {
    const small = document.createElement('small');
    small.append(...last.childNodes);
    last.append(small);
  }
  // live wraps whole-paragraph footnotes in <small><sup>; markdown keeps only the sup
  body.querySelectorAll(':scope > p > sup:only-child').forEach((sup) => {
    if (sup.parentElement.textContent.trim() !== sup.textContent.trim()) return;
    const small = document.createElement('small');
    sup.replaceWith(small);
    small.append(sup);
  });
}

export default function decorate(block) {
  const open = block.classList.contains('open');
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const label = cells.length >= 2 ? cells[0] : null;
    const bodies = cells.length >= 2 ? cells.slice(1) : cells;
    bodies.forEach(decorateBody);
    // Canvas: the authored cells stay where they are, both visible
    if (isAuthoring()) {
      row.classList.add('disclosure-item');
      label?.classList.add('disclosure-label-cell');
      return;
    }
    const item = document.createElement(open ? 'div' : 'details');
    item.className = 'disclosure-item';
    item.append(buildTrigger(label, open), ...bodies);
    row.replaceWith(item);
  });
}
