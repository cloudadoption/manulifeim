/* eslint-disable max-len, import/no-extraneous-dependencies -- jsdom is a dev tool dependency */
/**
 * Block structure as the Block Inspector (adobe-rnd/ew-extensions tools/block-editor, checked
 * against main 4371f13) sees it: document.js contentFields()/describeField() (type only),
 * fields.js matchFieldCount()/normalizeVariant(), and library.js parseVariants(), run on jsdom
 * instead of the browser DOM. Ported from moved-permanently/lh-com tools/library/structure.mjs.
 *
 * A cell's fields are its child elements (a blockquote counts by its children), or the cell
 * itself when it has none; each field is an image (it holds an img), a list (ul/ol) or text.
 * Cells are normalized first as the DA editor stores them: runs of inline content (text,
 * links, formatting, pictures) become paragraphs.
 */
import { JSDOM } from 'jsdom';

const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'I', 'IMG', 'PICTURE', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'S', 'DEL', 'INS', 'MARK', 'TIME']);

const { window } = new JSDOM('<!doctype html><html><body></body></html>');

/** A document for html: created from one shared window (a JSDOM per page costs ~7 MB). */
export const parse = (html) => {
  const doc = window.document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;
  return doc;
};

/** Wraps runs of inline nodes of a cell in paragraphs (the DA editor's schema). */
export function normalizeCell(cell) {
  const doc = cell.ownerDocument;
  let run = null;
  [...cell.childNodes].forEach((node) => {
    const inline = node.nodeType === 3 || (node.nodeType === 1 && INLINE.has(node.tagName));
    if (!inline) { run = null; return; }
    if (node.nodeType === 3 && !node.textContent.trim() && !run) { node.remove(); return; }
    if (!run) {
      run = doc.createElement('p');
      cell.insertBefore(run, node);
    }
    run.append(node);
  });
  cell.querySelectorAll(':scope > p').forEach((p) => {
    if (!p.textContent.trim() && !p.querySelector('img, picture')) p.remove();
  });
  return cell;
}

/** document.js contentFields() */
export function contentFields(cell) {
  if (!cell.children.length) return [cell];
  return [...cell.children].flatMap((el) => (el.tagName === 'BLOCKQUOTE' ? [...el.children] : [el]));
}

/** document.js describeField(): the type only. */
export function fieldType(el) {
  if (el.tagName === 'IMG' || el.querySelector('img')) return 'image';
  if (el.tagName === 'UL' || el.tagName === 'OL') return 'list';
  return 'text';
}

/** fields.js normalizeBlockName() / normalizeVariant() */
export const normalizeName = (name) => (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
export const normalizeVariant = (value) => (value || '').split(',').map(normalizeName).sort().join(',');

/**
 * Rows of a block div (page or library: <div class="name opts"><div row><div cell>...), as the
 * table getBlockTableHtml() builds: the last cell of a short row spans the remaining columns.
 */
export function describeBlockDiv(block) {
  const [name, ...variants] = block.className.trim().split(/\s+/);
  const rows = [...block.children];
  const maxCols = Math.max(1, ...rows.map((r) => r.children.length));
  return {
    name,
    variant: variants.join(', '),
    rows: rows.map((row) => ({
      cells: [...row.children].map((cell, i) => {
        const c = normalizeCell(cell.cloneNode(true));
        const span = row.children.length < maxCols && i === row.children.length - 1 ? maxCols - i : 1;
        return {
          colspan: span,
          fields: contentFields(c).map((el) => ({
            type: fieldType(el),
            tag: el.tagName,
            empty: !el.textContent.trim() && !el.querySelector('img'),
            text: el.textContent.trim(),
          })),
        };
      }),
    })),
  };
}

/** fields.js matchFieldCount(): image-only cells may carry empty spacer paragraphs. */
export function matchFieldCount(fields, count) {
  if (fields.length === count) return fields;
  const content = fields.filter((f) => f.type !== 'text' || !f.empty);
  return content.length === count && content.every((f) => f.type === 'image') ? content : fields;
}

/** Shape signature of a row: cell count and the field types per cell. */
export const rowShape = (row) => row.cells.map((c) => c.fields.map((f) => f.type[0]).join('')).join('|');

/**
 * Whether a page row resolves against a template row (fields.js resolveBlockFields): the same
 * cells, per cell at least as many fields, and the template's field types at its positions.
 */
export function rowCovers(template, row) {
  if (!row || row.cells.length !== template.cells.length) return false;
  return template.cells.every((tc, i) => {
    const n = matchFieldCount(tc.fields, tc.fields.length).length;
    const fields = matchFieldCount(row.cells[i].fields, n);
    const want = matchFieldCount(tc.fields, n);
    return fields.length >= n && want.every((f, fi) => fields[fi].type === f.type);
  });
}

/** Whether a page block resolves against a template block (same rows, every row covered). */
export const blockCovers = (template, block) => template.rows.length === block.rows.length
  && template.rows.every((r, i) => rowCovers(r, block.rows[i]));

/** For a multi block: every page row is an item that resolves against the template's first row. */
export const multiCovers = (template, block) => block.rows.length > 0
  && block.rows.every((r) => rowCovers(template.rows[0], r));

/**
 * Fields of a page row the Block Inspector can edit with a template row (fields.js
 * resolveBlockFields): per template cell, its fields resolve only when the page cell has at
 * least as many fields; then each field whose type matches resolves.
 */
export function editableInRow(templateRow, row) {
  if (!row || row.cells.length !== templateRow.cells.length) return 0;
  return templateRow.cells.reduce((sum, tc, i) => {
    const n = matchFieldCount(tc.fields, tc.fields.length).length;
    const fields = matchFieldCount(row.cells[i].fields, n);
    if (fields.length < n) return sum;
    const want = matchFieldCount(tc.fields, n);
    return sum + want.filter((f, fi) => fields[fi].type === f.type).length;
  }, 0);
}

/** Editable fields of a whole page block: every item for a multi template, else row by row. */
export function editableFields(template, block, multi) {
  if (multi) return block.rows.reduce((sum, r) => sum + editableInRow(template.rows[0], r), 0);
  if (template.rows.length !== block.rows.length) return 0;
  return template.rows.reduce((sum, r, i) => sum + editableInRow(r, block.rows[i]), 0);
}
