/**
 * Library documents (/library/blocks/*) end each example with a library-metadata table
 * (description and Block Inspector field labels). DA reads it from the document source;
 * the rendered example, e.g. the Insert block preview, should not show it.
 * @param {Element} block
 */
export default function decorate(block) {
  block.hidden = true;
  const wrapper = block.parentElement;
  if (wrapper?.classList.contains('library-metadata-wrapper')) wrapper.hidden = true;
}
