# Decisions

## ADR-001: index source for listings, search and teasers (2026-10-28)

**Context.** Listing, search, cards (news), article-list, related-articles and tag-list read
query indices (`tools/importer/QUERY-INDEX.md`). Edge Delivery builds indices from published pages
only. While nothing was published, the blocks fell back at runtime from the native index to a
stand-in sheet built from previewed pages (`preview-index.json`,
`tools/importer/build-preview-index.mjs`), and listings fell back again to the site index when their
own index was empty.

**Decision.** One constant decides the source: `INDEX_SOURCE` in `scripts/block-utils.js`, now
`native`. There is no runtime fallback chain. Each block reads its own index (or the `Source` row);
an empty index shows the block's empty state. Paging past 1,000 rows and the per-path cache stay.

**Why now.** On 2026-10-28 the native indices are populated on aem.page and aem.live: site index
417 rows, viewpoints 208, press 36, case studies 29, resources 24, people 6. The stand-in had 577
previewed pages, so the fallback no longer ran anyway.

**Consequences.**
- Listings on aem.page show published pages only. A page that is previewed but not published
  appears in no listing until it is published.
- The capture loop no longer rebuilds or uploads the stand-in (`after-capture.sh`). The
  `preview-index` sheet stays in DA, unused; deleting it is a content change for the site owner.

**When to flip back to `stand-in`.** Only for a new, unpublished tree that has to be reviewed on
aem.page with working listings: run `sh tools/importer/update-preview-index.sh` (builds, uploads and
previews the sheet), set `INDEX_SOURCE = 'stand-in'`, and set it back to `native` once the tree is
published. Never ship `stand-in` to a published site: live listings would show unpublished pages.

## ADR-002: listing people mode kept until capture is complete (2026-10-28)

`listing (people)` (`blocks/listing/people.js`) has no use in DA. Of the two people-listing pages in
scope, `/consultant-team` is imported as authored content and `/authors` answered 404 on live
(2026-10-26, `_state.json`). About 600 pages are still uncaptured and may include a people listing.

**Decision (Ben, 2026-10-28).** Keep the mode (it loads only when a block uses it) until capture is
complete; do not delete it before then.

**Revisit** when every row of `tools/migration-scope/pages.csv` has been captured: if no imported page
uses `listing (people)`, delete `people.js`, the `people` variant and its CSS in one commit.
