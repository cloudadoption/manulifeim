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
 */
/* eslint-enable max-len */
const DEFAULT_LABEL = 'Important disclosures';

function buildTrigger(label, open) {
  const trigger = document.createElement(open ? 'div' : 'summary');
  trigger.className = 'disclosure-trigger';
  if (open) trigger.classList.add('disclosure-trigger-disabled');
  trigger.setAttribute('aria-label', label);
  const content = document.createElement('div');
  content.className = 'disclosure-trigger-content';
  const icon = document.createElement('span');
  icon.className = 'disclosure-main-icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'disclosure-label';
  text.textContent = label;
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

export default function decorate(block) {
  const open = block.classList.contains('open');
  const items = [...block.children].map((row) => {
    const cells = [...row.children];
    let label = DEFAULT_LABEL;
    let body = cells[cells.length - 1];
    if (cells.length >= 2) {
      label = cells[0].textContent.trim() || DEFAULT_LABEL;
      body = cells.slice(1).reduce((acc, c) => {
        acc.append(...c.childNodes);
        return acc;
      }, document.createElement('div'));
    }
    const el = document.createElement(open ? 'div' : 'details');
    el.className = 'disclosure-item';
    const content = document.createElement('div');
    content.className = 'disclosure-content';
    if (body) content.append(...body.childNodes);
    // drop empty paragraphs
    content.querySelectorAll(':scope > p').forEach((p) => {
      if (!p.textContent.trim() && !p.querySelector('picture, img, a')) p.remove();
    });
    el.append(buildTrigger(label, open), content);
    return el;
  });
  block.replaceChildren(...items);
}
