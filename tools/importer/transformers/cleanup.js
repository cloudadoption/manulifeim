/*
 * Cleanup transformer (beforeTransform): removes the live site chrome and junk that is
 * not page content. The header, sidebar navigation, site banner, footer and the
 * attestation modal are rebuilt once in EDS (/nav, /footer, scripts), so they are never
 * imported. Runs before the sections transformer, which then only reads <main>.
 */
const CHROME = [
  // header, skip link, sidebar rail and mobile menu
  'div.navigation', 'header.header', 'nav.sidebar', 'a.navigation__skip',
  // CPS login / register dialogs, region + attestation modal
  'div.xfpage', '#auth-container', 'dialog#region-modal', '.attestation__modal',
  // site banner
  'aside .siteBanner', '.siteBanner',
  // global footer (not the article footer.viewpoints-footer inside <main>)
  'div.main-container__content > footer.footer', 'footer.footer',
  // video modal, OneTrust, analytics, svg sprite
  'dialog.videoModal', '#onetrust-consent-sdk', '#onetrust-style', 'span[data-module="GlobalAnalytics"]',
  'body > div > div[style*="display: none"]', 'body > div > div[style*="display:none"]',
  'meta[name="google-site-verification"]', 'atomic-search-interface#coveo-search',
  'script', 'style', 'noscript', 'link',
];

/* junk inside <main> (also dropped by the page model; removed here for safety);
   .strategyDetail is content (strategy-section parser), only its follow button is UI */
const JUNK = [
  '.ghost', '.trending-topics2', '.consentModal', '.subscribe', '.strategyDetail__follow',
  '.viewpoint-detail__print-authors', '.share-controls', '.imageToggle', '.strategyTag',
  '.sort-viewpoints', '.caseStudyDetail__bottom', '.pressCategories__wrapper--stuckable',
  '.cc-select__bg', 'iframe[src*="onetrust"]',
];

function removeComments(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
}

export default function transform(hookName, element, payload) {
  if (hookName !== 'beforeTransform') return;
  const { document } = payload;
  const { body } = document;
  CHROME.forEach((sel) => {
    body.querySelectorAll(sel).forEach((n) => {
      // never remove <main> or anything holding it
      if (n.tagName === 'MAIN' || n.querySelector('main')) return;
      n.remove();
    });
  });
  const main = body.querySelector('main') || body;
  JUNK.forEach((sel) => main.querySelectorAll(sel).forEach((n) => {
    // the article sidebar keeps the share action names for its Share block (sections.js)
    if (n.matches('.viewpoint-detail__sidebar > .share-controls')) {
      n.parentElement.setAttribute('data-mim-share', [...n.querySelectorAll('.share-links__caption')]
        .map((c) => c.textContent.trim()).filter(Boolean).join('|'));
    }
    n.remove();
  }));
  // the svg sprite and inline icons carry no content
  body.querySelectorAll('svg').forEach((n) => n.remove());
  removeComments(body);
}
