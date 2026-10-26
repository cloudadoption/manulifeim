/* eslint-disable */
/* global WebImporter */
/*
 * Parser: case-study-sidebar. Live: aside.caseStudyDetail__sidebar (logo, "Explore all our
 * ESG case studies" link, tag pills linking to the listing with AEM tag ids).
 * Project contract (block-authoring.md, blocks/case-study-sidebar/case-study-sidebar.js):
 *   | Case Study Sidebar |
 *   | logo image | |
 *   | [Explore all our ESG case studies](...) | |
 *   | Tags | [Natural resources](...?theme=natural-resources), ... |
 * Tags are kept as links (the links transformer turns ?en/case-studies/themes/<x> into
 * ?theme=<x> and topics into ?topic=<x>), so the live targets survive.
 */
import {
  image, block, text, linkFrom,
} from '../utils/dom.js';

export default function parse(element, { document }) {
  const rows = [];
  const logo = image(document, element.querySelector('.caseStudyDetail__logo img'));
  if (logo) rows.push([logo]);
  element.querySelectorAll('.caseStudyDetail__properties a, .caseStudyDetail__link a').forEach((a) => {
    rows.push([linkFrom(document, a)]);
  });
  const ul = document.createElement('ul');
  element.querySelectorAll('.caseStudyDetail__tags a, .caseStudyPills__link').forEach((a) => {
    if (!a.getAttribute('href')) return;
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.setAttribute('href', a.getAttribute('href'));
    link.textContent = text(a);
    li.append(link);
    ul.append(li);
  });
  if (ul.children.length) rows.push(['Tags', ul]);
  element.replaceWith(block(document, 'Case Study Sidebar', [], rows));
}
