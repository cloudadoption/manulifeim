/*
 * Section columns: consecutive sections with Section Metadata `Column | 1`, `Column | 2`, ...
 * form one row, one section per column, so a column can hold several blocks and text (a
 * Columns block cell cannot hold a block). The first section of the row keeps its Style, Id and
 * Layout; Layout sets the column widths as for any Layout section (styles/styles.css). Live:
 * a column-container whose columns hold a chart and a promo, or a form (Pension Barometer).
 *
 *   | Section Metadata |      |        | Section Metadata |   |
 *   | Layout           | 6-6  |  ...   | Column           | 2 |
 *   | Column           | 1    |
 *
 * `Column | 1` (or a section after one without Column) starts a row; a section without Column
 * ends it; a row needs two columns (a lone Column section stays a plain section). The other
 * sections of the row are merged into the first: each column becomes one div.section-column
 * holding that section's wrappers (its id moves onto the column).
 *
 * Runs after decorateBlocks (blocks decorated, not loaded yet). Canvas (authoring): nothing is
 * merged, every section stays as authored.
 */

/** Runs of consecutive column sections of `main`: [[section, section, ...], ...] */
export function columnRows(main) {
  const rows = [];
  let row = null;
  [...main.children].forEach((section) => {
    const n = Number.parseInt(section.dataset?.column, 10);
    if (section.tagName !== 'DIV' || Number.isNaN(n)) {
      row = null;
      return;
    }
    if (!row || n === 1) {
      row = [];
      rows.push(row);
    }
    row.push(section);
  });
  return rows.filter((r) => r.length > 1);
}

/**
 * Merges every row of column sections into its first section.
 * @param {Element} main
 * @returns {number} number of rows built
 */
export default function buildSectionColumns(main) {
  const doc = main.ownerDocument;
  const rows = columnRows(main);
  rows.forEach((sections) => {
    const [first] = sections;
    const columns = sections.map((section, i) => {
      const column = doc.createElement('div');
      column.className = 'section-column';
      if (i && section.id) column.id = section.id;
      column.append(...section.children);
      return column;
    });
    first.append(...columns);
    first.classList.add('section-columns');
    sections.slice(1).forEach((section) => section.remove());
  });
  return rows.length;
}
