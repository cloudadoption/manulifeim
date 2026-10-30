/*
 * Table block (replaces table2).
 *
 * DA authoring table (each row = table row, each cell = table cell):
 *
 * | Table (card[, header-row|header-column|header-row-column|no-header]) |           |        |
 * | ## Performance and asset mix … (optional title row, single merged cell)          |        |
 * | Asset class          | Benchmark                        | Weight |
 * | Canadian core fixed income | FTSE Canada Universe Bond Index | 20%    |
 * | Source: … (optional caption row, single merged cell)                             |        |
 *
 * Default header layout: header-row. The block adds data-title per cell for the
 * stacked mobile layout. A title can also be authored as an h2 before the block.
 */
const MODES = ['header-row-column', 'header-row', 'header-column', 'no-header'];

function isSingleCellRow(row, maxCells) {
  const cells = [...row.children];
  return maxCells > 1 && (cells.length === 1 || cells.slice(1).every((c) => !c.textContent.trim()));
}

/**
 * A row label ending in "as of <date>" (live strategy Key facts: "Strategy AUM (USD) as of
 * 6/30/2026", the date a small regular note): the date part goes into span.table-date.
 */
function splitAsOf(th) {
  const t = th.firstChild;
  if (th.childNodes.length !== 1 || !t || t.nodeType !== 3) return;
  const m = t.textContent.match(/^(.*\S)\s+(as of \S.*)$/i);
  if (!m) return;
  const [, label, asOf] = m;
  const date = document.createElement('span');
  date.className = 'table-date';
  date.textContent = asOf;
  th.replaceChildren(document.createTextNode(`${label} `), date);
}

export default function decorate(block) {
  let mode = MODES.find((m) => block.classList.contains(m));
  if (!mode) {
    mode = 'header-row';
    block.classList.add(mode);
  }
  const rows = [...block.children];
  const maxCells = Math.max(...rows.map((r) => r.children.length), 0);

  let title = null;
  let caption = null;
  if (rows.length > 1 && isSingleCellRow(rows[0], maxCells)
    && rows[0].querySelector('h1, h2, h3, h4, h5, h6, strong, b')) {
    title = rows.shift().firstElementChild;
  }
  // a caption is text (e.g. "Source: ..."); a last row holding only a link is a table row (the
  // odd last strategy of a two-column strategy list)
  const last = rows[rows.length - 1];
  const linkOnly = (cell) => {
    const links = cell ? cell.querySelectorAll('a[href]') : [];
    return links.length === 1 && cell.textContent.trim() === links[0].textContent.trim();
  };
  if (rows.length > 1 && isSingleCellRow(last, maxCells) && !linkOnly(last.firstElementChild)) {
    caption = rows.pop().firstElementChild;
  }

  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  const headerRow = mode === 'header-row' || mode === 'header-row-column';
  const headerCol = mode === 'header-column' || mode === 'header-row-column';
  const headings = headerRow && rows[0]
    ? [...rows[0].children].map((c) => c.textContent.trim())
    : [];

  rows.forEach((row, r) => {
    const tr = document.createElement('tr');
    [...row.children].forEach((cell, c) => {
      const isTh = (headerRow && r === 0) || (headerCol && c === 0);
      const el = document.createElement(isTh ? 'th' : 'td');
      if (isTh) el.scope = headerRow && r === 0 ? 'col' : 'row';
      if (!isTh || (headerCol && c === 0 && r > 0)) {
        if (headings[c]) el.dataset.title = headings[c];
      }
      el.append(...cell.childNodes);
      if (isTh && el.scope === 'row') splitAsOf(el);
      tr.append(el);
    });
    tbody.append(tr);
  });
  table.append(tbody);

  const main = document.createElement('div');
  main.className = 'table-main';
  if (title) {
    // the authored title moves as it is; a bold-text title keeps the heading role
    const wrap = document.createElement('div');
    wrap.className = 'table-title';
    if (!title.querySelector('h1, h2, h3, h4, h5, h6')) {
      wrap.setAttribute('role', 'heading');
      wrap.setAttribute('aria-level', '2');
    }
    wrap.append(...title.childNodes);
    main.append(wrap);
  }
  const figure = document.createElement('figure');
  figure.className = 'table-figure';
  figure.append(table);
  main.append(figure);
  if (caption) {
    const cap = document.createElement('div');
    cap.className = 'table-caption';
    cap.append(...caption.childNodes);
    main.append(cap);
  }
  block.replaceChildren(main);
}
