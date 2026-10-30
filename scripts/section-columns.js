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
 * `Column | 1` after a section of another column (or after a section without Column) starts a
 * row; a section without Column ends it; a row needs two columns (a lone Column section stays a
 * plain section). The same number again continues that column: its section adds to the column,
 * after a rule when it has Style divider (live divider component inside a column, e.g. above
 * the consent text under a form). The other sections of the row are merged into the first: each
 * column becomes one div.section-column holding its sections' wrappers (a merged section's id
 * moves onto its column, or onto its rule).
 *
 * Runs after decorateBlocks (blocks decorated, not loaded yet). Canvas (authoring): nothing is
 * merged, every section stays as authored.
 */

const columnOf = (section) => Number.parseInt(section.dataset?.column, 10);

/**
 * Rows of consecutive column sections of `main`, each a list of columns, each a list of the
 * column's sections: [[[section, ...], [section]], ...]
 */
export function columnRows(main) {
  const rows = [];
  let row = null;
  let last = NaN;
  [...main.children].forEach((section) => {
    const n = section.tagName === 'DIV' ? columnOf(section) : NaN;
    if (Number.isNaN(n)) {
      row = null;
      last = NaN;
      return;
    }
    if (!row || (n === 1 && last !== 1)) {
      row = [];
      rows.push(row);
    }
    if (n === last) row[row.length - 1].push(section);
    else row.push([section]);
    last = n;
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
  rows.forEach((columns) => {
    const first = columns[0][0];
    const divs = columns.map((sections, i) => {
      const column = doc.createElement('div');
      column.className = 'section-column';
      sections.forEach((section, k) => {
        if (k && section.classList.contains('divider')) {
          const rule = doc.createElement('hr');
          rule.className = 'section-column-divider';
          if (section.id) rule.id = section.id;
          column.append(rule);
        } else if ((i || k) && section.id && !column.id) column.id = section.id;
        column.append(...section.children);
      });
      return column;
    });
    first.append(...divs);
    first.classList.add('section-columns');
    columns.flat().slice(1).forEach((section) => section.remove());
  });
  return rows.length;
}
