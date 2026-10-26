# Link rewriting rules (import)

All import scripts (`tools/importer/import-<template>.js`) rewrite links with one central util,
`tools/importer/utils/links.js` (`rewriteHref`, `rewriteLinks`), applied by
`transformers/links.js` after the parsers ran. Keep this file and the util in sync.

## Inputs

- `tools/importer/link-map.json`: `live_path -> eds_path` for every row of
  `tools/migration-scope/pages.csv` whose `live_status` is `200` or `unchecked`. Rebuild it with
  `node tools/importer/build-link-map.mjs` after pages.csv changes, then re-bundle the import scripts
  (the JSON is bundled into each script).
- Relative hrefs are resolved against `https://www.manulifeim.com` + the live path of the page
  being imported (the importer loads snapshots with `page.setContent`, so `document.location` is
  `about:blank`; the code never reads `a.href` / `img.src` properties, only attributes).

## Document path

The import result path of a page is its `eds_path` from pages.csv (lowercase, no `_`, no `--` in a
segment). A page that is not in pages.csv falls back to the same sanitizing rule as pages.csv
(lowercase, `_` -> `-`, repeated `-` collapse, leading/trailing `-` removed per segment).

## Rules, in order (first match wins)

| # | live link | result | rule id |
|---|---|---|---|
| 1 | `#...`, `mailto:`, `tel:`, `sms:`, `data:` | unchanged | `keep-scheme` |
| 2 | `javascript:` (share / copy / download actions) | link removed, text kept | `javascript` |
| 3 | any host other than `www.manulifeim.com` / `manulifeim.com` (LinkedIn, bit.ly, jhinvestments.com, ...) | unchanged | `external` |
| 4 | AEM-internal `/content/mim-institutional/tw/en/...(.html)` | mapped to `/institutional/tw/en/...`, then rules 7-15 | - |
| 5 | AEM servlets (`/content/mim-institutional/...jcr:content...`, `_jcr_content`) | absolute live URL | `aem-servlet` |
| 6 | `/content/dam/...` documents (PDF, xlsx, docx, extension-less DAM docs) and images | absolute `https://www.manulifeim.com/content/dam/...` | `dam-document`, `dam-image` |
| 6b | any other `/content/...` | absolute live URL | `aem-other` |
| 7 | path outside `/institutional/tw/en` (other countries, `/institutional/global/en`, retail, other brands) | absolute `https://www.manulifeim.com/...` (query and hash kept) | `outside-tree` |
| 8 | login area `/institutional/tw/en/(login\|register\|registration\|dashboard/**\|secured/**)` | absolute live URL | `login-area` |
| 9 | `/viewpoints/tag/<tag>` | `/institutional/tw/en/viewpoints/all?tag=<tag>` | `viewpoints-tag` |
| 10 | `/viewpoints/assetManager/<m>` | `/institutional/tw/en/viewpoints/all?assetManager=<m>` | `viewpoints-asset-manager` |
| 11 | `/about-us/press-releases/category/<c>[/page/<n>]` | `/institutional/tw/en/about-us/press-releases?category=<c>[&page=<n>]` | `press-category` |
| 12 | `/viewpoints/<category>/page/<n>` (category = a viewpoints page in pages.csv) | `/institutional/tw/en/viewpoints/<category>?page=<n>` | `viewpoints-paging` |
| 13 | `/sustainable-investing-case-studies?<...>case-studies/themes/<x>` (AEM tag id in the query) | `/institutional/tw/en/sustainable-investing-case-studies?theme=<x>`; `.../topics/<x>` gives `?topic=<x>` | `case-study-theme`, `case-study-topic` |
| 14 | page in pages.csv (absolute `https://www.manulifeim.com/institutional/tw/en/...`, root-relative, AEM-internal; trailing slash and `.html` ignored; exact match first, then case-insensitive) | its `eds_path`, query string and `#fragment` kept | `page` |
| 15 | `/viewpoints/<slug>`: one segment under `/viewpoints` that is not a category page in pages.csv (author "Read bio" pages) | `/institutional/tw/en/viewpoints/all?author=<slug>` (slug kept as live, e.g. `Dylan-Ngai-CFA`) | `viewpoints-author` |
| 16 | anything else under `/institutional/tw/en` that is not in pages.csv (404 rows, unsitemapped pages) | absolute live URL | `not-in-scope` |

Query parameter values are URI-encoded. `/viewpoints/all` and the category pages are real pages, so
`?tag=`, `?assetManager=`, `?author=`, `?category=`, `?page=`, `?theme=`, `?topic=` are read by the
listing blocks on EDS.

## Special links

- Video teasers (`a[data-videomodal]` with `href="#"`, Brightcove) become
  `https://players.brightcove.net/<data-brightcoveid>/<data-playerid>_default/index.html?videoId=<data-videomodal>`
  (rule 3 then keeps them).
- Embedded iframes (`.iframe-wrapper[data-desktop-url]`, Spotify) become a paragraph with a link to
  the embed URL.
- `href="#"` placeholders on live (e.g. a "Read more from our Multi-Asset Solutions Team" title link)
  stay `#`.

## Images

`img` sources are never mapped to EDS paths: the src is the absolute
`https://www.manulifeim.com/...` URL of the best rendition found in the snapshot (`src`, else
`data-src` / `data-lazy-src` / the last `srcset` candidate; `data:` placeholders are skipped; spaces
are percent-encoded). `run-bulk-import --html-dir tools/importer/snapshots` replaces them with the
local `/media-da/...` copies through the snapshot sidecar maps (`<page>.images.json`). The `Image`
metadata (og:image) follows the same rule.

## Metadata values with links

- `Canonical` is written only when the live `link[rel=canonical]` is not the page itself (absolute
  live value kept as is, e.g. a syndicated article on another Manulife site).
- `Author Details` carries the bio slug (`/viewpoints/<slug>` of the "Read bio" link), not a URL.

## Report

Every link that still points at `www.manulifeim.com` after the rewrite (rules 5-8, 16) is written
to the import report: `unmigrated-link-count` and `unmigrated-links` (JSON array of unique URLs) per
page, so a links-unmigrated report can be built from `tools/importer/reports/*.report.json`.
