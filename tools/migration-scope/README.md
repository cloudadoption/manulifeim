# Migration scope: manulifeim.com/institutional/tw/en to cloudadoption/manulifeim

This folder lists the pages to migrate. The migration is 1:1: every page in scope should look and behave like the
live page on https://www.manulifeim.com, without a redesign. The folder is listed in `.hlxignore`, so EDS does not
serve it.

## What is in scope

Only the Taiwan English tree of the institutional site, `https://www.manulifeim.com/institutional/tw/en` (AEM path
`/content/mim-institutional/tw/en`). Other countries and languages, the retail site and other Manulife brands are out;
links to them stay absolute links to www.manulifeim.com.

## pages.csv

One row per page, built from the live sitemap `https://www.manulifeim.com/institutional/tw/en/sitemap.xml`
(read 2026-10-26, 1,818 URLs) after the exclusions below. Columns:

| column | meaning |
|---|---|
| `template_group` | page type, from the path (see the table below); refine it with `route_class` |
| `live_path` | path on www.manulifeim.com |
| `eds_path` | path on EDS. Equal to `live_path` unless the live path breaks EDS rules (uppercase, `_`, `--` in a segment); then lowercase, `_` becomes `-`, repeated `-` collapse, and leading or trailing `-` go. No two rows share an `eds_path`. |
| `live_status` | HTTP status of the live page from a browser on 2026-10-26 (`unchecked` until the check has reached it) |
| `redirect_to` | `Location` of a live redirect, if any |
| `route_class` | the page's AEM template as live reports it in `<body data-route-class>` (`home`, `viewpoint`, `viewpointsCategory`, ...) |
| `robots` | live `<meta name="robots">`; the tw/en pages are `noindex` on live |
| `lastmod` | sitemap lastmod |
| `title` | live `<title>` |

Migrate every row whose `live_status` is 200. For each row where `eds_path` differs from `live_path`, add a row to
the `/redirects` sheet (live path to EDS path) and rewrite internal links to the EDS path.

Some live pages declare a canonical URL on another Manulife site (syndicated articles, e.g. the retail Canada site or
jhinvestments.com). Keep the page in the replica anyway, with the same canonical as live.

| template_group | rows | what it is |
|---|---|---|
| homepage | 1 | `/institutional/tw/en` |
| hub | 10 | capabilities pages, about us, sustainability, contact us, CQS |
| landing | 72 | the other top-level pages: campaigns, reports, outlooks, fund details |
| viewpoints-listing | 10 | `/viewpoints` and its category pages |
| article | 694 | viewpoints articles (route class `viewpoint`) |
| press-release-listing / press-release | 1 / 160 | `/about-us/press-releases` and its releases |
| strategy-listing / strategy / team | 5 / 80 / 8 | `/strategies/**` and the team pages under it |
| case-study-listing / case-study | 5 / 62 | `/sustainable-investing-case-studies/**` |
| resource-listing / resource | 3 / 89 | `/resources/fact-sheets/**`, `/resources/documents/**` |
| people-listing / people | 2 / 6 | `/consultant-team/**`, `/authors/**` |
| legal | 7 | legal terms, privacy, social media terms, important information, accessibility, user agreement, policies |
| search | 1 | `/search` (Coveo Atomic on live; rebuild on the EDS query index) |

## Out of scope

- `hidden/**`: 507 people profiles, the CPS login and register forms, test, template and UX test pages. Profiles that
  articles show (author boxes) are imported as part of the article, not as pages.
- Test and leftover pages: `*/test`, `search-old`, `search_msm_moved`.
- `errors/**`: the 404 page becomes the EDS `404.html`.
- The login area: `login`, `register`, `registration`, `dashboard/**`, `secured/**`. Header sign-in and register links
  go to the live site.
