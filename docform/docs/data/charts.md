# SVG charts

Enable `chart`. A `[data-df-chart]` host takes a direct `script[type="application/json"]` spec or a direct table. For line, bar, and scatter tables, the first row names columns, the first column is x, and each remaining column is a series. A pie table has a header row followed by one label and value per row. The table provides the static fallback. Enable [selection](../interact/linked-highlighting.md) for keyed selection.

```html
<div id="signal" data-df-chart="line" data-df-gaps="break" data-df-brush>
  <table>
    <tr><th>Sample</th><th data-df-color="blue">Signal</th></tr>
    <tr><td>1</td><td>0.4</td></tr><tr><td>2</td><td></td></tr><tr><td>3</td><td>0.9</td></tr>
  </table>
</div>
```

- Spec `type` is `line` (default), `bar`, or `scatter`. Use `series: [{name, data, role?, color?}]` or a single `data` array. Each point is `[x,y]`, `[x,y,label]`, `{x,y,label?,key?}`, or a bare y with zero-based x or a corresponding `categories` entry. Text x values or explicit categories give discrete slots. Bar x is categorical. Optional `markedCategories` adds asterisks to matching categories. Six default series colours, then gray. `role` takes precedence over `color`. Table series headers accept `data-df-role` and `data-df-color`.
- For `type: 'pie'`, use `data: [{label, value, key?, role?, color?}]`. Each slice needs a nonempty label, a finite nonnegative value, and a unique key (defaults to the label). The visible slices determine the total used for percentages. Use `y` to label and format values. In a pie table, `data-df-key` on a value cell assigns its slice key.
- `title`, `height` (pixels, default 260, must exceed 80), `table: false` to suppress the Table button. `x` and `y` accept a label string or `{label, min, max, digits, unit, type}`. Markup overrides type via `data-df-chart`, and spec fields via `data-df-height`, `data-df-x-label`, `data-df-y-label`, `data-df-x-type`, `data-df-y-type`, `data-df-gaps`, `data-df-reference-lines` (JSON), `data-df-selection-group`, `data-df-toggles`, `data-df-brush`, and `data-df-rescale`.
- Line and scatter x can use `type: 'time'`. Values, bounds, and x reference lines take epoch milliseconds or ISO date-times with `Z` or an offset. Display is UTC. Invalid times warn and are skipped or ignored. `type: 'log'` on either line or scatter axis uses base 10 and requires positive axis values, bounds, and reference values. Invalid log specs warn and preserve the initial fallback or last valid chart.
- Line `gaps: 'break'` breaks at explicit `null` or a blank y cell at a valid x. That position stays in the readout and table. An omitted x joins across the interval. `referenceLines: [{axis, value, label}]` adds dashed x or y guides in the same scale, without extending it. The legend names guides that are off scale or outside the selected range.
- Pointer movement and plot focus with arrows or Home/End inspect data. For linked selection set `selectionGroup: 'trace'` or `data-df-selection-group="trace"`. Add `key` to point objects or `data-df-key` to the corresponding series cells. Click, Enter, or Space toggles the key. The group retains selection across redraws, filtering, and table view. Handled selections leave [figure zoom](../interact/figure-zoom.md) closed.
- Add `data-df-toggles` (or set `toggles: true`) to enable legend buttons for multiple series or for pie slices. Marks fade, move, or resize as visibility changes. Reduced-motion settings apply changes immediately. Table and readout follow what is visible.
- `brush: true` enables drag-to-narrow on a continuous x axis with a nonzero domain. On the focused plot, `+` or `=` zooms in, `-` zooms out, and Shift+Left/Right pans an existing range. Reset range clears it. `rescale: true` fits y to the visible values while retaining fixed y bounds. By default y keeps its full-data scale.
- `DocForm.chart.mount(idOrElement, options?)` enhances a host with a spec, table, or named source. It returns the controller, including for an already mounted host, or `null` on failure. `DocForm.chart.get(idOrElement)` retrieves the controller or `null`. `validate(spec)` returns validation errors. `fromTable(rows, type?, keys?)` converts header-first arrays, optionally with a parallel matrix of point keys. Use the controller's `update` to tell whether a replacement was accepted.
- Controller `update(spec)` returns true on success or false when validation fails. Hidden series survive by name if still present in a multi-series chart. A narrowed range survives when the x kind matches and the range can be clamped to the new data. Preserve the original `spec()` object to restore a chart's authored source table. Table mode stays active when supported by the replacement spec.
- Controller `model()` and `spec()` return detached copies. `snapshot()` gives `{hiddenSeries, range, table}`. Use `setSeriesVisible(key, on)`, `setRange([lo, hi])`, or `setRange(null)`. Time ranges use timestamps. `subscribe(fn, {immediate: true}?)` and bubbling `df:chart:view` report reader state changes with `current`, `previous`, and `origin`. `coords(clientX, clientY)` returns `{x, y, xText, yText, plot}` over the visible plot for the zoom crosshair.

