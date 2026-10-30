/* eslint-disable no-console, max-len, no-nested-ternary, import/extensions */
/**
 * Builds Manulife's DA block library from published content.
 *
 *   node tools/library/build-library.mjs select --pages <dir> [--out tools/library/library-variants.json]
 *   node tools/library/build-library.mjs build --variants tools/library/library-variants.json \
 *     --source <dir> --out <dir>
 *
 * select: reads every page's DA source (<dir>/<path with '/' as '__'>.html, fetched with
 * upload-library.mjs fetch --paths), groups the blocks of deployed block folders by name
 * and variants, and per variant picks the most common structure as the library template (for
 * blocks in MULTI: the most common item row). It records a sample page holding that structure
 * and how many page blocks the template covers in the Block Inspector (structure.mjs).
 *
 * The DA source, not the published .plain.html, is what the Inspector edits: DA keeps a picture
 * and the text after it in one paragraph, where the published page splits them.
 *
 * build: copies each sample block from the page's DA source (same files), so the library keeps
 * DA's own image references, trims repeating items to MAX_ITEMS, and writes one
 * library document per block (<out>/blocks/<block>.html: a heading, the block and its
 * library-metadata per variant) and the index sheet <out>/blocks.json (sheets blocks, editor,
 * options) that the DA Insert block dialog and the Block Inspector read.
 *
 * Blocks without a folder under blocks/ are left out: on Manulife they are imported data tables
 * whose header became a class name (see the report), not blocks authors should insert.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parse, describeBlockDiv, rowShape, blockCovers, multiCovers, normalizeCell, contentFields, editableFields,
  matchFieldCount,
} from './structure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ORG_SITE = 'cloudadoption/manulifeim';
export const MAX_ITEMS = 4;
const SAMPLES = 5;
const SKIP_BLOCKS = new Set(['header', 'footer', 'metadata', 'section-metadata', 'library-metadata', 'fragment', 'browse-by']);

/** Blocks whose every row is an item authors add, delete and reorder. */
export const MULTI = new Set(['cards', 'link-list', 'team', 'author', 'promo', 'section-nav', 'share', 'social-links']);

/** What each block is for, as the Insert block dialog and the Inspector show it. */
export const DESCRIPTIONS = {
  'article-list': 'List of viewpoints from the index (Source, Title, Link, Limit, View rows), with authored fallback teasers',
  attestation: 'Investor-type confirmation that visitors accept before they see the site',
  author: 'Author profiles, one per row: photo, then name, role and profile link',
  cards: 'Cards, one per row: image or icon with title, text and link (tiles, overlap, facts and column-count variants)',
  'case-study-sidebar': 'Case study side column: logo, key facts and related links',
  columns: 'Columns of text and images; the variant sets the column widths (6-6, 8-4, 4-4-4, 3-3-3-3)',
  disclosure: 'Expandable disclosure: the title opens the text (inset and open variants)',
  feature: 'Feature band: text and buttons next to an image, in a brand colour (navy, green, purple, banner, kicker variants)',
  figure: 'Image or chart with its title, caption and source note',
  form: 'Form built from a field table, one row per field',
  hero: 'Page header or banner: image with headline and summary (page-header, banner, carousel variants)',
  'link-list': 'List of links, one per row (inline and card variants)',
  listing: 'Listing of pages from the index (viewpoints, press, documents, case studies), set by its rows',
  promo: 'Coloured promotion: image, heading with text and link, and an optional colour (green, navy, blue, gold, violet, white)',
  'related-articles': 'Related viewpoints at the end of an article',
  search: 'Site search box and results',
  'section-nav': 'Navigation to the sections of the page (anchors) or to sibling pages (links)',
  share: 'Share links for the page (LinkedIn, X, Facebook, email, print, copy link)',
  'social-links': 'Social media icons with their links',
  table: 'Data table (header-row, header-column, no-header and card variants)',
  'tag-list': 'Tags of the page, linked to their listing',
  team: 'Team members, one per row: photo, then name, role and biography',
};

const KEYS = /^(source|title|link|limit|view|speed|type|filter|category|sort|tags?|path|query|label|heading|colou?r)$/i;

const readArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  return args;
};

export const pageOf = (file) => `/${file.replace(/\.(plain\.)?html$/, '').replaceAll('__', '/')}`;
export const fileOf = (page, ext) => `${page.replace(/^\//, '').replaceAll('/', '__')}${ext}`;

export function variantKey(block) {
  const [name, ...variants] = block.className.trim().split(/\s+/);
  return { name, key: variants.length ? `${name} (${[...variants].sort().join(', ')})` : name };
}

/** Whether a described block holds the template structure (an item row, for multi blocks). */
const hasShape = (d, shape, multi) => (multi && shape
  ? d.rows.some((r) => rowShape(r) === shape) : d.rows.map(rowShape).join(' / ') === shape);

