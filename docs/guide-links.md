# Guide links

Add a `Links` row with value `new-tab` to a page's Metadata table to open its main-content HTTP links in new tabs:

| Metadata | |
| --- | --- |
| Links | new-tab |

The value is case-insensitive and surrounding whitespace is ignored. Pages without this value are unchanged and do not load `scripts/link-target.js`.

After the page's sections and footer load, `scripts/scripts.js` adds `target="_blank"` and `rel="noopener"` to links inside `main`. It keeps the authored nodes, URLs and existing `rel` values. Header and footer links are not changed.

Same-page fragment links, empty links, `mailto:`, `tel:` and other non-HTTP protocols are not changed. A link to a different query or page still opens a new tab even if it has a fragment. Links added asynchronously after the lazy loading pass are not covered; avoid relying on this metadata for dynamic listings.

Use this row on `/migration-status/author-guide`, `/migration-status/tech-guide` and their topic pages. Do not add it to the replica's normal content unless that page should also use new tabs.

Run `node --test test/link-target.test.mjs` for focused tests, then `npm test` and `npm run lint`. To verify in a browser, preview a page with the row, inspect its main links, and compare a page without the row. The latter must not request `scripts/link-target.js`.

To roll back, revert the implementation commit. The Metadata row can remain: without the implementation it has no effect.
