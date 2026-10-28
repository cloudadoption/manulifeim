# Query index (tw/en)

Definition: `tools/importer/query.yaml`, the content of the configuration service's
`content/query.yaml` (same format as the retired `helix-query.yaml`). The repo copy is not read
by AEM: the lead applies it to the config service after approval, then re-publishes the tree
(indices build from published pages only).

## Indices (one target each)

Content-bus indices are always delivered as a single sheet, so there is no `?sheet=`: every
"sheet" is its own index and JSON target. `<<: *default` reuses the default properties.

| index | include (under `/institutional/tw/en`) | target | rows (est.) | consumers |
|---|---|---|---|---|
| `default` | everything except nav, footer, fragments, drafts, library, metadata, search | `/institutional/tw/en/query-index.json` | ~1,300 | `search`, `cards` link autofill, `cards (news)` Source, `related-articles`, fallback for every listing |
| `viewpoints` | `/viewpoints/*/*` (articles) | `/institutional/tw/en/query-index-viewpoints.json` | ~694 | `listing (viewpoints)`, `article-list` Source, `tag-list` (counts) |
| `press` | `/about-us/press-releases/*` | `/institutional/tw/en/query-index-press.json` | ~160 | `listing (press)` |
| `case-studies` | `/sustainable-investing-case-studies/*/*` | `/institutional/tw/en/query-index-case-studies.json` | ~62 | `listing (case-studies)` |
| `resources` | `/resources/documents/*`, `/resources/fact-sheets/*` | `/institutional/tw/en/query-index-resources.json` | ~89 | `listing (documents)` |
| `people` | `/authors/*`, `/consultant-team/*` | `/institutional/tw/en/query-index-people.json` | ~6 | `listing (people)`, author header of `listing (viewpoints)` (`?author=`) |

`fetchIndex()` (`scripts/block-utils.js`) pages through `offset` / `limit` (JSON answers at most
1000 rows per request), so the default index works past 1000 pages. Each block reads only its own
index (or its `Source` row); there is no fallback to `default` or to the preview stand-in.
`INDEX_SOURCE` decides native vs stand-in ([docs/DECISIONS.md](../../docs/DECISIONS.md), ADR-001).

## Fields

Metadata names are the importer's (`tools/importer/transformers/metadata.js`); EDS renders a row
`Publication Date | 2026-09-23` as `<meta name="publication-date">`, `Tags` as one
`<meta property="article:tag">` per value, `Title` as `og:title`, `Image` as `og:image`.

| property | source | value | used by |
|---|---|---|---|
| `path` | (automatic) | EDS path | all |
| `title` | `og:title` (`Title`) | text; press releases keep the full live title | all |
| `description` | `meta[name=description]` | text (live listing teaser text = this in 4/8 sampled cases, see caveats) | viewpoints desc, search excerpt |
| `image` | `og:image` (`Image`, else first image, else default-meta-image) | path without host | viewpoint / case-study / people images |
| `template` | `Template` | `viewpoint`, `press-release`, `case-study-detail`, `plain`, ... | type of page (listing base filter, search Page type) |
| `publicationDate` | `Publication Date` | ISO `YYYY-MM-DD` (articles, press releases) | display (formatted as live `September 23, 2026`; search `23/09/2026`) |
| `publicationTimestamp` | `Publication Date` | `parseTimestamp(..., "YYYY-MM-DD")`, unix seconds | sort newest / oldest |
| `lastModified` | `Last-Modified` header | unix seconds | sort fallback (case studies, documents have no date) |
| `authors` | `Authors` | names, comma-joined | (fallback only) |
| `authorDetails` | `Author Details` | JSON `[{name,title,company,photo,slug}]` | teaser authors, `?author=` (slug as live, e.g. `Dylan-Ngai-CFA`, matched case-insensitively), author header |
| `assetManager`, `assetManagerSlug` | `Asset Manager`, `Asset Manager Slug` | text, slug | `?assetManager=`, search facet Asset Manager |
| `category`, `categorySlug` | `Category`, `Category Slug` | articles: `Fixed income` / `fixed-income`; press: `press-releases` or `archive` | category pages (`Filter category=`), `?category=` (press), search facet Category |
| `tags` | `Tags` (`article:tag`) | JSON array string (`values`) | teaser pills, `tag-list` counts, search facet Viewpoint Tags, `?tag=` heading |
| `tagSlugs` | `Tag Slugs` | comma list, same order as `tags`; articles: `asia`; case studies: AEM tag ids `themes/timber`, `topics/environmental` | `?tag=`, case-study `?theme=` / `?topic=` and filter tabs |
| `theme` | `Theme` | case studies: path segment (`environmental`, `social`, `governance`, `other`) | `?theme=` / `?topic=` fallback (sidebar text tags) |
| `topic` | `Topic` | case studies: topic slugs from the tag ids; resources: (none yet) | `?topic=` |
| `assetClass` | `Asset Class` | strategies: path segment | (search / future strategy listing) |
| `robots` | `Robots` (bulk metadata `noindex`) | text | kept so sitemaps can drop noindex pages |
| `audience` (resources) | `Audience` | (none yet) | documents Audiences select |
| `documentUrl` (resources) | first `main a[href*="/content/dam/"]` | absolute live DAM URL (link rule `dam-document`) | documents "View document" |
| `position` (people) | `main .team h4 + p` | text | people cards |
| `bio` (people) | `main .team h4 + p + p` | first bio paragraph, max 120 words | author header bio on `?author=` |

