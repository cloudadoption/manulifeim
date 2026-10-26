/*
 * Columns block (replaces multi-column column-container).
 *
 * DA authoring table (one row = one column container; cells = columns):
 *
 * | Columns[ (8-4|6-6|4-4-4|3-3-3-3)] |                       |
 * | default content (h3, p, image)    | default content       |
 *
 * Layout without a variant is inferred from the cell count of the first row:
 * 2 cells → 6-6, 3 cells → 4-4-4, 4+ cells → 3-3-3-3, 1 cell → 12.
 */
const LAYOUTS = {
  '8-4': [8, 4],
  '6-6': [6, 6],
  '4-4-4': [4, 4, 4],
  '3-3-3-3': [3, 3, 3, 3],
};

function inferLayout(count) {
  if (count >= 4) return '3-3-3-3';
  if (count === 3) return '4-4-4';
  if (count === 2) return '6-6';
  return '12';
}

export default function decorate(block) {
  const firstRow = block.firstElementChild;
  const count = firstRow ? firstRow.children.length : 0;
  const explicit = Object.keys(LAYOUTS).find((l) => block.classList.contains(l));
  const layout = explicit || inferLayout(count);
  block.classList.add(`layout-${layout}`, `columns-${count}-cols`);
  const widths = LAYOUTS[layout] || [12];

  [...block.children].forEach((row) => {
    row.classList.add('columns-row');
    [...row.children].forEach((col, i) => {
      // widths repeat for extra cells (e.g. 7 logos in 3-3-3-3)
      const w = widths[i % widths.length];
      col.classList.add('columns-col', `columns-fw-${w}`);
      if (!col.textContent.trim() && !col.querySelector('picture, img, iframe, a')) {
        col.classList.add('columns-col-empty');
      }
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1 && !picWrapper.textContent.trim()) {
          picWrapper.classList.add('columns-img-col');
        }
      }
    });
  });
}
