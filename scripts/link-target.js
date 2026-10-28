/** Page metadata `Links: new-tab` opts main-content links into new tabs. */
export default function openLinksInNewTab(main, here) {
  main.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    let url;
    try {
      url = new URL(href, here);
    } catch (e) {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    if (url.hash && url.origin === here.origin
      && url.pathname === here.pathname && url.search === here.search) return;
    a.setAttribute('target', '_blank');
    const rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
    if (!rel.includes('noopener')) rel.push('noopener');
    a.setAttribute('rel', rel.join(' '));
  });
}
