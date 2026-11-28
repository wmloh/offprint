# Categorical grids

Enable `"chart-grid": true` in site or page `features` (loads [SVG charts](charts.md)). Use `data-op-chart="grid"` with a JSON spec, a table, or a named source. Risk matrices (zones + items) and confusion matrices (counts + derived totals, shares, rates). For pivoted tables with interchangeable supplied measures use [evaluation matrices](matrix.md) instead.

```html
<div id="risks" data-op-chart="grid" data-op-selection-group="risk">
  <script type="application/json">
    {"y": "Impact", "x": "Likelihood", "score": "product",
     "rows": ["Severe", "Major", "Minor"], "columns": ["Rare", "Possible", "Likely"],
     "zones": [{"label": "Low", "color": "green", "score": [1, 2]}, {"label": "High", "color": "red", "score": [5, 9]}],
     "items": [{"key": "r1", "label": "Supplier fails", "row": "Major", "column": "Likely", "from": ["Severe", "Likely"]}]}
  </script>
</div>
```

## Axes and cells

- `rows`, `columns`: ordered descriptors, 1–16 each, top→bottom / left→right: label (text or number) or `{key, label?, score?}`. Keys and labels unique per axis. Risk rows list high→low. References (`row`, `column`, cell pairs) match key first, then label.
- `y` = row axis title (top left), `x` = column axis title (above column labels; column labels sit on top of the plot). `value`: label or `{label, unit, digits}` formats counts, ticks, totals. `height` > 80, else top + rows × (52 with items, 40 without) + 22 per margin row + 10.
- Values (optional): `z: [[...]]` (rows × columns) or `cells: [{row, column, value?, key?}]`, not both. Finite numbers or numeric text; `null`/blank = no value. Repeated cells fail. Cell keys: nonempty unique strings, default `cell:<rowKey>:<columnKey>`; every cell is a keyed spot, values or not.
- Table markup: header = row-axis title then column labels; body rows = row label then values; `data-op-key` keys a value cell. Becomes `cells`; stays the no-script fallback.
- Colour: values without zones colour cells with the shared [heatmap scales](chart-heatmap.md#axes-and-colour-scale) (`scale`: `sequential` default, `diverging`, `log`, or `{type, min, max, mid, color, colors}`) plus a side scale bar. Share modes use a fixed 0–100% sequential scale in the scale's (high) colour. Zones present → zones colour; values print as text.

## Items

- `items: [{key, label?, row, column, from?, short?, text?, color?|role?, revealStep?}]`, ≤300. `key` required, unique across cells and items. `short` = badge text ≤3 chars (default 1-based list position). `text` shows in the readout and table. `from: [row, column]` or `{row, column}` draws a dashed trail from that cell's centre (with a ghost ring) to the item; same cell = no trail.
- Packing: badges (radius 4–8 by cell size, text from radius 6.5) fill rows centred in the cell; a value moves to the top-left corner. Overflow: the last slot becomes a `+n` badge; hidden items keep spots on it and stay in readouts and the table. Slots are fixed per draw, so reveal steps never shift badges.

## Zones

- `zones: [{key?, label, color?|role?, cells? | score?, revealStep?}]`, ≤12; exactly one of `cells: [[row, column], ...]` or `score: [min, max]` (inclusive). Keys default `zone-<n>`. `color` = palette name.
- `score`: `"product"` | `"sum"` | `"value"` (needed for score ranges). Row score = authored `score`, else rows count down from the top (n…1); column score = authored, else 1…n from the left; `value` = the cell value (none → unscored). Assignment: cell lists claim cells first (first listing wins), then the first range containing the score; else unzoned.
- Zone tint `.op-grid-zone` (`--op-accent`, 0.32) over the cell; legend items `.op-grid-zone-item`; readout, table, and description name zones and cell counts.

## Confusion options

- `diagonal: true` outlines cells where row key = column key and bolds their values. `metrics: true` adds derived recall per row (diagonal ÷ row total, right margin) and precision per column (diagonal ÷ column total, bottom margin). Both need the same key set on rows and columns (any order).
- `totals`: `"rows"` (right column), `"columns"` (bottom row), `"both"`/`true` (+ grand total). Totals are counts in every mode; missing values add 0.
- `normalize`: `"none"` (default) | `"row"` | `"column"` | `"all"`: displayed value = value ÷ its row, column, or overall total; zero total or missing value → no share. `normalizeChoices`: `true`/list of ≥2 modes/`false`; default all four when `normalize` is set, else none. Choices show as single-choice chips (`.op-grid-normalize`: Counts, Row shares, Column shares, Overall shares). Totals, shares, and metrics need values.
- Mode survives data updates while still offered. `OffPrint._chart._grid.normalize(target, mode?)` reads or sets (false when not offered). Bubbling `op:chart:grid-normalize` `{current, previous, origin: 'user'|'api'}`. Interactive export restores the mode (reader-state kind `chart-grid`).

## Reading, selection, links

- Pointer: badge under it, else the cell. Readout: cell `row · column`, zone, value (share mode: `34% of the row (12 of 35)`), "Diagonal", items `short label` (8, then `+n more`). Item readout: label, cell and zone, `Moved from …`, text.
- Keys: arrows move between cells (2D, stop at edges), Home/End = first/last cell, `]`/`[` cycle the current cell and its shown items; Enter/Space toggles the key with a `selectionGroup`. [Detail panes](../interact/detail-panes.md) keyed to the selection group open by cell or item key. `coords()` → `{x: column, y: row, z, xText, yText}`.
- Table view: grid table (values in the current mode, zone, item labels per cell, totals, recall, precision rows) and an items table (item, row, column, from, zone, note); cells and item rows carry keys.
- [Annotations](chart-annotations.md) anchor by column (`x`) and row (`y`) key or label, or `point` = cell or item key. Geometry: `px`/`span` by key or label, `cell(row, col)`; item badges are obstacles, cells are not. [Facets](chart-facets.md) share the value scale across grid panels unless `free-y`.
- Reveal steps: with `data-op-reveal-sequence` on the host, `revealStep` on items and zones fades them in from that step (items, trails, zone tints, zone legend items, item table rows). Without the attribute warns once and shows all. Reader export captures each step.
- Motion: cells fade by column; badges and trails tween position by key on updates. Legend toggles, brush, rescale, and reference lines do not apply.

## Named source

- Instance `mapping`: `{row, column, value, pointKey?}` (cell records) or `{row, column, item, label?, fromRow?, fromColumn?, text?}` (item records). Unlisted `rows`/`columns` follow first appearance; unset `x`/`y`/`value` titles default to field names. Combine cells and items with `transformOutput: "spec"`.

[Charts](charts.md) · [Source](../../js/chart-grid.js)
