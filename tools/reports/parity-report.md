# Parity report (EDS local code vs offline live mirror)

local dev server (localhost:3000, local code + preview content) vs offline mirror (localhost:3000/tools/importer/snapshots/mirror), full-page screenshots and computed styles at 1440 and 390 (spot checks at 700/1000).

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
- [batch 2: CSS] hero slide h1 starts with <br> on live (text 52px lower) - hero-carousel parser drops it (parser: hero-carousel)
- [batch 2: CSS] AUM approval code '5796846' is <small> on live (13px), plain p in EDS (parser: disclosure)
- [data not captured yet] latest viewpoints / latest news come from the index: other items than live (Aug 3 / Mar 31 press releases not indexed)
- [accepted] header search box: Coveo web component renders on live, not in the static mirror; carousel autoplay; author photos hidden on live by JS fallback state

### 2. `/institutional/tw/en/about-us` (plain)

Mirror: `mirror/institutional/tw/en/about-us.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/feature/feature.css`: banner (featureBanner) is full width of main with no section padding and keeps the 250px image at natural width (text column squeezed as live)
- `blocks/feature/feature.css`: banner title margin used :last-of-type (h2 got 16px) -> only the last title line
- `blocks/promo/promo.css`: double promo content 60% wide at every width (live), also when stacked <=600px

Remaining:
- [batch 2: CSS] hero h1 has a trailing <p>&nbsp;</p> on live (title 44px higher in EDS) (parser: hero-banner)
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
- [batch 2: CSS] table column widths (th width=20%/15%) not imported (parser: table)
- [fixed 2026-10-27, re-imported] marketoForm success text 'Thank you for reaching out...' imported as visible paragraph (parser: form (marketoForm))
- [batch 2: CSS] footnote line '1 Liability assumptions. 2 Asset assumptions.' loses <small>
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
- [batch 2: CSS] spacer <p>&nbsp;</p> before some h2 dropped (sections ~40px tighter)
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
- [batch 2: CSS] spacer paragraphs (after the date, before Media Contact) dropped; '- End -' loses its centre alignment (parser: press-release)

### 8. `/institutional/tw/en/strategies/equity/asia-best-select` (plain)

Mirror: `mirror/institutional/tw/en/strategies/equity/asia-best-select.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `styles/styles.css`: team card name/title no longer in a dark 50px band on mobile (global header rule leak)

Remaining:
- [accepted] strategy data panel dropped on purpose (live: 'No strategy data for share class S0001')
- [fixed 2026-10-27, re-imported] Philosophy is in an 8-col column on live (66% wide); full width in EDS (parser: columns / page-model expandColumns)
- [batch 2: CSS] Vehicles intro is h4 with inline font-weight:normal on live; bold in EDS
- [accepted] team bios truncated + Read more by JS on live; 'Important information' captured open

### 9. `/institutional/tw/en/strategies/private-markets/agriculture/team` (plain)

Mirror: `mirror/institutional/tw/en/strategies/private-markets/agriculture/team.html`. Widths: 1440, 390. Status: 1440 minor, 390 minor.

Fixed:
- `blocks/section-nav/section-nav.css`: anchor labels no longer break mid-word ('Resourc e plannin g'); global a {overflow-wrap:anywhere} overridden
- `blocks/section-nav/section-nav.js`: scroll spy ignored the 0-height (not yet loaded) sections, so the last item was active at the top; re-runs when sections load

Remaining:
- [batch 2: CSS] empty first <p> in each live bio (16px) dropped
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
- [batch 2: CSS] empty description <p> under the h1 dropped (body 12-16px higher)

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
