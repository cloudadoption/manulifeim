# score-bars

Custom block for meta pages (for example `/migration-status/psi-scores`), not a component of
www.manulifeim.com. It draws a before and an after score per category as two bars side by side,
coloured as in PageSpeed Insights (red 0-49, orange 50-89, green 90-100); the before bar is
striped.

## Authoring (Document Authoring)

- First row (header): cell 1 the legend, `before label → after label`; cell 2 empty; then one
  cell per category (for example Performance, Accessibility).
- Every other row is one line of bars: cell 1 the item (text and links; leave it empty to add a
  line to the item above), cell 2 the line label (for example Mobile), then one value per
  category: `before → after`. A value is a score from 0 to 100 or a fraction such as `2/3`. A
  number in brackets after a score, `63 (100)`, is the score without a known penalty; it is
  drawn as a dashed extension, and the bar takes the colour of that score (green for
  `63 (100)`).

Cells that are not a pair stay empty.

## Options

- `large`: taller bars, for a summary.
