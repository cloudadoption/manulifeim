import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const here = new URL('https://main--manulifeim--cloudadoption.aem.page/migration-status/author-guide');
const load = () => import('../scripts/link-target.js');

function page(content) {
  return new JSDOM(`<header><a href="/nav">Navigation</a></header><main>${content}</main><footer><a href="/footer">Footer</a></footer>`).window.document;
}

test('opens absolute and relative HTTP links in main only', async () => {
  const { default: openLinksInNewTab } = await load();
  const doc = page('<a href="https://da.live/canvas#/cloudadoption/manulifeim">DA</a><a href="/institutional/tw/en">Home</a><a href="pages">Pages</a>');
  openLinksInNewTab(doc.querySelector('main'), here);
  doc.querySelectorAll('main a').forEach((a) => {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener');
  });
  doc.querySelectorAll('header a, footer a').forEach((a) => {
    assert.equal(a.hasAttribute('target'), false);
    assert.equal(a.hasAttribute('rel'), false);
  });
});

test('keeps fragment anchors and non-HTTP links unchanged', async () => {
  const { default: openLinksInNewTab } = await load();
  const doc = page(`<a href="#editing">Anchor</a><a href="${here}#editing">Same page</a><a href="mailto:author@example.com">Mail</a><a href="tel:+15555550100">Phone</a><a href="javascript:void(0)">Action</a><a href="">Empty</a><a>No href</a>`);
  const before = doc.querySelector('main').innerHTML;
  openLinksInNewTab(doc.querySelector('main'), here);
  assert.equal(doc.querySelector('main').innerHTML, before);
});

test('preserves href, authored nodes and rel values; repeated decoration is idempotent', async () => {
  const { default: openLinksInNewTab } = await load();
  const doc = page('<a href="/institutional/tw/en" rel="nofollow noreferrer">Home</a>');
  const main = doc.querySelector('main');
  const link = main.querySelector('a');
  openLinksInNewTab(main, here);
  const after = main.innerHTML;
  openLinksInNewTab(main, here);
  assert.equal(main.querySelector('a'), link);
  assert.equal(link.getAttribute('href'), '/institutional/tw/en');
  assert.equal(link.rel, 'nofollow noreferrer noopener');
  assert.equal(main.innerHTML, after);
});

test('opens links to another page or query even when they have a fragment', async () => {
  const { default: openLinksInNewTab } = await load();
  const doc = page(`<a href="/migration-status/tech-guide#blocks">Other page</a><a href="${here}?view=source#editing">Other query</a>`);
  openLinksInNewTab(doc.querySelector('main'), here);
  doc.querySelectorAll('a[href*="#"]').forEach((a) => assert.equal(a.target, '_blank'));
});
