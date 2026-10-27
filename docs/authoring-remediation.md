# Authoring (Canvas) and code-quality remediation plan

Work plan for this repo ("A"), from a code audit that compared it with another migration of the same site ("B", somarc/manulifeim-tw-eds). Work the batches in order; each batch is its own commit(s), released code first, content only where a batch says so.

Checked on 2026-10-27 (read-only, nothing changed in either repo or in DA).

- A = cloudadoption/manulifeim, `main` @ [`adf2aa5`](https://github.com/cloudadoption/manulifeim/commit/adf2aa57e9dee05008649562e023e5d7e0de6f15). This is the same commit the audit scored; `origin/main` had not moved when I checked, so the audit's line numbers still apply.
- B = somarc/manulifeim-tw-eds, `migration` @ [`7f1b2b9`](https://github.com/somarc/manulifeim-tw-eds/commit/7f1b2b9b08052c1589122375905cece97e3bc572).
- DA content: I listed and downloaded all 341 HTML documents under `cloudadoption/manulifeim` from admin.da.live (read-only GETs) and counted block usage. The numbers below ("N instances on M pages") come from that copy.
- Platform code read: adobe/da-universal (serves preview.da.live) @ [`c862db9`](https://github.com/adobe/da-universal/commit/c862db94ea4d769b4fdac846a3570c28385a2c15), adobe/da-nx (quick-edit plugin) @ [`d9069fe`](https://github.com/adobe/da-nx/commit/d9069fe447b066a3ba329bad079f5056d394f6b6), adobe/da-live (Canvas) @ [`6682486`](https://github.com/adobe/da-live/commit/668248690197129e2b0bdd34224ff8b5b05466c1). The quick-edit.js served at da.live is byte-identical to da-nx `origin/main`.

## How Canvas runs A today (why the authoring gate matters)

1. Canvas loads the page in an iframe at `https://main--manulifeim--cloudadoption.preview.da.live/<path>?rum=off&consent=disabled&quick-edit=<on|ref>&controller=parent` ([ew-editor-wysiwyg.js#L74-L83](https://github.com/adobe/da-live/blob/668248690197129e2b0bdd34224ff8b5b05466c1/blocks/canvas/ew-editor-wysiwyg/ew-editor-wysiwyg.js#L74-L83)). The preview is always the `main` branch unless the DA config sets `ew.wysiwygBranch`.
2. preview.da.live (da-universal) appends a bootstrap to the site's `scripts/scripts.js` when a `da-quick-edit` cookie is set, the file has a top-level `loadPage` function, and it does not already contain a literal `import('…quick-edit.js')` ([quick-edit.js#L34-L51](https://github.com/adobe/da-universal/blob/c862db94ea4d769b4fdac846a3570c28385a2c15/src/utils/quick-edit.js#L34-L51), [#L234-L258](https://github.com/adobe/da-universal/blob/c862db94ea4d769b4fdac846a3570c28385a2c15/src/utils/quick-edit.js#L234-L258)). That bootstrap calls `loadQuickEdit(payload, loadPage)` with no `partialReload`. This explains the audit's runtime finding: a plain curl gets the unmodified 9,614-byte file because it has no cookie. B is served unmodified because its scripts.js already contains the literal import.
3. Without `partialReload`, every `SET_BODY` sets `document.body.innerHTML` to the new body and calls `loadPage` again ([reload.js#L148-L158](https://github.com/adobe/da-nx/blob/d9069fe447b066a3ba329bad079f5056d394f6b6/nx/public/plugins/quick-edit/src/reload.js#L148-L158)). Classes on `<body>` and `<html>` survive this, and so do listeners on `document` and `window`.
4. Inline editing needs `data-prose-index` on the authored element. Da-live puts it on `h1–h6, p, ol, ul, pre, blockquote` ([editor-utils.js#L61-L74](https://github.com/adobe/da-live/blob/668248690197129e2b0bdd34224ff8b5b05466c1/blocks/canvas/editor-utils/editor-utils.js#L61-L74)). When the author clicks, the plugin replaces that element with `div.prosemirror-editor[data-prose-index] > div.ProseMirror > <fresh p/h>` built from the document schema ([prose.js#L199-L229](https://github.com/adobe/da-nx/blob/d9069fe447b066a3ba329bad079f5056d394f6b6/nx/public/plugins/quick-edit/src/prose.js#L199-L229)). Two consequences for block code:
   - An element that decoration rebuilt (new element, `innerHTML` copy, `textContent` copy, `cloneNode`) has no marker or a duplicate one, so it cannot be edited.
   - A class that decoration put on an authored `p`/`h` is gone while the editor is open, so the styling jumps. Classes belong on the cell (the element that owns the authored nodes), and CSS should select tags inside it, including the editor wrapper layers.
5. DA site config: `admin.da.live/config/cloudadoption/manulifeim` returned 404 at audit time; it now exists (see Decisions). The org config `admin.da.live/config/cloudadoption` exists and has one `quick-edit` row with value `paylocity-demo`; da-live reads that row only for the old `/edit` preview button and only for that repo, so it does not affect manulifeim. B has a site config with `ew.enabled`, `editor.hidePublish=/`, `ew.canvasDefaultView=layout` and `ew.wysiwygBranch` ([DECISIONS.md ADR-002](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/docs/DECISIONS.md#L21-L33)). See Decisions.

Conclusion: quick-edit does matter for A. Canvas already loads A through the platform's fallback, and that fallback re-runs A's full lifecycle (attestation blur, carousel timers, header fetch, global listeners) on every structural edit.

## Side finding that blocks Canvas verification (content, not code)

The DA source of the homepage (`/institutional/tw/en`) references 15 images under `content.da.live/cloudadoption/manulifeim/institutional/tw/.en/…`, and `/nav` references 2 under `/.nav/…`. Both DA folders are empty, and the files return 404 with a valid token. aem.page still shows older media because those pages were previewed before the media move. Re-previewing the homepage or nav now would break their images on aem.page as well. Of the other documents, 225 use `/media-da/…` correctly and 58 have no images, but 55 still reference live `www.manulifeim.com` images (403 on preview and live; they predate the live-image guard and are published). Count from the DA sources on 2026-10-27 13:45 UTC. Fix the two documents' media before using the homepage as the Canvas test page.

## 1. Verdict table: A's POOR findings at adf2aa5

A links: `A/` = `https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/`

| Finding (audit) | Still true? | Evidence in A | Note |
|---|---|---|---|
| Blocks rebuild authored DOM by default | Yes, and wider than listed | [hero.js#L152-L157](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L152-L157), [feature.js#L36-L49](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/feature/feature.js#L36-L49), [cards.js#L46-L56](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/cards/cards.js#L46-L56), [table.js#L67-L73](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/table/table.js#L67-L73), [team.js#L102-L136](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/team/team.js#L102-L136), [disclosure.js#L41-L66](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/disclosure/disclosure.js#L41-L66) | `block.replaceChildren(wrapper)` alone is harmless when the wrapper holds the moved authored nodes. The damage comes from `innerHTML`/`textContent` copies, `cloneNode`, `makeLink` and removing a `p` after moving its link out. Not in the audit list but worse: [link-list.js#L35-L88](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/link-list/link-list.js#L35-L88) rebuilds every heading, subtitle and link from text (400 instances on 201 pages), [author.js#L14-L36](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/author/author.js#L14-L36) re-parses `innerHTML` (190 pages), [tag-list.js#L33-L63](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/tag-list/tag-list.js#L33-L63) (206 pages). |
| `listing` is one 769-line block, 5 modes, 8 `no-use-before-define` disables | Yes | [listing.js#L411-L769](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L411-L769) | DA use: 12 instances (9 viewpoints, 1 press, 1 documents, 1 case-studies, 0 people). Config rows are consumed and removed ([#L77-L91](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L77-L91), [#L426-L433](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L426-L433)), so they cannot be edited in Canvas. |
| `title` drops every paragraph except heading and one link | True in code, no current content affected | [title.js#L11-L49](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/title/title.js#L11-L49) | 58 instances on 26 pages: 32 heading only, 24 heading + link, 2 heading + `p>a`. None loses text today. Every instance is alone in its section; 21 of those sections carry Section Metadata (mostly `Nav Title`, some `Style: divider`). The link is rebuilt (`makeLink` pattern), so it is not editable in Canvas. |
| Dead widget block + widget auto-block scan | Yes | [scripts.js#L131-L149](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L131-L149), [blocks/widget/](https://github.com/cloudadoption/manulifeim/tree/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/widget) | 0 DA documents contain a widget block or a `/widgets/` link. |
| Tokens bypassed (literal font sizes, letter-spacing, 260 fallbacks, ~25 unused tokens) | Yes | e.g. [title.css#L13-L20](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/title/title.css#L13-L20) | My counts: 120 literal `font-size` vs 87 `var()` in blocks; 79 literal `letter-spacing`; 260 `var(--x, #hex)` fallbacks, all 18 referenced tokens are defined in `:root`, so the fallbacks never apply; 24 of 86 tokens unused (all `--heading-font-size-*`, `--spacing-*`, `--text-color`, `--link-color`, `--background-color` …). The literals map to existing tokens: 16px ×27, 14px ×27, 24px ×20, 12px ×19, 32px ×11. |
| Cards default style by negation, nth-child physical borders | Yes | [cards.css](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/cards/cards.css) (28 `:not(.tiles…)`/`:not(.separate)` selectors) | Default cards (no variant, `two`, `four`) = 46 instances. `separate` has 0 DA instances. |
| File-wide `no-descending-specificity` disables | Yes | templates.css, promo, hero, cards, feature, section-nav, team (7 with no reason); listing and search give a reason | |
| Arrow link re-implemented in 8 blocks | Yes | `makeLink`/`iconLink` copies in cards, feature, promo, title, link-list, author; arrow `::before` in 12 block CSS files | Fix by one global `link-cta` (see batch 2). |
| Column layout in both columns.css and styles.css | Not found | styles.css has no `.columns` or `columns-fw-` rules | Drop this item. |
| Off-contract breakpoints (>=800, >=1100, 901/961/1001/1281/1440/1501) | Yes [F] | 17 of 73 `@media` queries are off the 601/801/1101 contract | |
| Attestation blur + `showModal()` covers Canvas | Yes | [scripts.js#L237-L255](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L237-L255), [styles.css#L215-L221](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/styles/styles.css#L215-L221), scroll lock in [attestation.js#L150](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/attestation/attestation.js#L150) | `body.attestation-blur` survives the body swap (point 3 above). |
| CTA, author lines, link lists, captions, titles rebuilt, no editor opens | Yes | [cards.js#L76-L79](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/cards/cards.js#L76-L79), [#L225](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/cards/cards.js#L225), [hero.js#L56-L68](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L56-L68), [feature.js#L40-L47](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/feature/feature.js#L40-L47), [promo.js#L52-L60](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/promo/promo.js#L52-L60), [title.js#L19-L48](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/title/title.js#L19-L48), [link-list.js#L64-L86](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/link-list/link-list.js#L64-L86), [figure.js#L56-L62](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/figure/figure.js#L56-L62), [team.js#L104-L124](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/team/team.js#L104-L124) | Also the disclosure label is rebuilt from `textContent` ([disclosure.js#L48](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/disclosure/disclosure.js#L48)), 279 instances on 265 pages. |
| Carousel slide H1 rebuilt as H2 via `innerHTML`; eyebrow merged into heading | Code yes, content never triggers the H1 case | [hero.js#L152-L157](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L152-L157), [#L83-L91](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L83-L91) | All 11 `hero (carousel)` instances already author slide 1 as h1 and the others as h2, so the conversion branch is dead code and can go without content change. 1 banner uses the `<sup>` eyebrow. |
| Desktop `<picture>` cloned for mobile, duplicate `data-image-index` | Yes, on every banner | [hero.js#L287-L295](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L287-L295), [feature.js#L119-L127](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/feature/feature.js#L119-L127) | All 20 `hero banner` and the 1 `feature banner` instances have exactly one picture, so the clone runs every time. The clone shows the same image with other CSS; it adds nothing a media query could not do. |
| Carousel autoplays in Canvas | Yes | [hero.js#L218-L278](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L218-L278) | 11 pages. |
| No null guard in `loadHeader`/`loadFooter` calls; global listeners re-added per full reload | Yes | [scripts.js#L271-L285](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L271-L285); listeners: [header.js#L449-L460](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/header/header.js#L449-L460), [section-nav.js#L114](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/section-nav/section-nav.js#L114), [#L189](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/section-nav/section-nav.js#L189), [browse-by.js#L200](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/browse-by/browse-by.js#L200), [listing.js#L367-L371](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L367-L371) | The audit missed header.js (document click + window keydown, re-added each reload). listing's handler removes itself on the next click once detached; the others never do. `loadPage` is not exported. |
| Index fallback chain, up to 4 requests | Yes | [block-utils.js#L230-L243](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/block-utils.js#L230-L243), [listing.js#L400-L409](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L400-L409) | |
| UI strings hard-coded, no placeholders sheet | Yes | No `placeholders` document in DA | |
| All carousel images eager; no banner space reserved | Yes [F] | [hero.js#L134-L140](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L134-L140); header banner in [header.js#L383-L400](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/header/header.js#L383-L400), only `header{min-height}` reserved | |
| Invalid ARIA | Yes | listing: `li` between `role=listbox` and `role=option` ([listing.js#L333-L353](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L333-L353)), `role=tab` with no tabpanel ([#L694-L710](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L694-L710)); section-nav: `aria-haspopup=listbox` over a list of links and `aria-selected` on `<a>` ([section-nav.js#L72](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/section-nav/section-nav.js#L72), [#L128](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/section-nav/section-nav.js#L128)); carousel `aria-live=polite` while autoplaying and `div role=button` pills ([hero.js#L120](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L120), [#L195-L201](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L195-L201)); no `inert` anywhere in header.js | |
| No global reduced-motion, smooth scroll always on, no forced-colors | Yes | [styles.css#L176-L178](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/styles/styles.css#L176-L178); reduced-motion only in attestation, hero, header CSS; 0 `forced-colors` | `outline:none/0` in browse-by (5), section-nav, disclosure, hero, attestation, header: check each has a `:focus-visible` replacement. |
| README is boilerplate | Yes | [README.md#L1-L2](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/README.md#L1-L2) | `package.json` still says `@adobe/aem-boilerplate`. |
| Test not portable | Yes, two reasons | [listing.test.mjs#L18-L31](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/tools/importer/test/listing.test.mjs#L18-L31) | jsdom from `/home/node/.excat-marketplaces/…`, and data from `migration-work/fake-index` and `tools/importer/snapshots/`, which are not in Git. |
| Also found: `templates.css` awaited before the first section | New | [scripts.js#L243-L251](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L243-L251) | Same kind of problem as B's article template, smaller (CSS only, 4 templates). Low priority. |

### B's EXCEPTIONAL/CLEVER claims, checked in code

B links: `https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/`

| Claim | Holds? | Evidence in B |
|---|---|---|
| Authoring contract: `html[quick-edit]`, own loader, exported `loadPage`, null guards | Yes, with two flaws (below) | [scripts.js#L45-L48](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L45-L48), [#L225-L243](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L225-L243), [#L249-L282](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L249-L282) |
| Classify in place (hero, carousel, cards, columns, feature-band, promo-banner) | Yes | [hero.js#L18-L39](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/hero/hero.js#L18-L39), [carousel.js#L22-L33](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.js#L22-L33), [cards.js#L25-L43](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/cards/cards.js#L25-L43), [columns.js#L22-L43](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/columns/columns.js#L22-L43), [feature-band.js#L16-L29](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/feature-band/feature-band.js#L16-L29). Cards does move cells into new `li`s, which keeps their markers. `decorateButtons` still puts classes on authored `p`/`a` ([scripts.js#L130-L149](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L130-L149)), so B is not 100% pure there. |
| CSS sizes the editor wrapper layers | Yes, 9 places | [hero.css#L26-L45](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/hero/hero.css#L26-L45), [carousel.css#L58-L74](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.css#L58-L74), [columns.css#L16-L26](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/columns/columns.css#L16-L26) |
| Authoring gates (static carousel, details, video, disclaimer, config rows visible) | Yes, 20 call sites | e.g. [carousel.js#L56-L60](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.js#L56-L60), [disclosure.js#L20](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/disclosure/disclosure.js#L20), [video.js#L33](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/video/video.js#L33), [disclaimer.js#L69-L73](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/disclaimer.js#L69-L73), [anchor-nav.js#L60](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/anchor-nav/anchor-nav.js#L60) |
| Carousel follows the APG pattern | Yes | [carousel.js#L124-L217](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.js#L124-L217): `aria-live` off while playing (L128), inactive slides `inert` (L154), pause on hover/focus/touch (L194-L217), paused at start under reduced motion (L63-L66), real `<button>` dots |
| Shared `readRows` config parser, rows stay editable as `[data-config]` | Yes | [discovery.js#L171-L188](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/discovery.js#L171-L188), Canvas CSS e.g. [article-cards.css#L8-L30](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/article-cards/article-cards.css#L8-L30) |
| Site alert height reserved before first paint | Yes | [scripts.js#L188-L193](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L188-L193), [styles.css#L134-L141](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L134-L141) |
| Token layers, 0 unused; logical properties | Yes | 46 tokens, 0 unused; 330 logical vs 3 physical; 9 literal font sizes in blocks ([styles.css#L7-L61](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L7-L61)) |
| Cards grid by `--cards-columns`, rules as clipped box-shadows | Yes | [cards.css#L1-L35](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/cards/cards.css#L1-L35) |
| Global reduced-motion reset | Yes | [styles.css#L503-L511](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L503-L511). forced-colors only in carousel ([carousel.css#L264-L268](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.css#L264-L268)) |

Flaws in B's loader not to copy:
- It turns authoring on only for `quick-edit=on|true` ([scripts.js#L268](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L268)). Canvas passes whatever `quick-edit` value da.live was opened with, and the plugin itself only checks `has('quick-edit')` ([quick-edit-init.js#L17-L19](https://github.com/adobe/da-nx/blob/d9069fe447b066a3ba329bad079f5056d394f6b6/nx/public/plugins/quick-edit/quick-edit-init.js#L17-L19)). Use `has`.
- `main.dataset.decorated` guard ([scripts.js#L157](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L157)) is harmless with full-body reloads but would leave pages undecorated with `partialReload`. Don't add it.

## 2. Work list in releasable batches

Rules for every batch (EMA's standing line applies): code only unless stated; lint passes; no DA content change unless the batch says so; rollback = `git revert` of the batch commit. Verification has two steps:

- Before merge, on the branch preview: open `https://<branch>--manulifeim--cloudadoption.aem.page/<path>?quick-edit=on&controller=parent` as a top-level page. The plugin waits for an INIT from a parent that never comes, so nothing is editable, but the page decorates in authoring mode. Use it to check that there is no blur, no modal, a static carousel, and no console errors. Also compare the same path without the query against current `main` (visual diff) for the published look.
- After merge, in Canvas (preview is `main`): `https://da.live/canvas#/cloudadoption/manulifeim/<path>`. If Canvas does not open for the user, `?ew=true` on da.live opts the user in (da-nx CHANGELOG 2026-08-14). In the iframe console run:
  ```js
  // every authored text node of the block is editable
  document.querySelectorAll('main .<block> [data-prose-index]').length
  // no duplicated image markers
  const ix = [...document.querySelectorAll('main [data-image-index]')].map((e) => e.dataset.imageIndex);
  ix.length === new Set(ix).size
  ```
  Then click into a heading, a paragraph and a CTA of each changed block, type one character, undo, and check the layout does not jump.

Test pages (single-picture banners, carousel, link lists, disclosures, authors): `/institutional/tw/en` (fix its media first, see side finding), `/institutional/tw/en/about-us`, a viewpoint such as `/institutional/tw/en/viewpoints/alternative-credit/opportunities-in-asset-backed-securities`, `/institutional/tw/en/viewpoints/all`.

### Batch 1: authoring gate and loader (scripts only, no block restructure)

Goal: Canvas shows the page unblurred, without modals or timers, A loads quick-edit itself, and the lifecycle survives repeated full reloads.

Files in A: new `scripts/authoring.js`, `scripts/scripts.js`, `blocks/attestation/attestation.js`, `scripts/showcase-notice.js`, `blocks/hero/hero.js` + `hero.css` (carousel path only), `blocks/header/header.js`, `blocks/section-nav/section-nav.js`, `blocks/browse-by/browse-by.js`, `blocks/listing/listing.js`.

B pattern ([scripts.js#L45-L48](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L45-L48), [#L225-L282](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L225-L282)):
```js
export function isAuthoring() {
  return document.documentElement.hasAttribute('quick-edit');
}
// loadLazy
const header = doc.querySelector('body > header');
const footer = doc.querySelector('body > footer');
await Promise.all([loadSections(main), header && loadHeader(header)]);
if (footer) await loadFooter(footer);
// loadDelayed
if (!isAuthoring()) import('./disclaimer.js').then(({ default: gate }) => gate());
// bottom
export async function loadPage(doc = document) { await loadEager(doc); await loadLazy(doc); loadDelayed(); }
if (['on', 'true'].includes(params.get('quick-edit'))) {
  document.documentElement.setAttribute('quick-edit', 'true');
  const { default: loadQuickEdit } = await import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js');
  await loadQuickEdit(undefined, loadPage);
}
loadPage();
```

Changes in A:
1. `scripts/authoring.js` (no imports, so blocks can import it without new `import/no-cycle` disables):
   ```js
   if (new URLSearchParams(window.location.search).has('quick-edit')) {
     document.documentElement.setAttribute('quick-edit', '');
   }
   export default function isAuthoring() {
     return document.documentElement.hasAttribute('quick-edit');
   }
   ```
   Import it first in `scripts.js` so the attribute is set before any decoration.
2. `loadEager` ([scripts.js#L237-L265](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L237-L265)): `const attestationPending = !isAuthoring() && !isAttestationAccepted();`, and remove `attestation-blur` from `document.body` when authoring (the class survives body swaps). Also skip the prompt on `/nav`, `/footer` and `/fragments/` paths as B does ([disclaimer.js#L71-L72](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/disclaimer.js#L71-L72)).
3. `loadLazy` ([#L271-L285](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L271-L285)): null-guard header and footer as above, and await them so `loadPage` resolves only when the page is done.
4. `loadDelayed` ([#L291-L298](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L291-L298)): no showcase notice when authoring (it already skips iframes; make it explicit so the aem.page standalone shell is covered too).
5. `openRegionSelector` ([#L94-L98](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L94-L98)): return early when authoring.
6. Export `loadPage(doc = document)`, then at the bottom:
   ```js
   if (isAuthoring()) {
     // literal specifier: preview.da.live then stops appending its own bootstrap
     import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js')
       .then(({ default: loadQuickEdit }) => loadQuickEdit(undefined, loadPage))
       .catch((e) => console.warn('quick-edit unavailable', e));
   }
   loadPage();
   ```
   The specifier must stay a string literal ending in `quick-edit.js`: da-universal's `alreadyImportsQuickEdit` regex keys on it. Non-awaited `.then` avoids top-level await in a module that blocks import from.
7. Listeners that outlive a body swap: keep one `AbortController` in `scripts.js`, abort and renew it at the start of `loadPage`, export `pageSignal()`, and pass `{ signal: pageSignal() }` in [header.js#L449](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/header/header.js#L449), [#L456](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/header/header.js#L456), [section-nav.js#L114](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/section-nav/section-nav.js#L114), [#L189](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/section-nav/section-nav.js#L189), [browse-by.js#L200](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/browse-by/browse-by.js#L200), [listing.js#L371](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L371). In section-nav, also skip scroll-spy and the dropdown when authoring, like B's anchor-nav ([anchor-nav.js#L60](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/anchor-nav/anchor-nav.js#L60)).
8. Hero carousel, minimal gate ([hero.js#L175-L179](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L175-L179)): treat `isAuthoring()` like the single-slide case: add class `static`, no controls, no timer. CSS like B ([carousel.css#L205-L216](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.css#L205-L216)), undoing A's hiding rules ([hero.css#L119-L141](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.css#L119-L141): absolute, `display:none`, `opacity:0`, fixed slider height):
   ```css
   .hero.carousel.static .hero-slider { height: auto; }
   .hero.carousel.static .hero-slides { flex-direction: column; }
   .hero.carousel.static .hero-slide { position: relative; display: block; opacity: 1; animation: none; }
   ```

Acceptance:
- Branch preview with `?quick-edit=on&controller=parent`: no blur, no attestation, no showcase notice, carousel slides stacked, no console errors. Without the query: unchanged (attestation still appears in a fresh profile).
- After merge, in Canvas on a carousel page: no blur; scroll works; add a paragraph in a block (structural edit, triggers SET_BODY) three times, then `getEventListeners(document)` in Chrome devtools shows one click listener per block, not three; no `loadHeader` null error.
- `curl -s https://main--manulifeim--cloudadoption.aem.page/scripts/scripts.js | grep -c "quick-edit.js"` returns 1.

Content risk: none, DA unchanged. Published-page risk: low (gates are off without the query parameter).

Optional later: `partialReload`. The platform's own `quick-edit-init.js` shows the reload callback for it ([quick-edit-init.js#L39-L95](https://github.com/adobe/da-nx/blob/d9069fe447b066a3ba329bad079f5056d394f6b6/nx/public/plugins/quick-edit/quick-edit-init.js#L39-L95)): it decorates only the replaced block or section in a detached `<main>`. That needs `decorateMain` and every block to be safe on detached DOM. Do it only after batch 2, and only if full reloads feel slow.

### Batch 2: classify in place (one PR per group, highest page reach first)

Goal: every authored `h`, `p`, `ul/ol` and `picture` stays the same node with its markers; JS adds classes to block, rows and cells only; CSS selects tags inside classified cells and sizes the editor wrapper layers.

Shared parts, in the first PR of this batch:
- One link style for "plain link alone in a paragraph" in `decorateButtons` ([scripts.js#L185-L218](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L185-L218)), as B does ([scripts.js#L130-L149](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L130-L149), CSS [styles.css#L278-L301](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L278-L301)):
  ```js
  } else {
    p.classList.add('link-cta-wrapper');
    a.classList.add('link-cta');
  }
  ```
  ```css
  a.link-cta::before {
    content: '';
    flex: 0 0 var(--icon-link-size);
    background-color: currentcolor;
    mask: url('../icons/arrow-right-circle.svg') center / contain no-repeat;
  }
  ```
  Block CSS then styles `.<block> a.link-cta`. Delete `makeLink` (cards), `decorateLinks` (feature, hero), the promo/title/link-list/author copies. Keep A's existing URL-display-link skip and the strong+em `accent` rule.
- Editor wrapper CSS, the B rule ([hero.css#L35-L40](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/hero/hero.css#L35-L40)), for every media cell:
  ```css
  .hero .hero-media :is(p, .prosemirror-editor, .ProseMirror, picture),
  .hero .hero-media img { width: 100%; height: 100%; margin: 0; }
  ```
  Single-paragraph cells render without `<p>` on aem.page, so CSS must work with and without the `p` layer; `:is(…)` covers both.
- Media cell test (copy, B has it in 7 blocks; put it once in `scripts/block-utils.js`):
  ```js
  export const isMediaCell = (cell) => !!cell.querySelector('picture, img') && cell.textContent.trim() === '';
  ```

Group 2a: hero (61 pages: 25+6 page-header, 20 banner, 11 carousel) + feature (23 pages)
- B reference: [hero.js#L18-L39](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/hero/hero.js#L18-L39), [carousel.js#L22-L60](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.js#L22-L60), [feature-band.js#L16-L29](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/feature-band/feature-band.js#L16-L29):
  ```js
  cells.forEach((cell) => {
    if (isMediaCell(cell)) {
      mediaCount += 1;
      cell.classList.add('hero-media', mediaCount === 1 ? 'hero-media-primary' : 'hero-media-mobile');
    } else if (cell.textContent.trim() || cell.querySelector('picture, img')) {
      cell.classList.add('hero-content');
    }
  });
  ```
- A hero banner and page-header ([hero.js#L282-L344](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L282-L344)): replace `collectCells` + new wrappers with cell classes. Delete the clone at L291: one picture serves both breakpoints, mobile crop by `object-position` in a media query; a second authored picture becomes `hero-media-mobile` (B: `.hero.has-mobile-media`). Eyebrow: leave the `<p><sup>` paragraph alone and style it with `.hero .hero-content > :is(p, .prosemirror-editor):first-child:has(sup)`; drop L83-L91. Icon in page-header: class the cell or use `:has()`, don't move the picture to the front.
- A carousel ([hero.js#L101-L278](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L101-L278)): rows become slides in place (`row.classList.add('hero-slide')`, cells `hero-slide-image`/`hero-slide-content`); no `.hero-gradient`/`.hero-content` wrappers (use `::before` on the row for the gradient); delete the h1→h2 branch (content already uses h2 for slides 2+). The `Speed` row stays in the DOM with `data-config="speed"` (B `readRows` pattern), hidden on published pages, shown in Canvas. Controls are appended after the rows only when not authoring. Image loading: first slide eager + `fetchPriority=high`, others lazy (B [carousel.js#L35-L42](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.js#L35-L42)). If lazy slides show grey on fade-in (the reason for L134-L139), set `loading='eager'` on the next slide when the current one becomes active instead of all up front. Port B's APG behaviour in the same PR (see batch 3, item 1).
- A feature ([feature.js#L20-L139](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/feature/feature.js#L20-L139)): same as B feature-band: `feature-content`/`feature-image` on cells, `has-icon` when the first child is a picture-only paragraph, no clone in `banner`, kicker author list stays a `ul` styled by CSS (no `buildAuthorInline`), heading id/aria-labelledby can stay (attributes on the authored node are fine).

Group 2b: link-list (201 pages), disclosure (265), author (190), tag-list (206), figure (71)
- link-list ([link-list.js#L29-L89](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/link-list/link-list.js#L29-L89)): stop collecting text. Class the cells: heading cell `link-list-heading`, text cell `link-list-subtitle`, link cells `link-list-item`; the block becomes a CSS grid/flex of rows. If a `ul` is authored, style it as is. Inline variant: first cell `link-list-title`, second cell holds the links.
- disclosure ([disclosure.js#L41-L66](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/disclosure/disclosure.js#L41-L66)): B pattern ([disclosure.js#L10-L34](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/disclosure/disclosure.js#L10-L34)): class label/body cells; when authoring stop there (no `<details>`); on published pages move the authored label nodes into `<summary>` (`summary.append(...label.childNodes)`) instead of rebuilding from text. Keep the default label for one-cell rows as generated text.
- author ([author.js#L14-L130](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/author/author.js#L14-L130)): DA content is already one `p` per line (name in `strong`, title, company, "Read bio" link). Class the photo and text cells, style `p:first-child strong` as name, and let `decorateButtons`/`link-cta` handle the link. Keep `<br>` splitting only as a published-page fallback, not in authoring.
- tag-list ([tag-list.js#L33-L89](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/tag-list/tag-list.js#L33-L89)): the Title/Base rows become `data-config` rows (visible in Canvas); generated tag links are fine because they are not authored.
- figure ([figure.js#L40-L89](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/figure/figure.js#L40-L89)): keep caption paragraphs as paragraphs inside a cell classed `figure-caption`; don't merge `p.childNodes` into one div with `<br>`.

Group 2c: cards (61 pages), promo (23), team (24), table (12)
- cards ([cards.js#L160-L331](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/cards/cards.js#L160-L331)): B pattern ([cards.js#L25-L43](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/cards/cards.js#L25-L43)): move whole cells into the `li`, class the cells, never merge cells into a new body, never lift a picture out of its `p`:
  ```js
  [...row.children].forEach((cell) => {
    cell.className = isMediaCell(cell) ? 'cards-card-image' : 'cards-card-body';
    li.append(cell);
  });
  ```
  Date, title and text classes go away; CSS uses `.cards-card-body > :is(p, .prosemirror-editor):first-child` for the date and `:is(h2, h3)` for the title. The authors `ul` stays a `ul`. Auto-filled cards (link-only row filled from the index) and news cards from `Source`: when authoring, keep the authored row visible and editable (and skip the fill); on published pages the generated card can replace it as now. `Source`/`Limit` rows: `data-config`.
- promo ([promo.js#L20-L87](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/promo/promo.js#L20-L87)): B promo-banner pattern ([promo-banner.js#L22-L41](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/promo-banner/promo-banner.js#L22-L41)): rows → `promo-item promo-<colour>`, cells → `promo-image`/`promo-content`; no `subtitle` wrapper, links via `link-cta`.
- team ([team.js#L80-L158](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/team/team.js#L80-L158)): do not create `h4` from bold text or copy the title via `innerHTML`; style `p:first-child strong`. The collapse behaviour for long bios: published pages only.
- table ([table.js#L50-L85](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/table/table.js#L50-L85)): the cell contents already move into `td`/`th` (markers kept). Replace the rebuilt `h2.table-title` with the authored heading node moved as is. B uses ARIA roles on divs instead of `<table>`; don't copy that, A's real table is better for screen readers.

Acceptance per group: the two console checks above return non-zero counts on every changed block and no duplicate image markers; click-edit a heading, paragraph and CTA in each block without a layout jump; visual diff of the test pages and 3 more pages per block against current `main` shows no change on published pages (or an intended one, listed in the PR).

Content risk: none, DA unchanged, the authored table shapes stay the same. The risk is visual regression on published pages, because the CSS selectors change with the DOM. Ship each group separately, merge only after visual diff, and keep previews of the changed pages as they are (code changes need no re-preview).

### Batch 3: accessibility

1. Carousel (in group 2a's PR): B's state machine ([carousel.js#L62-L219](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/carousel/carousel.js#L62-L219)): `aria-live` off while playing, `polite` when paused; inactive slides `inert` + `aria-hidden` (replaces A's tabindex loop at [hero.js#L221-L230](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L221-L230)); pills become `<button type="button">` with `aria-current`; pause on hover (mouse only), focus-in and touch; start paused under reduced motion (A already does this, keep it). Timer with `setTimeout` + Web Animations fill, not `animationend`, so it keeps working when the animation is disabled.
   ```js
   block.setAttribute('aria-live', playing ? 'off' : 'polite');
   slide.inert = !active;
   ```
2. listing dropdowns ([listing.js#L321-L374](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L321-L374)): use the disclosure pattern: trigger `button[aria-expanded][aria-controls]`, no `aria-haspopup`, a plain `ul` of `button`s with `aria-pressed` (or `aria-current="true"` on the selected one). Remove `role=listbox`/`role=option`.
3. listing type tabs ([#L694-L718](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/listing/listing.js#L694-L718)): they filter one result list, so they are toggle buttons, not tabs: drop `role=tablist/tab/presentation`, use `aria-pressed`, wrap in a `role="group"` with an `aria-label`. Shorten the `aria-label` to the visible text.
4. section-nav dropdown ([section-nav.js#L66-L144](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/section-nav/section-nav.js#L66-L144)): B anchor-nav pattern ([anchor-nav.js#L67-L93](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/anchor-nav/anchor-nav.js#L67-L93)): disclosure toggle with `aria-expanded`, links keep normal tab order, `aria-current="location"` on the active link instead of `aria-selected`; remove `aria-haspopup`.
5. Header mobile menu: make the page behind it inert while open, B [header.js#L364-L372](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/header/header.js#L364-L372). Keep A's hover/keyboard subnav code untouched.
6. Global CSS in `styles/styles.css`:
   ```css
   @media (prefers-reduced-motion: no-preference) {
     html { scroll-behavior: smooth; }
   }
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       transition-duration: 0.01ms !important;
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
     }
   }
   @media (forced-colors: active) {
     .button, button, .link-cta::before { border: 1px solid ButtonText; }
   }
   ```
   (Move `scroll-behavior` out of the base `html` rule at L178.) Add forced-colors rules for icon-only controls (carousel arrows and pills, header buttons) where the icon is a CSS mask, since masks with `currentcolor` vanish when backgrounds are overridden; check each in Windows High Contrast or Chrome's forced-colors emulation.
7. `outline: none` in browse-by, section-nav, disclosure, hero, attestation, header: keep only where a `:focus-visible` style replaces it.

Acceptance: axe DevTools on `/viewpoints/all`, a page with section-nav and the homepage shows no `aria-allowed-role`, `aria-required-children` or `aria-required-parent` violations; keyboard: Tab never lands in a hidden slide; with reduced motion emulated, the carousel starts paused and page scrolling is instant; forced-colors emulation shows every control. Content risk: none.

### Batch 4: CSS hygiene

1. Font sizes and letter-spacing only from tokens. A's scale already has the values ([styles.css#L57-L65](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/styles/styles.css#L57-L65)), but `--font-size-h2` etc. grow at the desktop breakpoint ([#L118-L120](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/styles/styles.css#L118-L120)). A literal `24px` that must stay 24px on desktop needs a fixed token (B style: `--font-size-card-title: 24px` with its own line height, [styles.css#L37-L52](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L37-L52)), not `--font-size-h2`. Do it per block with visual diff at 600/800/1100/1440px. Add `--letter-spacing: -0.02em` (most of the 79 literals) like B.
2. Delete the 260 redundant fallbacks: `sed -E 's/var\((--[a-z0-9-]+), *#[0-9a-fA-F]{3,8}\)/var(\1)/g'` over `blocks/**/*.css` and `styles/*.css`. Safe: all 18 tokens used this way are defined in `:root`. No visual change expected.
3. Delete the 24 unused tokens (re-run the count after steps 1 and 2; some `--heading-font-size-*` may become the tokens step 1 needs, then keep those and delete the duplicates).
4. Cards positive default: in `cards.js` add `teaser` when the block has none of `tiles`/`news`/`separate`, the same way hero adds `banner` ([hero.js#L353](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/hero/hero.js#L353)); rewrite the 28 `:not(…)` selectors as `.cards.teaser …`. Replace the nth-child border grid with B's grid ([cards.css#L7-L35](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/cards/cards.css#L7-L35)), keeping A's mobile-first breakpoints:
   ```css
   .cards { --cards-columns: 1; }
   @media (width >= 801px) { .cards.three { --cards-columns: 3; } }
   .cards > ul { display: grid; grid-template-columns: repeat(var(--cards-columns), minmax(0, 1fr)); overflow: hidden; }
   .cards .cards-card { box-shadow: 1px 0 0 var(--cards-rule), 0 1px 0 var(--cards-rule); }
   ```
   No DA change: the class is added in JS. `separate` has 0 instances: remove it with its CSS.
5. Logical properties: A is English, left-to-right only, so this is consistency, not a bug fix. Convert mechanically (margin/padding/border/inset/text-align) in the same PRs as steps 1-4 touch a file, not as a separate sweep.
6. Breakpoints: move the 17 off-contract queries to 601/801/1101 where the visual diff allows; document any that must stay.
7. Replace the 7 file-wide `no-descending-specificity` disables with ordered rules or per-line disables that state a reason.

Acceptance: `npm run lint` passes; the counts in the verdict table drop to 0 fallbacks, 0 unused tokens, 0 literal font sizes in blocks (documented exceptions only); visual diff unchanged. Content risk: none.

### Batch 5: structure

1. `title` → section style. Release order, because 58 instances on 26 pages are live:
   - a) Code: add a `title-row` section style to `styles/styles.css`, B pattern ([styles.css#L373-L399](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L373-L399), mobile [#L491-L500](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L491-L500)), written mobile-first, with A's title typography (40px light heading → a token) and the link via `link-cta`. Keep the `title` block in place.
     ```css
     main > .section.title-row > .default-content-wrapper { display: grid; grid-template-columns: 1fr; }
     @media (width >= 601px) {
       main > .section.title-row > .default-content-wrapper { grid-template-columns: 1fr auto; column-gap: 32px; align-items: center; }
       main > .section.title-row > .default-content-wrapper > :first-child + * { grid-column: 2; margin-block: 0; }
     }
     ```
   - b) Content (DA change, 26 pages): in each title section replace the block with its heading (unchanged `h2`) plus, if present, the link as `<p><a></a></p>`, and add `title-row` to the section's `Style` (keep existing `Nav Title`, `Id`, `divider` values in the same Section Metadata; add a Section Metadata table to the 37 sections that have none). Preview only the changed pages; never publish. Rollback: DA version history per page.
   - c) Code: delete `blocks/title/` once no DA document contains `class="title"`.
   Section-nav reads `Nav Title` from Section Metadata, so it keeps working. Verify on a section-nav page (`Nav Title` sections) and on `/institutional/tw/en`.
2. Split `listing` by type without renaming the block (no DA change): `listing.js` becomes a dispatcher that imports `./viewpoints.js`, `./press.js`, `./documents.js`, `./case-studies.js` by variant; shared helpers (`el`, `dropdown`, `buildPagination`) in `listing-ui.js`; data logic stays in `scripts/listing-core.js`. Config rows via a shared `readRows` (item 2 of batch 6) so they stay visible in Canvas. Ask before deleting the `people` mode: 0 DA instances, but people pages may be in the scope CSV.
3. Delete the widget block and `buildWidgetAutoBlocks` ([scripts.js#L127-L149](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L127-L149), L174): 0 uses in DA.
4. Merge the five `el()` helpers into one export in `scripts/block-utils.js`, and remove the overlap between `block-utils.js` and `listing-core.js` (months, date formatting, list splitting).
5. README: replace the boilerplate with scope (339 pages, original URL paths, link to `tools/migration-scope/pages.csv`), what is not migrated, environments, how to run lint and the test, the authoring contract from batch 1, and links to `AGENTS.md`, `tools/importer/QUERY-INDEX.md`, `LINKS.md`. B's README ([README.md#L1-L40](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/README.md#L1-L40)) is the model; don't copy its unverified quality-gate numbers style without measuring. Rename the package in `package.json`.
6. Portable test: add `jsdom` as a devDependency (root or `tools/importer/package.json`), import it by name, and commit a small fixture index under `tools/importer/test/fixtures/` instead of reading `migration-work/` and the git-ignored snapshots. Add `"test": "node --test tools/importer/test/"` to `package.json`.

Acceptance: `npm test` passes on a fresh clone (`git clone`, `npm ci`, `npm test`); listing pages unchanged in visual diff; after 5b, `rg -l 'class="title"'` over the DA sources returns nothing before 5c ships.

### Batch 6: patterns from B's "clever" list

1. Site banner space reservation (CLS): in `loadEager`, `if (sessionStorage.getItem('mim-site-banner-dismissed')) document.documentElement.classList.add('site-alert-dismissed')`, plus B's CSS ([styles.css#L134-L141](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L134-L141)):
   ```css
   html:not(.site-alert-dismissed) body > header { min-height: calc(var(--header-height) + var(--alert-reserve)); }
   html body > header:has(.header[data-block-status='loaded']) { min-height: 0; }
   ```
   A stores a message signature in that key ([header.js#L391](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/header/header.js#L391)), so a changed message reserves nothing for one page view; acceptable. Measure CLS before and after with PSI on mobile.
2. Shared config-row parser: copy `readRows` ([discovery.js#L171-L188](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/discovery.js#L171-L188)) into `scripts/block-utils.js`; use it in hero (Speed), cards (Source, Limit), listing, tag-list, browse-by. CSS: `[data-config] { display: none; }` and `html[quick-edit] [data-config] { display: grid; … }` so authors see and edit them in Canvas.
   ```js
   if (cells.length >= 2 && keys.includes(key)) {
     config[key] = (link && !cell.querySelector('li') ? link.getAttribute('href') : cell.textContent).trim();
     config[`${key}:cell`] = cell;
     row.dataset.config = key;
   } else items.push(row);
   ```
3. Index source as a decision record: A already builds a stand-in index (`preview-index.json`, `tools/importer/build-preview-index.mjs`). Adopt B's ADR-001 shape: one constant decides the source, no runtime chain of native → stand-in → `all` ([block-utils.js#L230-L243](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/block-utils.js#L230-L243)), and a short `docs/DECISIONS.md` entry saying when to flip it. Since pages are now published on aem.live, check whether the native index is populated; if it is, the stand-in can go. Keep A's paging beyond 1,000 rows and the per-path cache.
4. Placeholders sheet for UI strings (carousel labels, listing labels, "Read more"), fetched once with a cached promise as B does ([scripts.js#L50-L60](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L50-L60)); English defaults in code so nothing breaks without the sheet. DA change: one new `placeholders` sheet, previewed (and published if pages are live).
5. Video, if A gets one: B's click-to-load dialog and no binding in authoring ([video.js#L25-L69](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/video/video.js#L25-L69)). A has no video block today; skip unless needed.

## 3. Keep in A (do not regress)

- Original URL paths `/institutional/tw/en/...` (DA tree confirms) and the 1,818-URL scope CSV ([tools/migration-scope/pages.csv](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/tools/migration-scope/pages.csv)). B's ADR-004 moved URLs to the site root; don't follow.
- The snapshot pipeline and media rules (`tools/importer/snapshot/`, `localize-images.mjs`, `check-images.mjs`, `da-upload.mjs`).
- Measured font fallbacks per weight with metric overrides ([styles.css#L139-L173](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/styles/styles.css#L139-L173)). B's single 92% size-adjust is worse.
- Header keyboard support: subnav on hover only under `(hover:hover)`, toggle button with `aria-expanded`, `:focus-within`, ArrowDown/Escape ([header.css#L803-L881](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/header/header.css#L803-L881), [header.js#L278-L311](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/header/header.js#L278-L311)). Batch 1 only adds a `signal` to its listeners.
- Zero-specificity section padding via `:where(main > .section > div)` ([styles.css#L601-L614](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/styles/styles.css#L601-L614)).
- Author lists in fragment documents loaded on first tab open ([browse-by.js#L84-L99](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/blocks/browse-by/browse-by.js#L84-L99)); fragments `viewpoints-authors-1/2` exist in DA.
- Blur applied before first paint, modal loaded after the LCP section and not awaited ([scripts.js#L239-L255](https://github.com/cloudadoption/manulifeim/blob/adf2aa57e9dee05008649562e023e5d7e0de6f15/scripts/scripts.js#L239-L255)); batch 1 only adds the authoring condition.
- Mobile-first `min-width` breakpoints, no `!important`, template CSS that touches default content only.
- Pure, DOM-free listing logic in `scripts/listing-core.js`, and index paging beyond 1,000 rows with a cache.
- A real `<table>` in the table block.

## 4. B patterns not to copy

- Desktop-first `max-width` breakpoints (59 `width <=` vs 1 `width >=` in B; overlap at 1100px, e.g. [hero.css#L165](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/hero/hero.css#L165)). Translate every B CSS excerpt to A's mobile-first 601/801/1101 contract.
- Global CSS reaching into block internals ([styles.css#L401-L416](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/styles/styles.css#L401-L416) positions `.article-cards-controls`) and blocks setting spacing on neighbours.
- Awaiting a template's CSS and JS before `decorateMain` ([scripts.js#L205](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/scripts/scripts.js#L205)). A's own `templates.css` await should also move off the LCP path where possible.
- `quick-edit` value check limited to `on|true`, and the `main.dataset.decorated` guard (see section 1).
- `table` as ARIA roles on divs ([table.js#L15-L27](https://github.com/somarc/manulifeim-tw-eds/blob/7f1b2b9b08052c1589122375905cece97e3bc572/blocks/table/table.js#L15-L27)).
- `isMediaCell` copied into 7 blocks; put it in one module.
- `editor.hidePublish=/` from B's DA config: right for B (preview only), wrong for A if pages are published.
- Hard-coded capture path in the importer (`/Users/mhess/...`).

## 5. Decisions (made 2026-10-27)

1. DA site config: created at `admin.da.live/config/cloudadoption/manulifeim` with `ew.enabled=true` and `ew.canvasDefaultView=layout`; publish stays visible. No `ew.wysiwygBranch` yet. Rollback: DELETE that config.
2. Batch 1 ships first and on its own, before any block restructuring.
3. Title migration (batch 5b) is approved: change the 26 DA pages, preview them; publishing to aem.live is done by the steering side, never by the migration agent.
4. `listing people` and `cards separate`: keep until the page capture is complete (people and case-study pages are still in the capture queue); delete then if still unused in DA.
5. Tests: keep the existing listing test and make it portable (batch 5.6). No further test infrastructure for now.

## 6. Uncertainties

- Single-paragraph cells render without `<p>`. I did not check in a browser where `data-prose-index` lands for those cells in Canvas; the batch 2 console check will show it. If the cell itself carries no marker, those values (e.g. a link-only cell) are edited by selecting the block, not inline.
- I did not reproduce the preview.da.live injection myself (it needs the `da-quick-edit` cookie Canvas sets). The mechanism is from da-universal's source; the audit observed the result in a browser.
- The `?ew=true` opt-in is from the da-nx changelog; I did not try it on this site.
- Visual-diff tolerance for batches 2 and 4 is EMA's existing pipeline; I did not check how it handles Canvas-only CSS.
