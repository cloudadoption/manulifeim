/* global WebImporter */
/*
 * Sections transformer.
 *
 * beforeTransform: builds the section model of the page from the live template root
 * (utils/page-model.js) and replaces <body> with <div class="mim-page"> holding one
 * <div class="mim-section"> per EDS section. Block components stay as live elements
 * so the parsers can find them by their live class.
 *
 * afterTransform: flattens the sections into the importer's section syntax:
 * content, then a Section Metadata block (Style, Id, Nav Title, Layout) when needed,
 * then <hr> before the next section.
 */
import {
  itemsFor, toSections, renderSections,
} from '../utils/page-model.js';
import {
  h, text, isEmpty, norm,
} from '../utils/dom.js';

function mainOf(document) {
  return document.querySelector('main#main-content') || document.querySelector('main') || document.body;
}

/* component-root templates: home, plain, viewpoints (landing, categories), press-release, search */
function componentRootModel(document, main, opts) {
  const root = main.querySelector(':scope > .component-root, :scope > div') || main;
  return toSections(itemsFor(document, [...root.children]), opts);
}

/* article: header | body flow | sidebar | related | tags */
function articleModel(document, main) {
  const art = main.querySelector('article.viewpoint-detail');
  const sections = [];
  if (!art) return componentRootModel(document, main, {});
  // 1. header: date p, h1, summary p
  const header = [];
  const time = art.querySelector('.viewpoint-detail__header .viewpoint-date time, .viewpoint-detail__header time');
  if (text(time)) header.push(h(document, 'p', text(time)));
  const h1 = art.querySelector('.viewpoint-detail__title h1, .viewpoint-detail__header h1');
  if (text(h1)) header.push(h(document, 'h1', h1.innerHTML.trim()));
  const summary = art.querySelector('.viewpoint-detail__summary');
  if (text(summary)) header.push(h(document, 'p', summary.innerHTML.trim()));
  if (header.length) sections.push({ nodes: header, styles: [] });

  // 2. body (flow, split at dividers)
  const content = art.querySelector('.viewpoint-content')
    || art.querySelector('.viewpoint-detail__content');
  if (content) {
    sections.push(...toSections(itemsFor(document, [...content.children]), { flow: true }));
  }

  // 3. sidebar
  const sidebar = art.querySelector('section.viewpoint-detail__sidebar');
  if (sidebar) {
    const nodes = [];
    const authors = [...sidebar.querySelectorAll(':scope > .author-container, :scope > .manager-logo')];
    if (authors.length) {
      const wrap = document.createElement('div');
      wrap.className = 'mim-authors';
      authors.forEach((a) => wrap.append(a));
      nodes.push(wrap);
    }
    // share controls: one row per action, the block builds the links for the EDS URL
    const actions = (sidebar.getAttribute('data-mim-share') || '').split('|').filter(Boolean);
    if (actions.length) nodes.push(WebImporter.Blocks.createBlock(document, { name: 'Share', cells: actions.map((a) => [a]) }));
    sidebar.querySelectorAll(':scope > section.viewpoint-links').forEach((s) => {
      if (s.querySelector('a[href]')) nodes.push(s);
    });
    if (nodes.length) sections.push({ nodes, styles: ['sidebar'] });
  }

  // 4. footer: related viewpoints, all tags
  const footer = main.querySelector('footer.viewpoints-footer');
  if (footer) {
    const related = footer.querySelector('.related-viewpoints');
    if (related && related.querySelector('a[href]')) sections.push({ nodes: [related], styles: [] });
    const tags = footer.querySelector('details.viewpoint-tags');
    if (tags && tags.querySelector('a[href]')) {
      const wrap = tags.closest('.viewpoint-tags__component-wrapper') || h(document, 'div', tags);
      wrap.classList.add('viewpoint-tags__component-wrapper', 'mim-padded');
      sections.push({ nodes: [wrap], styles: [] });
    }
  }
  return sections;
}

/* case study detail: header | body components | sidebar */
function caseStudyDetailModel(document, main) {
  const art = main.querySelector('article.caseStudyDetail');
  if (!art) return componentRootModel(document, main, {});
  const sections = [];
  const header = [];
  const h1 = art.querySelector('.caseStudyDetail__title, header h1');
  if (text(h1)) header.push(h(document, 'h1', h1.innerHTML.trim()));
  const desc = art.querySelector('.caseStudyDetail__description');
  if (text(desc)) header.push(h(document, 'p', desc.innerHTML.trim()));
  if (header.length) sections.push({ nodes: header, styles: [] });
  const content = art.querySelector('.caseStudyDetail__content');
  if (content) sections.push(...toSections(itemsFor(document, [...content.children]), {}));
  const aside = art.querySelector('aside.caseStudyDetail__sidebar');
  if (aside && !isEmpty(aside)) sections.push({ nodes: [aside], styles: ['sidebar'] });
  return sections;
}

