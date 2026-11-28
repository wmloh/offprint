# Supplied fits and residuals

Enable `"chart-fits": true` in site or page `features` (loads [SVG charts](charts.md)). Add a `fits` array to a line or scatter chart spec (or host `data-op-fits` JSON) and, for a residual panel, `residuals: true` (or `data-op-residuals`). Everything is supplied: curves, bands, statistics, and fitted values. Nothing is estimated, smoothed, or interpolated in the browser.

```html
<div data-op-chart="scatter" data-op-selection-group="doses">
  <script type="application/json">{"x": {"label": "Dose"}, "y": {"label": "Response"}, "residuals": true,
    "series": [{"key": "obs", "name": "Observed", "data": [{"x": 0, "y": 1.2, "fitted": 1, "key": "d0"}, {"x": 4, "y": 9.1, "fitted": 9, "key": "d4"}]}],
    "fits": [{"key": "ols", "label": "Linear fit", "curve": [[0, 1], [4, 9]], "band": [[0, 0.5, 1.5], [4, 8, 10]], "stats": "R² = 0.99"}]}</script>
</div>
```

## Input

- `fits: [{key?, label?, series?, curve, band?, stats?, color? | role?}]`. Line and scatter base types only, numeric, log, or time x; other types and text-category x are errors.
- `key`: unique string, default `fit-<n>`; chip value, mark key, `data-op-fit`. `label`: default `<series name> fit`, else `Fit <n>`.
- `series`: key or name of the series the fit belongs to; default the only series on a one-series chart. Colour follows the series; `color`/`role` override; no series → muted text colour.
- `curve`: ≥ 2 `[x, y]` (or `{x, y}`) points, finite, strictly increasing x. Drawn as given: straight segments between supplied points (supply enough points for a smooth curve).
- `band`: ≥ 2 `[x, lower, upper]` (or `{x, lower, upper}`), strictly increasing x, `lower ≤ upper`; x need not match the curve.
- `stats`: text or `{text}` (e.g. `R² = 0.94 · y = 2.0x + 1.0`); shown beside the fit chip, in the table, and in the description.
- Points: object points may carry `fitted` (number or numeric text; blank = none). Validated whenever present: finite, positive on a log y axis.
- Log axes: curve and band x > 0 on log x; curve y, band bounds, and fitted values > 0 on log y. Nonpositive values are errors, never dropped.
- `residuals: true | {height?, label?}`: `height` 48–200px (default 72), `label` default `Residual`. Needs at least one point with `fitted`.
- Validation errors stop the chart like other spec errors. Time x values accept epoch ms or zoned ISO.

## Drawing

- Bands under curves, both clipped to the plot; curves solid on scatter, dashed on line charts. Fit curves and bands widen the y extent (hidden fits too, so toggling never rescales).
- Curves are mark-map obstacles for [annotations](chart-annotations.md) (load order: fits before annotations); bands are not.
- Motion: fits fade by key (`fit` + `curve`/`band` + fit key); residual dots grow from radius 0 keyed by series + point key.

## Residual panel

- Under the plot, after a 24px gap; the SVG grows by gap + height and the x ticks and title move below the panel. Shared x scale, brushed range, and plot width.
- Residual = observed − fitted (in y units, also on log y). Axis symmetric about zero over every series' residuals (hidden ones too; `rescale: true` fits the shown ones), 3 ticks, zero line, label top-left.
- Dots per shown point with `fitted`, coloured by series, keyed (`data-op-key` with a selection group) so selection highlights both rows of the chart.
- A series' residuals hide with its series chip and with the first fit that names it.
- Hover: pointer in the panel reads the nearest residual dot's point (line charts: the nearest x); the readout adds `+0.4 residual (fitted 3)` rows and rings the residual. Cross line and x-group cursor span plot and panel. Keyboard reading and Enter/Space selection are unchanged.
- No panel on add-on chart types. Playback does not reveal residuals progressively.

## Legend, table, description

- Legend: one chip per fit (`.op-chart-fit-toggles`, chip `.op-chart-fit-toggle`, swatch `.op-chart-key.is-fit[.has-band]`, stats in `.op-chip-note`); unchecking hides curve, band, and residuals. Without `choices`, static items with `.op-chart-fit-stats`.
- A fit also hides while its series is hidden.
- Table view: `Fits` table (`.op-chart-fits-table`: fit, series, curve point count and x span, band span, statistics) for shown fits; `Residuals` table (`.op-chart-residuals-table`: series, x, observed, fitted, signed residual) for shown points in range.
- Description names each fit, its series, band, and statistics, states that they are supplied, and mentions the residual panel.

## Named sources

- Column mapping: series descriptor `fitted: "<field>"` sets each point's fitted value from its record.
- Grouped mapping: `mapping.fitted: "<field>"`.
- `mapping.fits: [{key?, label?, series?, group?, x?, y, lower?, upper?, stats?, color?, role?}]` builds curves (and bands with both `lower` and `upper`) from the mapped records, sorted by x; `x` defaults to `mapping.x`; `group` keeps records of one group (grouped mapping, default `series`). Records with a blank `y` are skipped; repeated x must agree. Appended after authored `fits`.
- Every named field must exist on every record (blank values allowed).

## State and API

- Event `op:chart:fits` on the host: `{shown, hidden, previous, origin}`.
- Interactive export restores hidden fits (reader-state kind `chart-fits`); residual panels redraw from the data. Reader export captures the drawn SVG.
- `OffPrint._chartFits`: `visible(target, key, on?)` (read, or set → `true`; `null`/`false` for an unknown fit), `normalize(model, spec)`, `residuals(model)`, `mapRecords(rows, mapping, spec)` for tests.

[Charts](charts.md) · [Chart add-ons](../extend/chart-addons.md) · [Source](../../js/chart-fits.js)