## Named source

- Set `data-df-source="name"` on a chart host and enable `data`. Put `mapping` under `options.chart.instances[id]`. Use `{x, series: [{key, field, label?, role?, color?}], pointKey?}`. `x` is a field or `{field, label?}`. Fields match exact column names. `pointKey` names the record field for keyed selection.
- For a mapped pie chart, use `x` for the slice label field and supply exactly one descriptor in `series` for the slice value field. Optional `pointKey` supplies stable slice keys. A full-spec transform can also supply a pie spec directly.
- For grouped line or scatter observations, use `{x, value, group: {field, series?}, pointKey?}`. Each `group.field` value is a string series key. Optional `group.series: [{key, label?, role?, color?}]` orders and styles present groups. Other present groups follow in key order. The adapter sorts by normalized x within each series, preserves irregular sampling, and rejects duplicate x within a series. Use a record filter to select one metric and split before grouping. Grouped local file input uses the same mapping and rejects oversized input.
- Add instance `filter: {scope, fields, where?}` to bind a named source to [scoped record filters](data-blocks.md#record-filters), or use `filter: {where}` for fixed predicates. A local record upload follows the filter. A full chart spec passed to `update(spec)` remains active until Reset, which uses the latest source and scope values.
- Use an optional named `transform` to derive fields, or `transformOutput: "spec"` for a full spec. Keep series keys stable across label changes. Source-free series can derive keys from unique names.
- `DocForm.chart.get(target)` accepts an ID or element. `update(spec)` installs a validated local spec. `reset()` restores the authored input or latest shared data and clears local chart controls. Shared replacement preserves hidden series by key, compatible ranges, and Table mode when supported. Include an authored table for a fallback with an inline or mapped spec.

## Supplied uncertainty

- Point objects accept `interval: {lower, upper, label?, count?}`. Bounds are finite, ordered, in y units, and positive on log y. Count is a nonnegative integer when supplied. For named sources, set `interval: {lower, upper, label?, count?}` on each column-series descriptor or on the grouped mapping. Lower, upper, and count identify exact source fields and must supply numbers. Two null bounds omit the interval. A null count omits the count.
- Bounds contribute to automatic y scales. Lines draw bands across contiguous bounded samples and whiskers for isolated intervals. Bars and scatter draw whiskers. Exact readings and table rows include supplied bounds, label, and count. Gaps, brush, and playback constrain the displayed geometry. Invalid updates preserve the last accepted chart.

## Shared x position

- Set `data-df-x-group="training-step"` on mounted continuous linear-x charts with common x units. Pointer inspection shares the position in data units and keyboard inspection shares the actual sample x. Followers show the cursor where their viewport includes it and keep their own brush and scale.
- `DocForm.chart.xGroup(name)` returns the group's controller or `null`. Use `snapshot()` for `{x}` (null when clear), `set(finiteNumber)`, `clear()`, and `subscribe(fn, {immediate: true}?)`. `df:chart:x` on `document` carries `{group, current, previous, origin}`. A [playback controller](chart-playback.md) can drive the reveal across the group.

[Dropzone replacement and Reset](dropzones.md) · [Scenarios](../interact/scenarios.md) · [Training example](../../../examples/transformers/pages/diagnostics.html#guided-training) · [Source](../../js/chart.js)
