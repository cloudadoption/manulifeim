/**
 * Score bars: a before and an after score per category as two bars side by side, coloured as in
 * PageSpeed Insights (red 0-49, orange 50-89, green 90-100). The before bar is striped.
 *
 * Rows: the first row is the header: cell 1 the legend ("before label → after label"), cell 2
 * empty, then one cell per category. Every other row is a line: cell 1 the item (text and links;
 * empty: same item as the line above), cell 2 the line label (e.g. Mobile), then one value per
 * category, "before → after". A value is a score from 0 to 100 or a fraction such as 2/3, with an
 * optional "(n)" after it: the score without a known penalty, drawn as a dashed extension; the bar
 * then takes the colour of that score.
 * Option "large": taller bars.
 */

const VALUE = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*(?:\((\d+(?:\.\d+)?)\))?$/;

const clamp = (n) => Math.max(0, Math.min(100, n));

function parseValue(text) {
  const m = String(text || '').trim().match(VALUE);
  if (!m) return null;
  const [, value, max, adjusted] = m;
  const pct = (n) => clamp(max ? (Number(n) / Number(max)) * 100 : Number(n));
  return {
    label: max ? `${value}/${max}` : value,
    pct: pct(value),
    adjusted: adjusted ? pct(adjusted) : null,
    adjustedLabel: adjusted || null,
  };
}

/** "before → after" (or "->") as { before, after }, null when it isn't one. */
export function parsePair(text) {
  const parts = String(text || '').split(/→|->/);
  if (parts.length !== 2) return null;
  const before = parseValue(parts[0]);
  const after = parseValue(parts[1]);
  return before && after ? { before, after } : null;
}

/** The PageSpeed Insights band of a score. */
export function band(pct) {
  if (pct >= 90) return 'pass';
  if (pct >= 50) return 'average';
  return 'fail';
}

/** The colour band of a bar: that of the score without the penalty when there is one. */
export function colour(value) {
  return band(value.adjusted ?? value.pct);
}

const clean = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

function make(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function bar(side, value) {
  const node = make('span', `score-bars-bar score-bars-${side} score-bars-${colour(value)}`);
  node.style.setProperty('--score', value.pct);
  const label = make('span', 'score-bars-value', value.label);
  if (value.adjustedLabel) label.append(make('small', '', `(${value.adjustedLabel})`));
  node.append(label);
  if (value.adjusted !== null && value.adjusted > value.pct) {
    node.style.setProperty('--adjusted', value.adjusted);
    node.append(make('span', 'score-bars-ghost'));
  }
  node.append(make('span', 'score-bars-fill'));
  return node;
}

function legendItem(side, text) {
  return make('span', `score-bars-key score-bars-key-${side}`, make('span', 'score-bars-swatch'), text);
}

/** @param {Element} block */
export default function decorate(block) {
  const rows = [...block.children].map((row) => [...row.children]);
  const head = rows.shift() || [];
  const categories = head.slice(2).map(clean);
  // soft hyphens break long category names on small screens; screen readers get the plain name
  const names = categories.map((c) => c.replace(/\u00ad/g, ''));
  const [beforeName = 'Before', afterName = 'After'] = clean(head[0]).split(/→|->/).map((s) => s.trim());
  block.style.setProperty('--score-bars-columns', categories.length);

  const legend = make('div', 'score-bars-legend', legendItem('before', beforeName), legendItem('after', afterName));
  const header = make(
    'div',
    'score-bars-line score-bars-categories',
    make('span', 'score-bars-line-label'),
    ...categories.map((c) => make('span', 'score-bars-category', c)),
  );
  const out = [make('div', 'score-bars-head', legend, header)];

  let item;
  rows.forEach((cells) => {
    if (cells.length < 3) return;
    if (clean(cells[0]) || !item) {
      const label = make('div', 'score-bars-label');
      label.append(...cells[0].childNodes);
      item = make('div', 'score-bars-item', label, make('div', 'score-bars-lines'));
      out.push(item);
    }
    const lineName = clean(cells[1]);
    const groups = names.map((name, i) => {
      const pair = parsePair(clean(cells[i + 2]));
      const group = make('span', 'score-bars-group');
      if (!pair) return group;
      group.setAttribute('role', 'img');
      group.setAttribute('aria-label', `${name}${lineName ? `, ${lineName}` : ''}: ${beforeName} ${pair.before.label}`
        + `${pair.before.adjustedLabel ? ` (${pair.before.adjustedLabel})` : ''}, ${afterName} ${pair.after.label}`
        + `${pair.after.adjustedLabel ? ` (${pair.after.adjustedLabel})` : ''}`);
      group.append(bar('before', pair.before), bar('after', pair.after));
      return group;
    });
    item.lastElementChild.append(make('div', 'score-bars-line', make('span', 'score-bars-line-label', lineName), ...groups));
  });

  block.replaceChildren(...out);
}
