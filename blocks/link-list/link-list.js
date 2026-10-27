/* eslint-disable max-len */
/*
 * Link List block (replaces linkList2 and moreInsights).
 *
 * DA authoring tables:
 *
 * | Link List[ (card)]          |
 * | (opt) subtitle text / (opt) ## title |
 * | link "Click here to go to the MCQS homepage" |
 * | link …                      |
 *   (links can also be one list in a single cell)
 *
 * | Link List (inline) |                                                 |
 * | More insight       | links (list or paragraphs): Climate Opportunities, Asset Allocation Views |
 *
 * The authored cells stay as they are (Canvas edits them in place); each gets a class and
 * CSS styles the heading, text and links inside.
 */
/* eslint-enable max-len */
export default function decorate(block) {
  const inline = block.classList.contains('inline');
  [...block.querySelectorAll(':scope > div > div')].forEach((cell, i) => {
    const hasLink = !!cell.querySelector('a[href]');
    const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
    if (inline) {
      cell.classList.add(i === 0 && !hasLink ? 'link-list-title' : 'link-list-links');
    } else if (hasLink) {
      cell.classList.add('link-list-item');
    } else if (heading) {
      cell.classList.add('link-list-heading');
    } else if (cell.textContent.trim()) {
      cell.classList.add('link-list-subtitle');
    }
  });
}
