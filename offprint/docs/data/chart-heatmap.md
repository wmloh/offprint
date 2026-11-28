# Heatmaps

Enable `"chart-heatmap": true` in site or page `features` (loads [SVG charts](charts.md)). Use `data-op-chart="heatmap"` with a direct JSON spec or table, or a named source.

```html
<div id="traffic" data-op-chart="heatmap" data-op-selection-group="slot">
  <table>
    <tr><th>Day</th><th>9</th><th>10</th></tr>
    <tr><th>Mon</th><td>4</td><td data-op-key="mon-10">12</td></tr>
    <tr><th>Tue</th><td>7</td><td></td></tr>
  </table>
</div>
```

## Input

- Matrix: `z: [[...], ...]` (`z[row][column]`), optional `columns`, `rows` (labels; default `"1"`, `"2"`, …), optional `keys` with the same shape as `z`. Rows must have equal length. `null` or blank = missing cell (backdrop only, no mark, empty table cell).
- Records: `data: [{x, y, z, key?}]` (x = column label, y = row label). Order of first appearance unless `columns`/`rows` list the order; listed labels reject unknown records. Duplicate cells fail. Give `z` or `data`, not both.
- Table markup: header row = row-axis name then column labels; each body row = row label then values; `data-op-key` on a value cell keys it. The table remains the no-script fallback; the Table button builds the grid table.
- Labels: nonempty text or finite numbers, unique per axis. Values: finite numbers or numeric text (`"1,200"`). Keys: nonempty unique strings; default `cell:<row>:<column>`.
- Cap: 5000 cells (rows × columns, missing included). Larger grids fail validation; invalid updates keep the last chart.
- Named source: instance `mapping: {x, y, z, pointKey?}` field names (CSV fields must exist). Record filters and dropzone replacement apply. Unset `x`, `y`, `value` labels default to the field names. `transformOutput: "spec"` can supply a full heatmap spec.

## Axes and colour scale

- `x` (column axis title, under plot), `y` (row axis title, top left): label string or `{label}`. `value`: label string or `{label, unit, digits}` formats readouts, ticks, table, contour labels; its label tops the colour scale. `height` > 80, else 76 + clamp(rows × 26, 120, 480).
- `scale`: `"sequential"` (default), `"diverging"`, `"log"`, or `{type, min?, max?, mid?, color?, colors?}`. Colours are palette names (`gray brown orange yellow green blue purple pink red`) resolved through `--op-<name>` tokens (light/dark aware). Sequential/log: `color` (default `blue`). Diverging: `colors: [low, high]` (default `["orange", "blue"]`).
- Cells fill with the hue at `fill-opacity` over a `--op-gray-bg` backdrop. Sequential/log: 0.1 + 0.85 × position (log position in log10 units; log needs positive values and bounds). Diverging: neutral at `mid` (default 0), 0.9 × distance / arm length per side; without bounds both arms reach the farthest value; `min`/`max` set each arm's end; `mid` must lie strictly between. Values beyond bounds clamp. Equal bounds pad (±10% or ×/÷2 on log).
- The scale is the shared chart-kit `colorScale`, also used by [grids](chart-grid.md).
- Side scale right of the plot (high at top, 48 steps, ticks at the axis ticks within bounds). CSS vars `--op-heatmap-high` / `--op-heatmap-low` are set on the plot from the spec.

## Value-range filter

- Drag on the side scale to dim cells outside `[lo, hi]` live; release announces once. Click (≤3px movement) picks the tick step containing the value; clicking the same step clears. Plot keys: Page Up / Page Down select and move one tick step (first press: top / bottom step); Escape clears, then leaves inspection. Legend shows `Values lo – hi` and a **Show all values** button.
- Dimmed cells get `.is-dimmed` (opacity 0.12, 0.2 s transition); readouts add "Outside the value range". The table lists all values. The range survives updates, clamped to the new scale, and clears when it no longer overlaps.
- Bubbling `op:chart:heatmap-range` reports `{current, previous, origin}` with `[lo, hi]` or `null` range states.

## Contours

- `contours: true | {levels?, labels?}`. Levels: default the scale's ticks strictly inside the data range; `levels: n` (1–20) evenly spaced inside (log: by ratio); `levels: [values]` (finite, positive on log); out-of-range levels are dropped; >20 fails.
- Needs a complete grid (no missing cells), ≥2 rows and columns, and row and column labels that are numbers in strictly increasing or decreasing order. Otherwise warns once (`Heatmap contours were skipped because …`) and draws without them. Constant grids draw none.
- Marching squares over cell centres (log scales interpolate in log10); saddles resolve by the mean of the four corners. One path per level (`.op-heatmap-contour`, `data-op-level`); `labels: true` adds a haloed `.op-heatmap-contour-label` at the segment nearest the level's centroid. Positions follow cell order, not numeric label spacing.
- Toggle: a drawn contour set adds one legend chip, `Contour lines` (`.op-heatmap-contour-toggle`, choices.js multiple chip), that hides and shows every line and label together (`.op-heatmap-contours.is-off`, fades). On by default; kept across redraws and data updates. Fires bubbling `op:chart:heatmap-contours` `{current, previous, origin: 'user'|'api'}` on change.

## Reading, selection, motion

- Pointer reads the cell under it; arrows read in row-major order skipping missing cells, Up/Down move within the column, Home/End. Readout: `row · column`, swatch, value, value label. `coords()` (zoom crosshair) → `{x: column, y: row, z, xText, yText}`.
- `selectionGroup`: click, Enter, or Space toggles the cell key; table cells share keys. Legend toggles, brush, rescale, and reference lines do not apply and are ignored.
- Motion: cells fade in on entrance (`fill-opacity` from 0, staggered by column). Updates tween `fill-opacity` and geometry by key and blend the fill when a cell changes sides of a diverging midpoint. Contours cross-fade. Shared [motion options](charts.md#motion) apply.

[Charts](charts.md) · [Source](../../js/chart-heatmap.js)
