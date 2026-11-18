# SVG charts

Load `css/chart.css` and `js/chart.js` after core. A `[data-df-chart]` host takes a direct `script[type="application/json"]` spec or a direct table. For tables, the first row names columns, the first column is x, and each remaining column is a series. The table provides the static fallback. Load [linked selection](../interact/linked-highlighting.md) assets for keyed selection.

```html
<div id="signal" data-df-chart="line" data-df-gaps="break" data-df-brush>
  <table>
    <tr><th>Sample</th><th data-df-color="blue">Signal</th></tr>
    <tr><td>1</td><td>0.4</td></tr><tr><td>2</td><td></td></tr><tr><td>3</td><td>0.9</td></tr>
  </table>
</div>
```

- Spec `type` is `line` (default), `bar`, or `scatter`. Use `series: [{name, data, role?, color?}]` or a single `data` array. Each point is `[x,y]`, `[x,y,label]`, `{x,y,label?,key?}`, or a bare y with zero-based x or a corresponding `categories` entry. Text x values or explicit categories give discrete slots. Bar x is categorical. Optional `markedCategories` adds asterisks to matching categories. Six default series colours, then gray. `role` takes precedence over `color`. Table series headers accept `data-df-role` and `data-df-color`.
- `title`, `height` (pixels, default 260, must exceed 80), `table: false` to suppress the Table button. `x` and `y` accept a label string or `{label, min, max, digits, unit, type}`. Markup overrides type via `data-df-chart`, and spec fields via `data-df-height`, `data-df-x-label`, `data-df-y-label`, `data-df-x-type`, `data-df-y-type`, `data-df-gaps`, `data-df-reference-lines` (JSON), `data-df-selection-group`, `data-df-toggles`, `data-df-brush`, and `data-df-rescale`.
- Line and scatter x can use `type: 'time'`. Values, bounds, and x reference lines take epoch milliseconds or ISO date-times with `Z` or an offset. Display is UTC. Invalid times warn and are skipped or ignored. `type: 'log'` on either line or scatter axis uses base 10 and requires positive axis values, bounds, and reference values. Invalid log specs warn and preserve the initial fallback or last valid chart.
- Line `gaps: 'break'` breaks at explicit `null` or a blank y cell at a valid x. That position stays in the readout and table. An omitted x joins across the interval. `referenceLines: [{axis, value, label}]` adds dashed x or y guides in the same scale, without extending it. The legend names guides that are off scale or outside the selected range.
- Pointer movement and plot focus with arrows or Home/End inspect data. For linked selection set `selectionGroup: 'trace'` or `data-df-selection-group="trace"`. Add `key` to point objects or `data-df-key` to the corresponding series cells. Click, Enter, or Space toggles the key. The group retains selection across redraws, filtering, and table view. Handled selections leave [figure zoom](../interact/figure-zoom.md) closed.
- Multi-series legend buttons toggle by name unless `toggles: false`. `brush: true` enables drag-to-narrow on a continuous x axis with a nonzero domain. On the focused plot, `+` or `=` zooms in, `-` zooms out, and Shift+Left/Right pans an existing range. Reset range clears it. Table and readout follow visible series and range. `rescale: true` fits y to those values while retaining fixed y bounds. By default y keeps its full-data scale.
- `DocForm.chart(idOrElement, spec)` draws or updates and returns a controller, or `null` on failed initial creation. `DocForm.chart.get(element)` retrieves the controller or `null`. `validate(spec)` returns validation errors. `fromTable(rows, type?, keys?)` converts header-first arrays, optionally with a parallel matrix of point keys. Use the controller's `update` to tell whether a replacement was accepted.
- Controller `update(spec)` returns true on success or false when validation fails. Hidden series survive by name if still present in a multi-series chart. A narrowed range survives when the x kind matches and the range can be clamped to the new data. Preserve the original `spec()` object to restore a chart's authored source table. Table mode stays active when supported by the replacement spec.
- Controller `model()` and `spec()` return detached copies. `snapshot()` gives `{hiddenSeries, range, table}`. Use `setSeriesVisible(key, on)`, `setRange([lo, hi])`, or `setRange(null)`. Time ranges use timestamps. `subscribe(fn, {immediate: true}?)` and bubbling `df:chart:view` report reader state changes with `current`, `previous`, and `origin`. `coords(clientX, clientY)` returns `{x, y, xText, yText, plot}` over the visible plot for the zoom crosshair.

## Named source

- Set `data-df-source="name"` on a chart host and enable `data`. Put `mapping` under `options.chart.instances[id]`. Use `{x, series: [{key, field, label?, role?, color?}], pointKey?}`. `x` is a field or `{field, label?}`. Fields match exact column names. `pointKey` names the record field for keyed selection.
- Use an optional named `transform` to derive fields, or `transformOutput: "spec"` for a full spec. Keep series keys stable across label changes. Source-free series can derive keys from unique names.
- `DocForm.chart.get(target)` accepts an ID or element. `update(spec)` installs a validated local spec. `reset()` restores the authored input or latest shared data and clears local chart controls. Shared replacement preserves hidden series by key, compatible ranges, and Table mode when supported. Include an authored table for a fallback with an inline or mapped spec.

[Dropzone replacement and Reset](dropzones.md) · [Scenarios](../interact/scenarios.md) · [Worked examples](../interact/worked-examples.md) · [Log-scale example](../../../examples/transformers/pages/prediction.html#learning-rate-plot) · [Source](../../js/chart.js)
