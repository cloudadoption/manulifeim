# Manulife Investment Management (Taiwan, English) on Edge Delivery Services

A 1:1 replica of https://www.manulifeim.com/institutional/tw/en on Adobe Edge Delivery Services, authored in
Document Authoring (DA, `cloudadoption/manulifeim`). Pages keep their live URL paths (`/institutional/tw/en/...`);
there is no redesign.

## Environments

- Preview: https://main--manulifeim--cloudadoption.aem.page/institutional/tw/en
- Live: https://main--manulifeim--cloudadoption.aem.live/institutional/tw/en
- Branch preview: `https://{branch}--manulifeim--cloudadoption.aem.page/{path}` (required in every PR)
- Content: https://da.live/#/cloudadoption/manulifeim

Code ships when `main` is merged. Content is previewed and published separately in DA; the migration only previews.

## Scope

- [`tools/migration-scope/pages.csv`](tools/migration-scope/pages.csv): 1,216 pages, built from the live sitemap
  (1,818 URLs) after the exclusions in [its README](tools/migration-scope/README.md). One row per page with its live
  path, EDS path, template group and live status.
- Live answers 403 to scripts, so every page is read once in a browser and stored as a local snapshot
  (`tools/importer/snapshots/`, not in git). Capture is slow on purpose (one page every 30 to 45 s) and stops at the
  first 403. On 2026-10-28: 577 pages captured; 568 documents (561 pages plus nav, footer and
  fragments) uploaded to DA and previewed; the rest are still to be captured.
  Current counts are in the migration workspace only (`tools/importer/snapshots/_state.json`,
  `tools/importer/reports/da-upload.json`; both git-ignored).

### Not migrated

- Out of scope by design (see the scope README): `hidden/**` profiles, test pages, the login area (sign-in and register
  link to live), other countries, languages and the retail site (links stay absolute to www.manulifeim.com).
- Form submission: the form block validates and shows the live thank-you text, but sends nothing (live uses Marketo).
- Search: live uses Coveo; here `search` runs on the EDS query index
  ([`tools/importer/QUERY-INDEX.md`](tools/importer/QUERY-INDEX.md)). The indices only fill from published pages.
- Links to pages not yet captured point to their EDS path and work once the page is imported; link rules are in
  [`tools/importer/LINKS.md`](tools/importer/LINKS.md).

## Authoring

Blocks, section styles (`Style`, `Layout`), templates and article layouts are described in [`AGENTS.md`](AGENTS.md).
Pages open in DA Canvas (quick edit, `?quick-edit=on`):

- With `quick-edit` set, the page loads without the attestation prompt, blur, showcase notice, region selector or
  carousel timer; carousel slides stack so each one can be edited.
- Blocks add classes to the authored rows and cells and move them, instead of rebuilding them, so every authored node
  stays editable.
- Settings rows (`Source`, `Limit`, `Speed`, ...) are hidden on pages and shown under quick edit.
- Plan and status of the authoring remediation: [`docs/authoring-remediation.md`](docs/authoring-remediation.md).

## Development

```sh
npm ci
npx -y @adobe/aem-cli up   # local code with previewed content at http://localhost:3000
npm run lint
npm test                   # browser-free tests (node:test, jsdom), runs on a fresh clone
```

No build step: blocks are plain JS and CSS under `blocks/`, shared code under `scripts/`, tokens in
`styles/styles.css`. `scripts/aem.js` is vendored and not edited.

## Import

The importer (`tools/importer/`) turns snapshots into DA documents: `run-captured.mjs` imports, `check-images.mjs` and
`check-content.mjs` guard, `da-upload.mjs` uploads and previews. The capture and upload loop is in
[`AGENTS.md`](AGENTS.md#manulife-replica-live-snapshots). Parity against live:
[`tools/reports/parity-report.md`](tools/reports/parity-report.md).