/* case study listing: hero | listing app (sorter + results, Listing (case-studies)) | footer */
function caseStudyListModel(document, main) {
  const list = main.querySelector('.caseStudyList');
  if (!list) return componentRootModel(document, main, {});
  const elements = [];
  const header = list.querySelector(':scope > header.heroHeader2__banner, :scope > .heroHeader2');
  if (header) elements.push(header.classList.contains('heroHeader2') ? header : h(document, 'div', header));
  if (elements[0] && !elements[0].classList.contains('heroHeader2')) elements[0].className = 'heroHeader2';
  const results = list.querySelector('.caseStudyList__app') || list.querySelector('.caseStudyResults');
  if (results) elements.push(results);
  const footer = list.querySelector('.caseStudyList__footer');
  if (footer) elements.push(...footer.children);
  return toSections(itemsFor(document, elements), {});
}

/* press release listing: hero | categories | content (media relations sidebar + releases
   + pagination, one Listing (press) block with a Sidebar row) */
function pressRootModel(document, main) {
  const root = main.querySelector('.pressReleaseRoot');
  if (!root) return componentRootModel(document, main, {});
  const elements = [
    root.querySelector('.pressReleaseRoot__header'),
    root.querySelector('.pressCategories__inner'),
    root.querySelector('.pressReleaseRoot__content')
      || root.querySelector('.pressItems'),
  ].filter(Boolean);
  return toSections(itemsFor(document, elements), {});
}

/* viewpoints/all (route viewpointsList, React ViewpointsList, .viewpointsList2): header h1 |
   filter tabs (UI, rebuilt by the block, dropped) | "N listings" + list -> one Listing
   (viewpoints) block. The live list is rendered from another site's index (links to
   /institutional/kr/en), so no item is kept: the block reads the tw/en viewpoints index. */
function viewpointsListModel(document, main) {
  const root = main.querySelector('.viewpointsList2');
  if (!root) return componentRootModel(document, main, {});
  const items = [];
  const h1 = root.querySelector('.viewpointsList2__header h1, h1.viewpointsList2__title');
  if (h1) items.push(...itemsFor(document, [h1]));
  const content = root.querySelector('.viewpointsList2__content');
  if (content) items.push({ type: 'block', el: content, name: 'listing' });
  return toSections(items, {});
}

/* press release: the live title component holding the h1 is the release title (date, h1, body
   flow; styles/templates.css), not a Style section-title section. It is read as rich text, as
   before. */
function pressReleaseModel(document, main) {
  main.querySelectorAll('.title').forEach((t) => {
    if (t.querySelector('h1')) t.classList.replace('title', 'text');
  });
  return componentRootModel(document, main, { flow: true });
}

const MODELS = {
  viewpoints: (d, m) => (m.querySelector('.viewpointsList2') ? viewpointsListModel(d, m) : componentRootModel(d, m, {})),
  viewpoint: articleModel,
  'case-study-detail': caseStudyDetailModel,
  'case-study-list': caseStudyListModel,
  'press-release-root': pressRootModel,
  'press-release': pressReleaseModel,
};

function buildSections(document, templateName) {
  const main = mainOf(document);
  const model = MODELS[templateName] || ((d, m) => componentRootModel(d, m, {}));
  const sections = model(document, main);
  const page = renderSections(document, sections);
  document.body.replaceChildren(page);
  return sections.length;
}

function sectionMetadata(document, meta) {
  const cells = Object.entries(meta).map(([k, v]) => [k, v]);
  return WebImporter.Blocks.createBlock(document, { name: 'Section Metadata', cells });
}

function flatten(document) {
  const page = document.body.querySelector(':scope > .mim-page');
  if (!page) return;
  const out = [];
  [...page.querySelectorAll(':scope > .mim-section')].forEach((sec) => {
    let meta = {};
    try {
      meta = JSON.parse(sec.getAttribute('data-mim') || '{}');
    } catch (e) {
      meta = {};
    }
    if (!norm(sec.textContent) && !sec.querySelector('img, table')) return;
    if (out.length) out.push(document.createElement('hr'));
    out.push(...sec.childNodes);
    if (Object.keys(meta).length) out.push(sectionMetadata(document, meta));
  });
  page.querySelectorAll(':scope > .mim-metadata').forEach((m) => out.push(...m.childNodes));
  document.body.replaceChildren(...out);
}

export default function transform(hookName, element, payload) {
  const { document } = payload;
  if (hookName === 'beforeTransform') {
    const name = payload.template && payload.template.name;
    const count = buildSections(document, name);
    if (payload.ctx) payload.ctx.sections = count;
  } else if (hookName === 'afterTransform') {
    flatten(document);
  }
}
