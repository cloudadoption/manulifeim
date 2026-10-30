/*
 * Tabs block (replaces navigationTabs): one tab per row, the first one open.
 *
 * DA authoring table (one row per tab):
 *
 * | Tabs              |                                                      |
 * | Inflation targets | #### Is 2% the right target? / text / image           |
 * | Terminal rates    | rich text, images                                    |
 *
 * First cell = tab label, second cell = panel content. A panel with an image lays out text
 * and image side by side from 801px (like live's landing-image card). Rows without a label
 * or without content are skipped. Keyboard: Left / Right / Home / End move between tabs.
 * Canvas (authoring): the rows stay as authored, all visible.
 *
 * Variant `sections` (built by scripts/section-tabs.js from sections with Section Metadata
 * `Tab`, not authored as a table): one row per tab, label | ids of the panel's sections. The
 * block keeps only the tab list; the sections themselves are the panels.
 */
import isAuthoring from '../../scripts/authoring.js';

let count = 0;

/* panels[i] = the element(s) of tab i */
function select(tabs, panels, index, focus) {
  tabs.forEach((tab, i) => {
    const on = i === index;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panels[i].forEach((panel) => { panel.hidden = !on; });
  });
  if (focus) tabs[index].focus();
}

function tabButton(id, i, panelIds) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tabs-tab';
  tab.id = `${id}-tab-${i}`;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', panelIds.join(' '));
  return tab;
}

function asPanel(panel, tab) {
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  panel.tabIndex = 0;
}

/* tab list with click and Left / Right / Home / End; opens tab `open` */
function tabList(tabs, panels, open) {
  const list = document.createElement('div');
  list.className = 'tabs-list';
  list.setAttribute('role', 'tablist');
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tabs, panels, i, false));
    list.append(tab);
  });
  list.addEventListener('keydown', (e) => {
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    const last = tabs.length - 1;
    const next = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs, panels, next, true);
  });
  select(tabs, panels, open, false);
  return list;
}

/* variant sections: the panels are sections of the page, found by id */
function decorateSections(block, id) {
  const tabs = [];
  const panels = [];
  [...block.children].forEach((row) => {
    const [label, refs] = row.children;
    const sections = (refs?.textContent || '').trim().split(/\s+/)
      .map((ref) => (ref ? document.getElementById(ref) : null)).filter(Boolean);
    if (!label?.textContent.trim() || !sections.length) return;
    const tab = tabButton(id, tabs.length, sections.map((s) => s.id));
    tab.textContent = label.textContent.trim();
    sections.forEach((s) => asPanel(s, tab));
    tabs.push(tab);
    panels.push(sections);
  });
  if (!tabs.length) return;
  const open = Math.max(0, panels.findIndex((p) => !p[0].hidden));
  block.replaceChildren(tabList(tabs, panels, open));
}

export default function decorate(block) {
  if (block.classList.contains('sections')) {
    if (isAuthoring()) return;
    count += 1;
    decorateSections(block, `tabs-${count}`);
    return;
  }
  const rows = [...block.children].filter((row) => {
    const [label, content] = row.children;
    return label && content && label.textContent.trim()
      && (content.textContent.trim() || content.querySelector('picture, img'));
  });
  if (isAuthoring()) {
    rows.forEach((row) => row.classList.add('tabs-item'));
    return;
  }
  if (!rows.length) return;
  count += 1;
  const id = `tabs-${count}`;
  const tabs = [];
  const panels = [];
  rows.forEach((row, i) => {
    const [label, content] = row.children;
    const tab = tabButton(id, i, [`${id}-panel-${i}`]);
    const only = label.children.length === 1 ? label.firstElementChild : null;
    tab.append(...(only && only.tagName === 'P' ? only : label).childNodes);
    const panel = document.createElement('div');
    panel.className = 'tabs-panel';
    panel.id = `${id}-panel-${i}`;
    asPanel(panel, tab);
    if (content.querySelector('picture, img')) panel.classList.add('tabs-panel-media');
    const text = document.createElement('div');
    text.className = 'tabs-panel-text';
    const media = document.createElement('div');
    media.className = 'tabs-panel-image';
    [...content.children].forEach((el) => {
      const isImage = el.matches('picture, img')
        || (el.tagName === 'P' && el.querySelector('picture, img') && !el.textContent.trim());
      (isImage ? media : text).append(el);
    });
    panel.append(text);
    if (media.children.length) panel.append(media);
    tabs.push(tab);
    panels.push([panel]);
  });
  const list = tabList(tabs, panels, 0);
  block.replaceChildren(list, ...panels.flat());
}
