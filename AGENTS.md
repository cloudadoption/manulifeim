# AGENTS.md

Edge Delivery Services. Read a block first. Omissions are in the repo or known.

## Avoid
- `scripts/aem.js` is vendored. Never edit.
- Markup comes from the backend. `curl localhost:3000/x.plain.html` first.
- `buildAutoBlocks` rewrites content before your block runs.
- Authors omit and add cells. Decorate defensively.
- No build step; devDependencies only.
- Scope CSS to `.blockname`; `-wrapper`/`-container` are section classes.
- `fragment/fragment.js` is the only cross-block import. Otherwise use `/scripts/`.

## Outdated
- `fstab.yaml`, `helix-query.yaml`, `paths.json` are retired. Config lives at tools.aem.live.

## Remember
- `npx -y @adobe/aem-cli up`: local code, previewed content.
- `npm test`: `test/` and `tools/importer/test/` (node:test + jsdom, fixtures in `tools/importer/test/fixtures/`, no browser, no snapshots). Must pass on a fresh clone.
- Merging `main` ships code; content publishes separately.
- A PR without a `{branch}--manulifeim--cloudadoption.aem.page/{path}` link is rejected.
- All committed files are served. Use `.hlxignore`.
- Skills: `/plugin marketplace add adobe/skills`, then `aem-edge-delivery-services` (24 skills, incl. `docs-search`).