Importer change made for the index: case studies now also get `Tag Slugs` (AEM tag ids from the
sidebar pill hrefs) and `Topic`.

## Block <-> query parameters

| block | URL parameters |
|---|---|
| `listing (viewpoints)` | `?tag=`, `?assetManager=`, `?author=`, `?category=`, `?page=` (10 per page) |
| `listing (press)` | `?category=` (default `press-releases`, as the live root), `?page=` (10 per page) |
| `listing (case-studies)` | `?theme=`, `?topic=`, `?region=`, `?assetClass=` (comma lists), `?sort=oldest` (9 per batch, more on scroll) |
| `listing (documents)` | `?q=`, `?type=` (`documents`, `fact-sheets`), `?topic=`, `?audience=`, `?page=` |
| `search` | `?q=`, `?sort=` (`relevance`, `date`, `az`, `za`), `?page=`, `?size=` (10/25/50/100), `?f-type=`, `?f-author=`, `?f-category=`, `?f-assetmgr=`, `?f-tags=` |

## Fake index (testing without the config service)

`node tools/importer/build-fake-index.mjs` runs the real import on every snapshot
(`dry-run.mjs --all --da`), renders head metadata the way EDS does, evaluates `query.yaml`
(selectors and value functions) and writes one JSON per target to `migration-work/fake-index/`
(local only: `migration-work` is git-excluded). Use it to compare with the real index later.
`--da-dir DIR` reuses an earlier dry-run output. Differences to the real index: images keep the
live host, `lastModified` is the capture time, only captured pages are in it (175 rows: 153
viewpoints, 1 press release, 1 case study, 1 resource, 1 person).

Tests: `node --test tools/importer/test/listing.test.mjs` (filtering, sorting, paging, search
scoring and facets in `scripts/listing-core.js`, plus the `listing` and `search` blocks in jsdom
against the fake index and synthetic press / case-study / resource / people rows).

## Caveats

- Live list teasers use teaser fields that are not on the detail page: the viewpoint list image
  equals `og:image` in 6/8 sampled cases and the list description equals the meta description in
  4/8 (the article summary in 2/8). The index uses `og:image` / `description`.
- Case studies have no publication date in the DOM, so "Newest" sorts by `lastModified` until a
  `Publication Date` is authored; the live order (from `casestudy-search.json`) cannot be
  reproduced. The live listing cards use a card image that differs from `og:image`.
- Resources: the live `/resources` app shows "All Types (0)" (empty); the documents listing
  lists the 89 resource pages. Topics / audiences have no data in the DOM.
- Robots: every page is `noindex` on live and in the bulk metadata; the indices still include
  them (only sitemaps drop noindex pages).
- YAML merge keys (`<<: *default`) are used as in helix-query.yaml; if the config service rejects
  them, copy the default `include`/`exclude`/`properties` into each index.
