/*
 * UI strings from the DA sheet /institutional/tw/en/placeholders (columns Key | Text), fetched
 * once per page. The English defaults stay in the blocks, so a missing sheet, row or cell changes
 * nothing. Sheet source: tools/importer/placeholders.json.
 */
export const PLACEHOLDERS_SHEET = '/institutional/tw/en/placeholders.json';

let pending;

/**
 * Key -> text from the placeholders sheet (one request per page, shared by all blocks).
 * @returns {Promise<Object<string, string>>} empty when the sheet is missing or unreadable
 */
export function fetchPlaceholders() {
  if (!pending) {
    pending = fetch(PLACEHOLDERS_SHEET)
      .then((resp) => (resp.ok ? resp.json() : {}))
      .then((json) => Object.fromEntries((json.data || [])
        .filter((row) => String(row.Key || '').trim() && String(row.Text || '').trim())
        .map((row) => [String(row.Key).trim(), String(row.Text).trim()])))
      .catch(() => ({}));
  }
  return pending;
}

/**
 * Text for a key, else the English default; `{name}` is replaced from vars.
 * @param {Object<string, string>} ph from fetchPlaceholders
 * @param {string} key
 * @param {string} fallback English default
 * @param {Object<string, string|number>} [vars]
 * @returns {string}
 */
export function placeholder(ph, key, fallback, vars = {}) {
  const text = (ph && ph[key]) || fallback;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/** Test hook: forget the cached sheet. */
export function resetPlaceholders() {
  pending = undefined;
}