## Manulife replica: styles
- Tokens: `styles/styles.css` `:root` (`--color-*`, `--shadow-*`, `--font-*`, `--font-size-*`, `--line-height-*`, `--spacing-*`, `--width-*`, `--header-height`, `--layout-rail-width`). Source values: `migration-work/analysis/design-tokens.md`. Use tokens, not hex.
- Breakpoints are mobile-first and mirror live max-width 600/800/1100: `(width >= 601px)`, `(width >= 801px)`, `(width >= 1101px)`. Type steps up at 601; section padding and the 80px rail/header start at 801. A few queries copy live component queries and stay: Layout and columns 961/1281 (column-container; 8-4 is 66% only from 1281), tag-list 321/800, article-list 800, browse-by 1001/1501, attestation 901, search 1440, score-bars < 900, hero image position 1100. The showcase notice (768) is the POC disclaimer, left as is.
- Card grids: one grid with 1px gaps, filled by right/bottom box-shadows that the container clips. That keeps live's border spacing without nth-child border rules. The default cards variant is `.cards.teaser`, added by cards.js.
- Fonts: `styles/fonts.css` (Manulife JH Sans 300/400/600/700, JH Serif italic); size-adjusted Arial/Times fallbacks in styles.css. `em` in headings = serif italic.
- Every section wrapper gets the live component padding (32/64, 24/32, 16) via `:where()`, so a block's `.x-wrapper` rule overrides it without `!important`.
- Buttons (decorateButtons): `**link**` = primary green, `_link_` = secondary white, `**_link_**` (`.button.accent`) = link with arrow.
- Section Metadata `Style`: `centered` (75% centred, qw-8), `narrow` (600px column), `divider` (1px #e0e0e0 rule above), `white` (white band), `sidebar` (template right column). `Layout`: `6-6`, `8-4`, `4-8`, `4-4-4`, `3-3-3-3`.
- `Template` metadata → `body.template-<name>`: home, plain, viewpoints, viewpoint (alias article), press-release-root, press-release, case-study-list, case-study-detail (alias case-study), search. Layouts in `styles/templates.css`, loaded only for viewpoint, case-study-detail, press-release, case-study-list.
- Article / case study authoring: section 1 = header (date p, h1, summary p); body sections next; then one section with `Style: sidebar` (author, link-list, case-study-sidebar). Sections after the sidebar span full width.
- Press release: first paragraph = date, h1 = 32px/300 title.
- UI strings (carousel, listing, Read more): `scripts/placeholders.js`, DA sheet `/institutional/tw/en/placeholders` (Key | Text; source `tools/importer/placeholders.json`). English defaults stay in code; a new key needs both.
- Index source: `INDEX_SOURCE` in `scripts/block-utils.js` (`native`; ADR-001 in `docs/DECISIONS.md`). Listings show published pages only; no runtime fallback.

## Manulife replica: live snapshots
- www.manulifeim.com answers 403 to curl; pages are read once in the browser and stored in `tools/importer/snapshots/` (bulk HTML gitignored, local only). `_state.json` = per live path status, `_log.jsonl` = capture log, `_images.json` = image URLs per page.
- Capture loop: `node tools/importer/snapshot/queue.mjs --size N --budget S` → run `capture-pages.fn.txt` in the Playwright MCP browser (`browser_run_code`, `filename: snap-NNN.json`; it reads `_queue.json` from the dev server) → `node tools/importer/snapshot/ingest.mjs /tmp/playwright/snap-NNN.json` → close the browser → `sh tools/importer/after-capture.sh` (import, guards, upload, preview). One page every 30–45 s (`--gap 30-45`), batches of 16 with `--budget 520` (a fresh browser first warms up on the homepage for ~30 s, and `browser_run_code` stops at 600 s), at least 30 min between batches; the run ends on an emptied page to keep the tool output small. Accept the attestation on `/institutional/tw/en` first.
- Images: `images.mjs queue` → `capture-images.fn.txt` → `images.mjs ingest <file>` → `images.mjs sidecars` (maps for `run-bulk-import --html-dir tools/importer/snapshots`).
- Media rules (`snapshot/media.mjs`, aem.live limits): ingest names files by their bytes, turns GIF and SVG > 40 KB into PNG (2x, librsvg; IM6's own SVG renderer breaks charts). `snapshot/fix-media.mjs` applies the same to `content/media-da`, updates `_images.json`, sidecars and pages, logs `reports/media-fixes.json`; then `da-upload.mjs --reupload-fixed`.
- Before upload: `node tools/importer/check-images.mjs` lists pages with `<img>` still on www.manulifeim.com or > 200 distinct images; `da-upload.mjs` skips them (`--allow-live-images` overrides the first).
- `/viewpoints` Authors (~210 photos) live in `fragments/viewpoints-authors-N` (≤ 150 images each), loaded by browse-by on first tab show. Import: `import-viewpoints` `?doc=page|authors-1|authors-2`; split an imported page: `split-browse-by.mjs`.
- Akamai blocked the browser with 403 on 2026-10-26 ~16:14 after ~136 pages (about 210 page loads in 55 min). Do not retry in a loop.
- Bright Data fallback (`bd-capture.mjs`, one warm session per run, stores every page at once) is refused for this domain: Bright Data blocks it under the site's robots.txt for our account (KYC required). `.migration/project.json` has `botProtected: true`, so run-bulk-import imports from the snapshots without probing live.
- Never call run-bulk-import on `tools/importer/snapshots` directly; use `run-captured.mjs` (`--paths` for single pages). Its dismissPopups clicks visible "accept"/"agree" elements, and without CSS the attestation link (`/institutional/kr/en/<path>`) counts as visible. Unguarded, the import browser goes to live and imports the Korea page or homepage. That happened to 39 pages before 2026-10-27. run-captured stages a copy in `snapshots/_import` with a click guard and the overlays hidden. `check-content.mjs` compares every imported title with its snapshot; upload-pending skips the mismatches.
- Authors edit in DA now (Abbasi, from 2026-10-28). `da-upload.mjs` creates a page only when DA answers 404 and the migration has no record of it (`If-None-Match: *`), and replaces one only when DA's `<main>` matches, byte for byte, the SHA-256 baseline of our last verified write and that write's ETag is known (`If-Match: <etag>`). Everything else is held and logged in `reports/da-conflicts.json`, also with `--force`: legacy or failed records, uncertain read-backs, changed content, pages of ours absent from DA, no ETag, non-200/404 answers, network errors, and 412s (never retried). The preconditions rely on da-admin's storage checks (verified in its source at 3267d410, not by a live write probe); this is not an absolute guarantee. Read-only aids: `check-da-edits.mjs`, `diff-da-edits.mjs`. Tests: `tools/importer/test/da-upload.test.mjs` (fake curl, offline).
- `/migration-status/**` (author-guide, tech-guide) are guides the team maintains and publishes: keep them out of sweeps, uploads and checks. `da-upload.mjs` refuses them.
- Analysis notes (local): `migration-work/analysis/{templates,blocks,design-tokens,block-authoring}.md`.
