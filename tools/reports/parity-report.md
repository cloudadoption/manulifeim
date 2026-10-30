# Parity report (EDS local code vs offline live mirror)

local dev server (localhost:3000, local code + preview content) vs offline mirror (localhost:3000/tools/importer/snapshots/mirror), full-page screenshots and computed styles at 1440 and 390 (spot checks at 700/1000).

## 30 October 2026 re-check (branch visual-parity)

Method: a dev server with the branch code and main's preview content (aem up --url main--manulifeim--cloudadoption.aem.page, no local content folder) against the offline mirror of the saved snapshots (/tools/importer/snapshots/mirror, no request to www.manulifeim.com; its only remote load is one OneTrust CSS url on cdn.cookielaw.org). Per page and width: every visible h1-h6 / p / li / a / img / button / th / td / dt / dd in main and the footer, matched by tag + text (box, size, weight, line height, colour, family), plus full-page screenshots; crops in `tools/reports/parity/` (live left, EDS right). Mirrors added for the new page kinds (built offline with snapshot/mirror.mjs). The US-econometer snapshot was captured with the attestation dialog open (page locked and blurred); the comparison unlocks it before measuring.

Not differences: live `li` / `td` / `img` wrappers report 16px/16px black (their text sits in children); carousel buttons in the mirror have no script styling; charts are inline SVG sized by script on live (unsized in the mirror); the header search box is a Coveo web component that only renders on live; author photos are hidden by a script fallback state on live.

| # | Page | 1440 | 390 | Fixed on visual-parity | Open (cause) |
|---|---|---|---|---|---|
| 1 | home | minor | minor | - | latest viewpoints order: 2 viewpoints without Publication Date sort by upload time (data); news title 'Manulife' (data) |
| 2 | about-us | minor | minor | - | hero title offset (accepted, authored &nbsp;); news title 'Manulife' (data) |
| 3 | pension-barometer | mismatch | minor | table cell text 14px/140% | nested layouts flattened; table colour; mobile hero crop (see below) |
| 4 | viewpoints/fixed-income | minor | minor | - | index items (data, as on 27 Oct) |
| 5 | abc-mac (viewpoint) | minor | minor | Share title 24px | spacer paragraphs (accepted) |
| 6 | press-releases | minor | minor | - | index lists 'Test release' and 'One Million Trees ... PRACTICE' (published test pages) and 'Manulife' (page <title>); 4 press releases without date (data) |
| 7 | press release 2020-investment-outlook | minor | minor | - | spacer paragraphs (accepted) |
| 8 | strategies/equity/asia-best-select | minor | minor | panel headings / Key facts (strategy rules) | team bios collapsed (see Team) |
| 9 | agriculture/team | mismatch | mismatch | - | team bios: 41 collapsed in EDS, 14 on live (EDS 3,752px / 13,184px shorter) |
| 10 | sustainable-investing-case-studies | minor | minor | - | index cards (data, as on 27 Oct) |
| 11 | case study (climate methodology) | match | match | - | - |
| 12 | canadian-core-fixed-income (strategy, chart tables) | minor | minor | panel headings, Key facts grid, 390 padding | team bios; chart sub-headings; data table styling; charts are tables by design |
| 13 | us-econometer (section tabs) | minor | minor | panel h1 at h2 size | panel image narrower |
| 14 | global-macro-outlook-an-uneven-recovery (Video) | mismatch | minor | Share title 24px | two small videos side by side with caption on the poster on live, two large stacked Video blocks in EDS; Title component size |

### Fixed (branch visual-parity)

- `e5e9deb` `blocks/table/table.css`: a paragraph in a table cell keeps the cell size (live 14px/140% from 801px, was 16px/28px body text) - Pension Barometer tables, all tables. Crop: `parity/pb-1440-table.jpg`
- `e5e9deb` `styles/styles.css`: strategy panel headings (Key facts, Performance, Characteristics) page-title size 300 with the 12px "as of" line 8px below (live strategyDetail__heading 48/40px; were 32/24px 400); the strategy panels sit on the section padding at 390 (were 24px inset). The selector (divider section with Nav Title and a Table) matches only the 3 panels on each of the 26 strategy pages in the DA source of the 1,206 live pages.
- `e5e9deb` `blocks/table/table.css`: Key facts as live: label 12px bold over value 24px, no table lines, stacked; auto 3-column grid from 801px (x positions 144 / 414 / 684 as live at 1440). Crops: `parity/cc-1440-key-facts.jpg`, `parity/cc-390-key-facts.jpg`
- `e3cd082` `blocks/share/share.css`: Share title 24px at every width (live share-controls__title; was 32px from 601px)
- `17bed19` `blocks/tabs/tabs.css`: a heading 1 inside a section tab panel (live title component) at h2 size, 300 (live 32/24px; was 48/40px). Crop: `parity/ue-1440-tabs.jpg`