const blockDivs = (doc) => [...doc.querySelectorAll('body > div > div[class], main > div > div[class]')]
  .filter((b) => !b.classList.contains('library-metadata'));

/** Groups the page blocks by variant and picks the template structure (see header). */
export function selectTemplates(pages, blockNames) {
  const groups = new Map();
  pages.forEach(({ page, html }) => {
    const seen = {};
    const doc = parse(html);
    blockDivs(doc).forEach((b) => {
      const { name, key } = variantKey(b);
      seen[key] = (seen[key] || 0) + 1;
      if (SKIP_BLOCKS.has(name) || !blockNames.has(name)) return;
      if (!groups.has(key)) groups.set(key, { name, key, list: [] });
      groups.get(key).list.push({ page, index: seen[key] - 1, d: describeBlockDiv(b) });
    });
  });
  const variants = [];
  [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).forEach(({ name, key, list }) => {
    const multi = MULTI.has(name);
    // Candidate templates: each distinct structure (item row for multi blocks). The one that
    // lets authors edit the most fields across all page blocks wins; ties go to the more common.
    const candidates = new Map();
    [...list].sort((a, b) => a.page.localeCompare(b.page)).forEach((x) => {
      const rows = multi ? x.d.rows.map((r) => ({ rows: [r] })) : [x.d];
      rows.forEach((t) => {
        const s = t.rows.map(rowShape).join(' / ');
        if (!candidates.has(s)) {
          candidates.set(s, {
            shape: s, template: t, sample: x, seen: 0,
          });
        }
        candidates.get(s).seen += 1;
      });
    });
    const scored = [...candidates.values()].map((c) => ({
      ...c, editable: list.reduce((sum, x) => sum + editableFields(c.template, x.d, multi), 0),
    })).sort((a, b) => b.editable - a.editable || b.seen - a.seen || a.shape.localeCompare(b.shape));
    // Blocks authors leave empty (section-nav fills itself): the template is the empty block.
    const { shape, template, editable } = scored[0] || { shape: '', template: { rows: [] }, editable: 0 };
    const total = list.reduce((sum, x) => sum + x.d.rows.reduce((n, r) => n + r.cells.reduce((m, c) => m + c.fields.length, 0), 0), 0);
    const covered = list.filter((x) => (multi ? multiCovers(template, x.d) : blockCovers(template, x.d))).length;
    // Up to SAMPLES pages with that structure: build uses the first whose DA source still matches.
    const samples = [...list].sort((a, b) => a.page.localeCompare(b.page)).filter((x) => hasShape(x.d, shape, multi))
      .slice(0, SAMPLES).map((x) => ({ page: x.page, index: x.index }));
    variants.push({
      name,
      key,
      multi,
      shape,
      blocks: list.length,
      pages: new Set(list.map((x) => x.page)).size,
      covered,
      editableFields: editable,
      pageFields: total,
      samples,
    });
  });
  return variants;
}

/** Collects page blocks whose class is not a deployed block (imported tables, typos). */
export function unknownBlocks(pages, blockNames) {
  const out = {};
  pages.forEach(({ page, html }) => {
    const doc = parse(html);
    blockDivs(doc).forEach((b) => {
      const { name } = variantKey(b);
      if (blockNames.has(name) || SKIP_BLOCKS.has(name)) return;
      (out[name] ??= []).push(page);
    });
  });
  return out;
}

/** Label of one field, from its element and its place in the row. */
function fieldLabel(field, ctx) {
  if (ctx.keyValue === 'key') return 'IGNORE';
  if (ctx.keyValue) return ctx.keyValue;
  if (ctx.name === 'promo' && ctx.cell === 2) return 'Colour';
  if (field.type === 'image') return ctx.name === 'social-links' ? 'Icon' : 'Image';
  if (field.type === 'list') return 'List';
  if (/^H[1-6]$/.test(field.tag)) return 'Heading';
  if (field.link === 'button') return 'Button';
  if (field.link === 'link') return 'Link';
  return 'Text';
}

