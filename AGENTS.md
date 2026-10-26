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
- Merging `main` ships code; content publishes separately.
- A PR without a `{branch}--manulifeim--cloudadoption.aem.page/{path}` link is rejected.
- All committed files are served. Use `.hlxignore`.
- Skills: `/plugin marketplace add adobe/skills`, then `aem-edge-delivery-services` (24 skills, incl. `docs-search`).

## Manulife replica: live snapshots
- www.manulifeim.com answers 403 to curl; pages are read once in the browser and stored in `tools/importer/snapshots/` (bulk HTML gitignored, local only). `_state.json` = per live path status, `_log.jsonl` = capture log, `_images.json` = image URLs per page.
- Capture loop: `node tools/importer/snapshot/queue.mjs --size N --budget S` → run `capture-pages.fn.txt` in the Playwright MCP browser (`browser_run_code`, `filename: snap-NNN.json`; it reads `_queue.json` from the dev server) → `node tools/importer/snapshot/ingest.mjs /tmp/playwright/snap-NNN.json`. One page every 5–10 s. Accept the attestation on `/institutional/tw/en` first.
- Images: `images.mjs queue` → `capture-images.fn.txt` → `images.mjs ingest <file>` → `images.mjs sidecars` (maps for `run-bulk-import --html-dir tools/importer/snapshots`).
- Akamai blocked the browser with 403 on 2026-10-26 ~16:14 after ~136 pages (about 210 page loads in 55 min). Do not retry in a loop.
- Bright Data fallback (`bd-capture.mjs`, one warm session per run, stores every page at once) is refused for this domain: Bright Data blocks it under the site's robots.txt for our account (KYC required). `.migration/project.json` has `botProtected: true`, so run-bulk-import imports from the snapshots without probing live.
- Analysis notes (local): `migration-work/analysis/{templates,blocks,design-tokens,block-authoring}.md`.
