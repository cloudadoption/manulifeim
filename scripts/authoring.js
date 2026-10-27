/*
 * Authoring contract (DA Canvas / quick-edit). No imports, so blocks can use it without cycles.
 *
 * Canvas loads the page with `?quick-edit=<value>&controller=parent`; any value counts (the
 * quick-edit plugin itself only checks `has('quick-edit')`). In authoring mode the page shows no
 * attestation blur or modal, no showcase notice, no carousel timers and no scroll-spy, so authors
 * see and can edit the authored content. The attribute on <html> survives the body swaps the
 * plugin does on structural edits.
 */
if (new URLSearchParams(window.location.search).has('quick-edit')) {
  document.documentElement.setAttribute('quick-edit', '');
}

/**
 * @returns {boolean} true when the page runs inside DA Canvas (quick-edit)
 */
export default function isAuthoring() {
  return document.documentElement.hasAttribute('quick-edit');
}

let controller = new AbortController();

/**
 * Signal for listeners on document/window that must not outlive one page decoration: Canvas
 * re-runs loadPage on the same document after each structural edit.
 * @returns {AbortSignal}
 */
export function pageSignal() {
  return controller.signal;
}

/**
 * Aborts the listeners of the previous decoration and starts a new signal (called by loadPage).
 */
export function renewPageSignal() {
  controller.abort();
  controller = new AbortController();
}
