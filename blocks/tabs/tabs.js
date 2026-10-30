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
 */
import isAuthoring from '../../scripts/authoring.js';

let count = 0;

function select(tabs, panels, index, focus) {
  tabs.forEach((tab, i) => {
    const on = i === index;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panels[i].hidden = !on;
  });
  if (focus) tabs[index].focus();
}

export default function decorate(block) {
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
  const list = document.createElement('div');
  list.className = 'tabs-list';
  list.setAttribute('role', 'tablist');
  const tabs = [];
  const panels = [];
  rows.forEach((row, i) => {
    const [label, content] = row.children;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tabs-tab';
    tab.id = `${id}-tab-${i}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${id}-panel-${i}`);
    const only = label.children.length === 1 ? label.firstElementChild : null;
    tab.append(...(only && only.tagName === 'P' ? only : label).childNodes);
    const panel = document.createElement('div');
    panel.className = 'tabs-panel';
    panel.id = `${id}-panel-${i}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
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
    tab.addEventListener('click', () => select(tabs, panels, i, false));
    tabs.push(tab);
    panels.push(panel);
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
  block.replaceChildren(list, ...panels);
  select(tabs, panels, 0, false);
}