/** Fields table (library-metadata `fields`) for a library block: one label per field. */
export function fieldsTable(doc, name, block, multi) {
  const d = describeBlockDiv(block);
  const rows = multi ? d.rows.slice(0, 1) : d.rows;
  const domRows = multi ? [...block.children].slice(0, 1) : [...block.children];
  const table = doc.createElement('table');
  const body = doc.createElement('tbody');
  table.append(body);
  const maxCols = Math.max(1, ...rows.map((r) => r.cells.length));
  const head = doc.createElement('tr');
  head.innerHTML = `<td colspan="${maxCols}"><p>Fields</p></td>`;
  body.append(head);
  rows.forEach((row, ri) => {
    const tr = doc.createElement('tr');
    const keyValue = row.cells.length === 2 && row.cells[0].fields.length === 1
      && KEYS.test(row.cells[0].fields[0].text) ? row.cells[0].fields[0].text : null;
    const used = {};
    row.cells.forEach((cell, ci) => {
      const td = doc.createElement('td');
      if (cell.colspan > 1) td.setAttribute('colspan', String(cell.colspan));
      const els = contentFields(normalizeCell(domRows[ri].children[ci].cloneNode(true)));
      cell.fields.forEach((f, fi) => {
        const el = els[fi];
        const a = el?.querySelectorAll?.('a') || [];
        const only = a.length === 1 && el.textContent.trim() === a[0].textContent.trim();
        const link = only ? (el.querySelector('strong a, em a, a strong, a em') ? 'button' : 'link') : null;
        let label = fieldLabel({ ...f, link }, {
          name, cell: ci, keyValue: keyValue && (ci === 0 ? 'key' : keyValue),
        });
        if (label !== 'IGNORE') {
          used[label] = (used[label] || 0) + 1;
          if (used[label] > 1) label = `${label} ${used[label]}`;
        }
        const p = doc.createElement('p');
        p.textContent = label;
        td.append(p);
      });
      tr.append(td);
    });
    body.append(tr);
  });
  return table;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const titleOf = (key) => {
  const m = key.match(/^([^ ]+)(?: \((.*)\))?$/);
  const base = m[1].split('-').map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
  return m[2] ? `${base} (${m[2]})` : base;
};

/** One library document for a block: per variant a heading, the block and its metadata. */
export function libraryDocument(name, entries) {
  const doc = parse('');
  const mainEl = doc.createElement('main');
  entries.forEach(({ variant, block }) => {
    const section = doc.createElement('div');
    const h = doc.createElement('h2');
    h.textContent = titleOf(variant.key);
    const copy = doc.importNode(block, true);
    if (variant.multi) [...copy.children].slice(MAX_ITEMS).forEach((r) => r.remove());
    const meta = doc.createElement('div');
    meta.className = 'library-metadata';
    const desc = DESCRIPTIONS[name] || '';
    meta.innerHTML = `<div><div><p>description</p></div><div><p>${esc(desc)}</p></div></div>`;
    if (copy.children.length) {
      // Empty blocks (the page fills them) get no fields: the Inspector has nothing to label.
      meta.insertAdjacentHTML('beforeend', '<div><div><p>fields</p></div><div></div></div>');
      meta.lastElementChild.lastElementChild.append(fieldsTable(doc, name, copy, variant.multi));
    }
    section.append(h, copy, meta);
    mainEl.append(section);
  });
  return `<body><header></header>${mainEl.outerHTML}<footer></footer></body>`;
}

const sheet = (data) => ({
  total: data.length, limit: data.length, offset: 0, data,
});

/** Index sheet for DA: blocks (name, path), editor (multi blocks), options. */
export function indexSheet(names) {
  const blocks = names.map((n) => ({ name: titleOf(n), path: `https://content.da.live/${ORG_SITE}/library/blocks/${n}` }));
  const editor = names.filter((n) => MULTI.has(n)).map((n) => ({ block: n, property: 'multi' }));
  return {
    blocks: sheet(blocks), editor: sheet(editor), options: sheet([]), ':names': ['blocks', 'editor', 'options'], ':version': 3, ':type': 'multi-sheet',
  };
}

/**
 * Checks a library document against the Block Inspector's metadata contract (ew-extensions
 * fields.js buildBlockFieldDefinitions, which throws on any of these): a one-cell Fields header;
 * then one row per template row (exactly one item row for multi blocks); per row the template's
 * cell count; per cell one label per template field. Returns the problems found.
 */
export function verifyLibraryDocument(html, multiNames = MULTI) {
  const problems = [];
  const doc = parse(html);
  blockDivs(doc).forEach((block) => {
    const { name, key } = variantKey(block);
    const meta = block.nextElementSibling?.classList.contains('library-metadata') ? block.nextElementSibling : null;
    const fieldsRow = [...(meta?.children || [])].find((r) => r.children[0]?.textContent.trim().toLowerCase() === 'fields');
    if (!fieldsRow) return;
    const table = fieldsRow.children[1]?.querySelector('table');
    const template = describeBlockDiv(block);
    const multi = multiNames.has(name);
    const rows = table ? [...table.querySelectorAll('tr')] : [];
    if (rows[0]?.children.length !== 1 || rows[0].textContent.trim().toLowerCase() !== 'fields') {
      problems.push(`${key}: fields table needs a one-cell Fields header`);
      return;
    }
    const want = multi ? 2 : template.rows.length + 1;
    if (rows.length !== want || (multi && !template.rows.length)) {
      problems.push(`${key}: fields table has ${rows.length} rows, the template needs ${want}`);
      return;
    }
    rows.slice(1).forEach((tr, ri) => {
      const trow = template.rows[ri];
      if (tr.children.length !== trow.cells.length) {
        problems.push(`${key}: row ${ri + 1} has ${tr.children.length} label cells for ${trow.cells.length} cells`);
        return;
      }
      [...tr.children].forEach((td, ci) => {
        const labels = td.children.length ? td.children.length : 1;
        const fields = matchFieldCount(trow.cells[ci].fields, labels);
        if (fields.length !== labels) problems.push(`${key}: row ${ri + 1} cell ${ci + 1} has ${labels} labels for ${fields.length} fields`);
      });
    });
  });
  return problems;
}

/** Builds the library from the selection and the sample pages' DA source. */
export function buildLibrary(variants, readSource) {
  const byName = new Map();
  const problems = [];
  variants.forEach((v) => {
    let found = null;
    let d = null;
    const tried = [];
    v.samples.some(({ page, index }) => {
      const html = readSource(page);
      const b = html && blockDivs(parse(html)).filter((x) => variantKey(x).key === v.key)[index];
      const desc = b && describeBlockDiv(b);
      const ok = desc && hasShape(desc, v.shape, v.multi);
      tried.push(`${page}${html ? (b ? ' (DA source differs from the published structure)' : ' (block not in DA source)') : ' (no DA source)'}`);
      if (ok) { found = b; d = desc; v.sample = { page, index }; }
      return ok;
    });
    if (!found) { problems.push(`${v.key}: no sample page matches: ${tried.join('; ')}`); return; }
    if (v.multi && v.shape) {
      const first = [...found.children].find((r, i) => rowShape(d.rows[i]) === v.shape);
      found.prepend(first);
    }
    if (!byName.has(v.name)) byName.set(v.name, []);
    byName.get(v.name).push({ variant: v, block: found });
  });
  const docs = {};
  [...byName.keys()].sort().forEach((name) => {
    const entries = byName.get(name).sort((a, b) => (a.variant.key === name ? -1 : b.variant.key === name ? 1 : b.variant.blocks - a.variant.blocks));
    docs[name] = libraryDocument(name, entries);
    verifyLibraryDocument(docs[name]).forEach((p) => problems.push(`${name}: ${p}`));
  });
  return { docs, index: indexSheet(Object.keys(docs)), problems };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = readArgs(rest);
  const blockNames = new Set(fs.readdirSync(path.join(root, 'blocks')));
  if (cmd === 'select') {
    const files = fs.readdirSync(args.pages).filter((f) => f.endsWith('.html')).sort();
    const pages = files.map((f) => ({ page: pageOf(f), html: fs.readFileSync(path.join(args.pages, f), 'utf8') }));
    const variants = selectTemplates(pages, blockNames);
    const unknown = unknownBlocks(pages, blockNames);
    const out = args.out || path.join(root, 'tools/library/library-variants.json');
    fs.writeFileSync(out, `${JSON.stringify({ pages: pages.length, variants, unknown }, null, 1)}\n`);
    variants.forEach((v) => console.log(`${String(v.covered).padStart(4)}/${String(v.blocks).padEnd(4)} ${(v.pageFields ? `${Math.round((100 * v.editableFields) / v.pageFields)}%` : '-').padStart(4)} ${v.multi ? 'multi ' : '      '}${v.key}  [${v.shape.slice(0, 60)}]`));
    console.log(`${variants.length} variants of ${new Set(variants.map((v) => v.name)).size} blocks; ${Object.keys(unknown).length} class names without a block folder -> ${out}`);
  } else if (cmd === 'build') {
    const { variants } = JSON.parse(fs.readFileSync(args.variants, 'utf8'));
    const read = (page) => {
      const f = path.join(args.source, fileOf(page, '.html'));
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    };
    const { docs, index, problems } = buildLibrary(variants, read);
    fs.mkdirSync(path.join(args.out, 'blocks'), { recursive: true });
    Object.entries(docs).forEach(([name, html]) => fs.writeFileSync(path.join(args.out, 'blocks', `${name}.html`), html));
    fs.writeFileSync(path.join(args.out, 'blocks.json'), JSON.stringify(index));
    problems.forEach((p) => console.log(`skipped: ${p}`));
    console.log(`${Object.keys(docs).length} library documents, ${index.blocks.data.length} index rows -> ${args.out}`);
    if (problems.length) process.exitCode = 2;
  } else {
    console.log('usage: build-library.mjs select --pages <dir> [--out file] | build --variants <file> --source <dir> --out <dir>');
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
