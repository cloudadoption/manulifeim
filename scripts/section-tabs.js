/*
 * Section tabs: consecutive sections with Section Metadata `Tab | <label>` become one tab set,
 * each tab showing whole sections (so columns, cards, tables and section layouts work inside a
 * panel). Consecutive sections with the same label form one panel; a section without `Tab`
 * ends the set. A set needs two panels or more (a lone `Tab` section stays a plain section).
 *
 *   | Section Metadata |                  |
 *   | Tab              | Developed markets |
 *
 * Runs as an auto block, before decorateSections: Edge Delivery renders the metadata as
 * data-tab on the section div. A new section before the set holds a Tabs block (variant
 * `sections`, one row per tab: label | ids of the panel's sections); blocks/tabs wires the
 * tab list to the sections. All panels but the open one are hidden from the start (the open one
 * is the first, or the one holding the element the URL hash points to). Canvas (authoring):
 * nothing is grouped, every section stays visible.
 */

let count = 0;

/** Runs of consecutive `main > div[data-tab]` sections: [[{ label, sections: [] }, ...], ...] */
export function tabGroups(main) {
  const groups = [];
  let group = null;
  [...main.children].forEach((section) => {
    const label = section.tagName === 'DIV' ? (section.dataset.tab || '').trim() : '';
    if (!label) {
      group = null;
      return;
    }
    if (!group) {
      group = [];
      groups.push(group);
    }
    const last = group[group.length - 1];
    if (last && last.label === label) last.sections.push(section);
    else group.push({ label, sections: [section] });
  });
  return groups.filter((g) => g.length > 1);
}

function hashTarget(doc) {
  const id = decodeURIComponent((doc.defaultView?.location.hash || '').slice(1));
  return id ? doc.getElementById(id) : null;
}

/**
 * Builds the Tabs blocks for the section tab sets of `main` (call before decorateSections).
 * @param {Element} main
 * @returns {number} number of tab sets built
 */
export default function buildSectionTabs(main) {
  const doc = main.ownerDocument;
  const target = hashTarget(doc);
  const groups = tabGroups(main);
  groups.forEach((panels) => {
    count += 1;
    const block = doc.createElement('div');
    block.className = 'tabs sections';
    let open = panels.findIndex((p) => target && p.sections.some((s) => s.contains(target)));
    if (open < 0) open = 0;
    panels.forEach((panel, i) => {
      const ids = panel.sections.map((s, k) => {
        if (!s.id) s.id = `section-tabs-${count}-panel-${i}${k ? `-${k}` : ''}`;
        s.hidden = i !== open;
        return s.id;
      });
      const row = doc.createElement('div');
      const label = doc.createElement('div');
      label.textContent = panel.label;
      const refs = doc.createElement('div');
      refs.textContent = ids.join(' ');
      row.append(label, refs);
      block.append(row);
    });
    const section = doc.createElement('div');
    section.append(block);
    panels[0].sections[0].before(section);
  });
  return groups.length;
}
