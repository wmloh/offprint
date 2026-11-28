# Facets and scatter-plot matrices

Enable `"chart-facets": true` in site or page `features` (loads [SVG charts](charts.md)). A `[data-op-facets]` host takes a direct `script[type="application/json"]` spec, or `data-op-source` records. Other direct children (a table, an image) are the no-script fallback, hidden while mounted.

```html
<div id="sales" data-op-facets data-op-selection-group="week">
  <script type="application/json">{"type": "line", "brush": true, "toggles": true, "x": "Week", "y": "Sales",
    "series": [{"key": "web", "name": "Web", "data": [{"x": 1, "y": 4, "region": "North"}, {"x": 1, "y": 12, "region": "South"}]}],
    "facet": {"field": "region", "columns": 2}}</script>
</div>
```

## Small multiples (`data-op-facets` empty or `"panels"`)

- Spec = any chart spec (any type, add-ons and layers included) plus `facet: {field | series: true, columns?, scales?, order?, labels?, height?}`.
- `field`: split object points of every `series[].data` and top-level `data` by that point field (scalar; missing → error naming point and series). Every panel keeps every series (empty arrays where absent) so colours and toggles line up; pie panels list every slice (value 0 where absent).
- `series: true`: one panel per series (≥ 2 series), each in the first palette colour unless `role`/`color` is set. Give `field` or `series`, not both.
- `columns` 2–4 (default 2). `order`: panel values first, rest in order of first appearance. `labels`: `{value: title}`. Panel titles sit above each panel (`.op-facets-title`). Cap: 24 panels.
- `height` (> 80): panel height; default spec `height`, else 220/190/170 for 2/3/4 columns. Spec `title` captions the whole grid.
- `scales: "shared"` (default): continuous x min/max from all panels (line exact, scatter and others rounded); categorical x = union of categories in order; y min/max rounded from all panels' extents (layer extents such as fit bands included); heatmaps share one colour scale (`scale.min`/`max`). Author `min`/`max` win. `"free-y"`: x still shared, y (and heatmap colour) per panel. Percent stacks and pies are unscaled.
- Histogram panels bin separately; supply the same `edges` (pre-binned) for identical bins.

## Linking

- One shared head (`.op-facets-head`): legend (series or slices; chips when `toggles: true`), range text + **Reset range**, **Table**. Panel heads drop their tools and the series keys the shared legend names; reference lines and add-on legends (heatmap scale, fit chips) stay per panel.
- Legend chips hide a series in every panel. `brush: true`: a range brushed or keyed (`+`/`-`, Shift+arrows) in one panel applies to all; Reset clears all. Table toggles every panel's table view.
- Panels join one [x-position group](charts.md#shared-x-position) for the cursor: host `data-op-x-group`, else a generated name (linear numeric x only).
- `data-op-selection-group` on the host (or spec `selectionGroup`) passes to every panel; keyed points select across panels.
- Host `data-op-animate="false"` or spec `motion: false` stops panel motion.

## Scatter-plot matrix (`data-op-facets="matrix"`)

- Spec: `{fields, data?, key?, group?, label?, diagonal?, bins?, toggles?, height?, title?, table?, selectionGroup?}`. Records from `data` or the named source.
- `fields`: 2–6 entries, `"name"` or `{field, label?, unit?, digits?, type?: "linear"|"log", min?, max?}`, distinct. Fewer or more → error, fallback kept. Each field has one scale (rounded from its data, author `min`/`max` win) used as x down its column and y along its row. Log fields need positive values (error names the record). Blank or non-numeric values leave the record out of that field's panels; the diagonal notes `n missing`.
- `key`: record field for record keys (unique, nonempty), default `r1`, `r2`, …. `label`: record field for readout and table labels. `group`: field or `{field, series?: [{key, label?, role?, color?}]}` colours records by group as series (descriptor order, then first appearance).
- Layout: off-diagonal cell (row i, column j) = scatter of field j (x) against field i (y). Up to 4 fields inline at full detail (ticks, axis titles). 5–6 fields inline: compact (`.op-facets.is-compact`, no ticks, no axis titles, height 128/112) and the description points to [figure zoom](../interact/figure-zoom.md); inside the zoom view panels redraw in full (height 170/150) and return to compact on close. Spec `height` (> 80) fixes the panel height.
- `diagonal: "range"` (default): tile with field label, data range (`min – max`, unit), missing count. `"histogram"`: same title over an overlaid histogram of the groups with derived counts on `bins` (2–40, default clamp(⌈√n⌉, 5, 20)) equal-width bins across the field scale (log fields in log10 units), bins `[lo, hi)`, last closed. Needs `chart-histogram`; without it warns once (`chart-facets-histogram`) and shows ranges.
- Table: one records table (record, group, fields, `Brushed` column when brushing; rows outside dimmed), replaces the grid; selection keys on rows.

## Brush

- Drag on any scatter panel draws a rectangle (`.op-facets-brush`) in that panel's data units, clamped to the plot. Records inside are those whose two values fall in both ranges; every scatter panel dims the others (`.is-facets-out`, by record key). Previews while dragging; reported on release. Head status `n of N records in the brushed area` with **Clear brush**; Escape on a panel clears. The click ending a drag neither selects nor opens zoom. Diagonal histograms are not filtered.
- Bubbling `op:chart:facets-brush` on the host: `{current, previous, origin}` with `{x: {field, range}, y: {field, range}, keys, count, total}` or `null`.
- Brushing and selection are separate: selection keeps one key in the group; the brush dims many.

## Named source

- `data-op-source="name"`, records under the source. Panels: instance options `options["chart-facets"].instances[id]` with chart `mapping` ([named source](charts.md#named-source)); `facet.field` splits records before mapping (grouped mappings list the union of groups in every panel), `facet.series` maps once and splits. `transform` applies; full-spec transforms are rejected. Matrix: records are read directly with `fields`; no mapping.
- Source replacement and `api.update(records)` (named) or `api.update(spec)` (inline) redraw; same panel keys tween in place, otherwise the grid rebuilds. Hidden series and the brush survive when still valid.

## API and export

- `OffPrint._chartFacets.mount(target, instance?)`, `.get(target)` → `{element, panels(), setSeriesVisible(key, on), setRange([lo, hi] | null), range(), brush(next?), subscribeBrush(fn), update(input), reset(), subscribe}`. `brush({x: {field, range}, y: {field, range}})` needs two different matrix fields; `brush(null)` clears.
- [Reader export](../setup/export.md) captures panels as drawn, brush dimming included. Interactive export restores hidden series, range, table view, and brush through reader state kind `chart-facets` (host identity; `data-op-facets` hosts get one without an `id`).

[Charts](charts.md) · [Histograms](chart-histogram.md) · [Linked selection](../interact/linked-highlighting.md) · [Source](../../js/chart-facets.js)