### Open

Pension Barometer (1440 mismatch):
- Live places components inside 6-6 / 8-4 columns: 'Latest asset allocation views' promo under the yield-curve chart, the form with its consent text next to the 'Portfolio review' promo, the 'Asset and liability assumptions' disclosure next to the charts. EDS shows them full width in their own sections (`parity/pb-1440-market-overview.jpg`, `parity/pb-1440-want-to-learn-more.jpg`). Cause: content structure; the importer flattens columns that hold several components (page-model expandColumns), and Layout sections take one block per column. Needs a content model for several components per column (and a re-import), not CSS.
- Table cell text is black (#000) on live, #282b3e in EDS; no live CSS rule sets it (it may come from the mirror), so it is left as is. Column widths (th width=20%/15%) are not imported (accepted 27 Oct).
- Two 'Source:' lines sit outside the table card on live and in the table caption in EDS (importer: caption row).
- 390: the hero uses a separate taller mobile crop on live (shows the top-left of the image); EDS shows the desktop image centred (importer: hero mobile image not imported).

Team (asia-best-select, agriculture/team, canadian-core):
- Live 'Read more' (TeamMemberReadMore) is an option of the teamMembers component: canadian-core and asia-best-select show every bio in full, agriculture/team collapses 14 of 41 members. The Team block collapses every bio taller than 112px (`parity/cc-1440-team.jpg`). Fix: importer carries the option, the Team block gets an opt-in variant, then a re-import; changing the default alone would break agriculture/team.

Strategy pages (canadian-core):
- Chart sub-headings 'Average annual total returns' and 'Portfolio characteristics' (live h3 inside the Performance / Characteristics panels) are not imported (strategy-section parser).
- Live data tables: row labels regular weight, values right-aligned, coloured legend dots; EDS: bold first column, left-aligned (Table block styling; needs a strategy table variant).
- Key facts: live 'Important Disclosures' toggle under the facts is missing; 'as of 6/30/2026' next to Strategy AUM is bold in EDS (part of the label cell).
- Live 'Follow' button (logged-in feature) not replicated; disclosures were captured open on live; charts are tables by design.

Uneven recovery (Video, 1440):
- Live: two small videos (videoSmall in 4-4 columns) with 'Play video' and the caption on a dark overlay of the poster, transcript link below each. EDS: two large Video blocks stacked, caption below the poster (`parity/ur-1440-videos.jpg`). Cause: content structure (one section per Video block) and a small-video design variant the Video block does not have.
- 'A crisis unlike any other ...' is a live title component with a large size option (48px/300); imported as a plain h2 (32px). Same on US Econometer (the panel h1 is the 32px option). Needs the importer to carry the title size option.

US Econometer (section tabs):
- Panel image about 1,020px wide on live, about 900px in EDS (Style centered = 75% of the content width inside the tab panel).

Data (index / content, no code change):
- 2 viewpoints and 4 press releases have no Publication Date, so listings sort them by upload time (top of 'latest viewpoints' on the home page): viewpoints/market-outlook/mainland-china-charting-path-reopening, viewpoints/private-markets/canadian-commercial-real-estate-outlook-economic-decline, about-us/press-releases/deriva-energys-north-allegheny-wind-farm-enters-commercial-operation, .../mim-announces-forest-climate-funds-second-close-bringing-total-commitments-up-to-3345-million, .../practice-press-release, .../test-release.
- Published test pages in the press release listing: about-us/press-releases/test-release, about-us/press-releases/practice-press-release.
- about-us/press-releases/manulife-comvest-credit-partners-announces-record-fund-raise-of-5-4-billion: page title 'Manulife' (live <title>), live lists the article heading.

Mirror: nothing else is needed from live for these findings. It cannot show script-driven states (charts, Coveo search, read-more toggles, carousel); the team read-more option is read from the snapshot markup.

## 27 October 2026

## Fixes applied to every page

- `icons/mim-logo.svg`: rail home tile was a placeholder 'M'; now the live stylized-M logo (mim-logo-0b6b66cd.svg)
- `blocks/header/header.css`: site banner item line-height 1 -> bar 57px as live (main started 4px low on every page at >=601px)
- `blocks/footer/footer.css`: primary/secondary footer menus 16px apart <=800px (rule lost to `footer .footer ul {margin:0}`)
- `styles/styles.css`: global `header {}` (min-height, dark bg) scoped to `body > header` - it leaked into block <header> elements (team cards)
- `styles/styles.css`: default content of component-root pages (live column-container) gets the 24px extra side padding <=800px; page titles / flow templates excluded
- `scripts/listing-core.js`: index titles drop the ' | Manulife Investment Management' / '- ... Mgmt' <title> suffix

## Pages

| # | EDS path | Template | 1440 | 390 |
|---|---|---|---|---|
| 1 | `/institutional/tw/en` | home | minor | minor |
| 2 | `/institutional/tw/en/about-us` | plain | minor | minor |
| 3 | `/institutional/tw/en/pension-barometer` | plain | mismatch | minor |
| 4 | `/institutional/tw/en/viewpoints/fixed-income` | viewpoints | minor | minor |
| 5 | `/institutional/tw/en/viewpoints/alternative-credit/abc-mac-how-multiasset-credit-strategies-offer-dynamic-performance` | viewpoint | minor | minor |
| 6 | `/institutional/tw/en/about-us/press-releases` | press-release-root | minor | minor |
| 7 | `/institutional/tw/en/about-us/press-releases/2020-investment-outlook` | press-release | minor | minor |
| 8 | `/institutional/tw/en/strategies/equity/asia-best-select` | plain | minor | minor |
| 9 | `/institutional/tw/en/strategies/private-markets/agriculture/team` | plain | minor | minor |
| 10 | `/institutional/tw/en/sustainable-investing-case-studies` | case-study-list | minor | minor |
| 11 | `/institutional/tw/en/sustainable-investing-case-studies/environmental/developing-our-high-benefit-climate-methodology` | case-study-detail | match | match |

### 1. `/institutional/tw/en` (home)

Mirror: `mirror/institutional/tw/en.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/disclosure/disclosure.js`: whole-paragraph <sup> footnotes get the live <small> wrapper (11px AUM footnote)
- `blocks/disclosure/disclosure.css`: disclosure wrapper top padding 0 (live .disclosures 8px)
- `blocks/cards/cards.js`: news cards from the index show date/title/link only (no summary)

Remaining:
- [fixed 2026-10-27, CSS: empty title line] hero slide h1 starts with <br> on live (text 52px lower) - hero-carousel parser drops it (parser: hero-carousel)
- [fixed 2026-10-27, approval code in <small>] AUM approval code '5796846' is <small> on live (13px), plain p in EDS (parser: disclosure)
- [data not captured yet] latest viewpoints / latest news come from the index: other items than live (Aug 3 / Mar 31 press releases not indexed)
- [accepted] header search box: Coveo web component renders on live, not in the static mirror; carousel autoplay; author photos hidden on live by JS fallback state

### 2. `/institutional/tw/en/about-us` (plain)

Mirror: `mirror/institutional/tw/en/about-us.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/feature/feature.css`: banner (featureBanner) is full width of main with no section padding and keeps the 250px image at natural width (text column squeezed as live)
- `blocks/feature/feature.css`: banner title margin used :last-of-type (h2 got 16px) -> only the last title line
- `blocks/promo/promo.css`: double promo content 60% wide at every width (live), also when stacked <=600px

Remaining:
- [accepted: authored quirk on 3 of 40 live banners] hero h1 has a trailing <p>&nbsp;</p> on live (title 44px higher in EDS) (parser: hero-banner)
- [fixed 2026-10-27, re-imported] 'Some of our memberships' h3 sits in a 6-6 column with an empty column on live (50% wide at 1000px); flattened to full width (parser: columns / page-model expandColumns)
- [data not captured yet] Latest news from the index

### 3. `/institutional/tw/en/pension-barometer` (plain)

Mirror: `mirror/institutional/tw/en/Pension-Barometer.html`. Widths: 1440, 390. Status: 1440 mismatch, 390 minor.

Fixed:
- `blocks/cards/cards.css`: cards after an overlap hero are raised above it (the three tiles were hidden under the hero image)
- `blocks/columns/columns.css`: 16px between rich-text blocks inside columns (live .text.parbase)
- `blocks/form/form.css`: submit right-aligned >=601px (live reCAPTCHA sits left of it)

Remaining:
- [partly fixed 2026-10-27] nested promo ('Latest asset allocation views', 'Portfolio review'), the form and the 'Asset and liability assumptions' disclosure sit inside 6-6 / 8-4 columns on live; EDS shows them full width below (blocks cannot nest) (parser: columns / page-model expandColumns) -- text next to a form now sits side by side (Layout); columns holding several components (text + form + text, text + promo) still flatten
- [fixed 2026-10-27, re-imported] 'Q4 2025' is <sub><sup><strong> on live (31px bold); EDS keeps only <sup> (45px light) (parser: hero-banner)
- [accepted: the Table block has no column widths] table column widths (th width=20%/15%) not imported (parser: table)
- [fixed 2026-10-27, re-imported] marketoForm success text 'Thank you for reaching out...' imported as visible paragraph (parser: form (marketoForm))
- [accepted: inline <small> not kept by DA] footnote line '1 Liability assumptions. 2 Asset assumptions.' loses <small>
- [accepted] charts are inline SVG sized by JS on live (mirror shows them unsized); reCAPTCHA

### 4. `/institutional/tw/en/viewpoints/fixed-income` (viewpoints)

Mirror: `mirror/institutional/tw/en/viewpoints/fixed-income.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/listing/listing.css`: viewpoint list titles 24px at every width (were 32px)
- `styles/styles.css`: viewpoints page title in a white band with 1px #ededed rule (live title--viewpoints)

Remaining:
- [data not captured yet] index has fewer items (10 vs 13 pages), some teaser images missing, author photos referenced from DA media 404
- [data not captured yet] index title = page <title>, not the live teaser headline (e.g. 'Rising government bond yields' vs 'Why global government bond yields have risen') (parser: query.yaml)

### 5. `/institutional/tw/en/viewpoints/alternative-credit/abc-mac-how-multiasset-credit-strategies-offer-dynamic-performance` (viewpoint)

Mirror: `mirror/institutional/tw/en/viewpoints/alternative-credit/ABC-MAC-how-multiasset-credit-strategies-offer-dynamic-performance.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/link-list/link-list.css`: sidebar Category / Tags styled as live viewpoint-links (light 24px title, underlined 16px links, no arrows)
- `styles/templates.css`: figure cards span the 600px column (no extra 24px inset)
- `styles/templates.css`: link list ('Click here to go to the MCQS homepage') and disclosures span the content column as live
- `styles/templates.css`: related viewpoints / All Tags: 83% wide centred, no side padding (live viewpoints-footer)
- `styles/templates.css`: header wrapper margin 0 16px on mobile (h1 was 16px low)

Remaining:
- [fixed 2026-10-27, re-imported] Share block (LinkedIn/Facebook/X/mail/copy/download) missing: share-controls is in the importer DROP list; needs a block + re-import (parser: page-model DROP / new share block)
- [fixed 2026-10-27, re-imported] author name lacks the trailing comma ('Craig Scordellis,') (parser: author)
- [accepted: empty spacer paragraphs are not imported] spacer <p>&nbsp;</p> before some h2 dropped (sections ~40px tighter)
- [accepted] author photo hidden on live (JS fallback state)

### 6. `/institutional/tw/en/about-us/press-releases` (press-release-root)

Mirror: `mirror/institutional/tw/en/about-us/press-releases.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/hero/hero.css`: no 64px gap between the page header and the sticky category bar
- `blocks/section-nav/section-nav.js`: mobile categories use the live cc-select ('Select..' + list) instead of a grey native select
- `blocks/hero/hero.css`: press root header padding 32px <=600px (live heroHeader)

Remaining:
- [data not captured yet] index has 26 press releases (live ~70, 7 pages); first item (Deriva Energy) has no date in the index
- [accepted] mirror shows the JS sticky copy of the category bar at the top

### 7. `/institutional/tw/en/about-us/press-releases/2020-investment-outlook` (press-release)

Mirror: `mirror/institutional/tw/en/about-us/press-releases/2020-investment-outlook.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `styles/templates.css`: body after the title gets the column-container 24px side margin <=800px

Remaining:
- [accepted: empty spacer paragraphs are not imported] spacer paragraphs (after the date, before Media Contact) dropped; '- End -' loses its centre alignment (parser: press-release)

### 8. `/institutional/tw/en/strategies/equity/asia-best-select` (plain)

Mirror: `mirror/institutional/tw/en/strategies/equity/asia-best-select.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `styles/styles.css`: team card name/title no longer in a dark 50px band on mobile (global header rule leak)

Remaining:
- [accepted] strategy data panel dropped on purpose (live: 'No strategy data for share class S0001')
- [fixed 2026-10-27, re-imported] Philosophy is in an 8-col column on live (66% wide); full width in EDS (parser: columns / page-model expandColumns)
- [accepted: inline font-weight not kept by DA] Vehicles intro is h4 with inline font-weight:normal on live; bold in EDS
- [accepted] team bios truncated + Read more by JS on live; 'Important information' captured open

### 9. `/institutional/tw/en/strategies/private-markets/agriculture/team` (plain)

Mirror: `mirror/institutional/tw/en/strategies/private-markets/agriculture/team.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/section-nav/section-nav.css`: anchor labels no longer break mid-word ('Resourc e plannin g'); global a {overflow-wrap:anywhere} overridden
- `blocks/section-nav/section-nav.js`: scroll spy ignored the 0-height (not yet loaded) sections, so the last item was active at the top; re-runs when sections load

Remaining:
- [accepted: empty spacer paragraphs are not imported] empty first <p> in each live bio (16px) dropped
- [accepted] bio truncation height is JS on live

### 10. `/institutional/tw/en/sustainable-investing-case-studies` (case-study-list)

Mirror: `mirror/institutional/tw/en/sustainable-investing-case-studies.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/hero/hero.css`: title margin 0 / weight 400, banner padding 24px 16px <=600px, no 64px follower padding (live .caseStudyList .heroHeader2)
- `blocks/listing/listing.css`: case-study card titles 24px (were 32px)
- `blocks/listing/listing.js`: Topic/Theme filter bar is opt-in (`Filters | on`); the TW live app renders only the result count and sort

Remaining:
- [data not captured yet] 18 case studies in the index vs 62 on live
- [accepted] card image heights differ by ~10px (image renditions); progressive loading is JS on both

### 11. `/institutional/tw/en/sustainable-investing-case-studies/environmental/developing-our-high-benefit-climate-methodology` (case-study-detail)

Mirror: `mirror/institutional/tw/en/sustainable-investing-case-studies/environmental/Developing-our-high-benefit-climate-methodology-.html`. Widths: 1440, 390. Status: 1440 match, 390 match.

Fixed:
- `styles/templates.css`: sidebar padding / rules were drawn twice (section + block): double vertical line at 1440, image overflowing, two bottom rules on mobile; the block alone draws the live aside
- `styles/templates.css`: body text +24px side padding <=800px (live column-container)

Remaining:
- [accepted: empty spacer paragraphs are not imported] empty description <p> under the h1 dropped (body 12-16px higher)

## Import source fix (2026-10-27)

The bulk importer's dismissPopups clicked the live attestation link in every snapshot ("I agree" -> www.manulifeim.com/institutional/kr/en/<path>), so imports came from the live Korea site instead of the snapshot: 11 pages showed the Korea homepage or another page, 28 more had Korea links, 20 press releases a Korea canonical. All 464 captured pages were re-imported from their snapshots with a click guard (tools/importer/run-captured.mjs) and uploaded / previewed; check-content.mjs now compares every title with its snapshot before upload.

## Dropped / not replicated

- Strategy data panel: strategies/*: live only shows 'No strategy data for share class "S0001"' - dropped on purpose
- Live 404s (not imported): `/institutional/tw/en/authors`, `/institutional/tw/en/cqs`, `/institutional/tw/en/viewpoints/private-markets/private-equity-credit-investing-middle-market`
- Images dead on live (tools/importer/reports/dead-images.txt):
  - `/institutional/tw/en/institutional-pension-plan-sponsor`: https://www.manulifeim.com/content/dam/mim-institutional/global/viewpoints/pm-1590950-viewpoint--pere-q-a-(maggie-coleman,-marc-feliciano)/PM-1590950-Viewpoint-PERE-QA-Maggie-Coleman_Marc-Feliciano_1200x628.jpg
  - `/institutional/tw/en/viewpoints/all`: https://www.manulifeim.com/content/dam/mim-institutional/global/viewpoints/pm-1590950-viewpoint--pere-q-a-(maggie-coleman,-marc-feliciano)/PM-1590950-Viewpoint-PERE-QA-Maggie-Coleman_Marc-Feliciano_1200x628.jpg
  - `/institutional/tw/en/insurance-solutions`: https://www.manulifeim.com/content/dam/mim-institutional/global/assets/landing-pages/iinv-813850-insurance-solutions-2026-web-update/IINV-813850_Insurance-solutions-2026_traditional_fixed-income-strategies-to-more-complex-solutions_graphic_v11_800px.svg

## Lint

npm run lint: clean; node --test tools/importer/test/listing.test.mjs: 14/14
