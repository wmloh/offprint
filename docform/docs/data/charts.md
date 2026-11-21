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
- `title`, `height` (pixels, default 260, must exceed 80), `table: false` to suppress the Table button. `x` and `y` accept a label string or `{label, min, max, digits, unit, type}`. Markup overrides type via `data-df-chart`, and spec fields via `data-df-height`, `data-df-x-label`, `data-df-y-label`, `data-df-x-type`, `data-df-y-type`, `data-df-gaps`, `data-df-orientation`, `data-df-stack`, `data-df-reference-lines` (JSON), `data-df-selection-group`, `data-df-toggles`, `data-df-brush`, `data-df-rescale`, and `data-df-animate` (see [Motion](#motion)).
- Line and scatter x can use `type: 'time'`. Values, bounds, and x reference lines take epoch milliseconds or ISO date-times with `Z` or an offset. Display is UTC. Invalid times warn and are skipped or ignored. `type: 'log'` on either line or scatter axis uses base 10 and requires positive axis values, bounds, and reference values. Invalid log specs warn and preserve the initial fallback or last valid chart.
- Line `gaps: 'break'` breaks at explicit `null` or a blank y cell at a valid x. That position stays in the readout and table. An omitted x joins across the interval. `referenceLines: [{axis, value, label}]` adds dashed x or y guides in the same scale, without extending it. The legend names guides that are off scale or outside the selected range.
- Pointer movement and plot focus with arrows or Home/End inspect data. For linked selection set `selectionGroup: 'trace'` or `data-df-selection-group="trace"`. Add `key` to point objects or `data-df-key` to the corresponding series cells. Click, Enter, or Space toggles the key. The group retains selection across redraws, filtering, and table view. Handled selections leave [figure zoom](../interact/figure-zoom.md) closed.
- Add `data-df-toggles` (or set `toggles: true`) to turn the legend into a multiple-choice [chip group](../interact/choices.md) for series or pie slices (chosen = shown; series swatch in each chip). Marks tween as visibility changes (see [Motion](#motion)). Table and readout follow what is visible.
- `brush: true` enables drag-to-narrow on a continuous x axis with a nonzero domain. On the focused plot, `+` or `=` zooms in, `-` zooms out, and Shift+Left/Right pans an existing range. Reset range clears it. `rescale: true` fits y to the visible values while retaining fixed y bounds. By default y keeps its full-data scale.
- `data-df-chart-bind` links bins, orientation, stacking, reference lines, colour bounds, visible series, and the x range to [parameters](../interact/parameters.md#linking-without-scripts); rejected values roll back the parameter update.
- Bubbling `df:chart:view` reports `{current, previous, origin}` with `{hiddenSeries, range, table}` states.

## Bar layout

- `orientation: 'vertical'` (default) or `'horizontal'`; `stack: 'stacked'`, `'percent'`, or `'none'`/`null`/`false` (grouped). Both bar-only: other types warn once (`chart-bar-layout`) and ignore them. Invalid values fail validation. Markup: `data-df-orientation`, `data-df-stack` (values trimmed). Host gains `is-horizontal` / `is-stacked`.
- Horizontal: categories run top to bottom on the left in category order, values across from the zero baseline. Labels wrap at spaces (long words break) into ≤3 lines within ~30% of the width; overflow ends in `…` with an SVG `<title>` of the full text; rows under 13px label every nth category. Without a valid `height`, height = max(120, 36 + 20 per axis label + one row per category: 28px, or 10px per series + 12 when grouped). Axis titles: `x.label` (categories) top-left, `y.label` (values) under the plot.
- Stacked: series stack in series order, positives up/right from zero and negatives down/left; only the outer segment per direction keeps rounded ends; segments get a 1px page-colour hairline. Percent: each category scales to its visible total (100%); ticks and coords text end in `%`; `y.min`/`y.max` ignored with a warning; an all-zero category draws empty. Errors: percent with any negative value; any `interval` on stacked bars. The value axis spans the stacks of all series (hidden included) unless `rescale: true`.
- Readouts: grouped as before; percent rows show `value · share`; stacked and percent add a `Total` row (net sum) when more than one series is visible. Table view: percent cells `value (share)`, plus a `Total` column; stacked charts always generate the table, never the authored source table.
- Hover band, keyboard order, and pointer pick follow the category axis: horizontal reads top to bottom (ArrowDown/Right next) and picks the nearest row, then the nearest bar in it. Keyed selection spots sit at each bar's end (grouped) or segment centre (stacked). Reference lines: `axis: 'y'` marks a value (vertical guide when horizontal), `axis: 'x'` a category (through its centre). Brush stays off: bar x is categorical.
- Changes to orientation or stacking tween each keyed bar to its new place. Legend toggles restack the remaining series with the same tween.

## Motion

- On by default for every chart type, including bar orientation and stacking switches (see [Bar layout](#bar-layout)). Off: spec or `options.chart` / `options.chart.instances[id]` `motion: false`, or host `data-df-animate="false"`. Precedence: attribute > spec `motion` > later option layer (page over site, instance over feature). Non-boolean `motion` reports `chart-option` and is ignored; invalid attribute values report and count as on.
- Entrance: first drawing hides marks (`.df-chart-await` on host, hides `.df-chart-marks`) until host intersects the viewport (or is already above it), then plays once over 700 ms with left-to-right stagger: bars grow from baseline, lines draw from start (`pathLength`/dash, removed after), dots grow from `r: 0`, pie slices sweep from 0°, interval bands and whiskers fade in. Axes, ticks, end labels, and reference lines draw immediately. Hidden tab, Table mode, or zero width: entrance waits for the first real drawing after being seen. Needs `IntersectionObserver`; without it charts draw in place.
- Tweens (240 ms, ease-out) on legend toggles, range brush/keys/Reset, `update`, named-source replacement, and record filtering. Marks match by series key + kind + point `key`, else x (repeats numbered), so keyed points follow their key across reordering. Matched marks morph geometry (`d`, `cx`, `cy`, `r`, `x`, `y`, `width`, `height`, line ends) from the displayed state, plus fill/stroke when the series colour changes. Paths whose commands change (line with different point count) cross-fade. New marks fade in; departing marks fade out under a copy of their series group, lose selection attributes, ignore pointer input, and are removed at the end. A redraw mid-tween starts from the displayed state.
- No motion, applied immediately: `prefers-reduced-motion: reduce`, `print` media, host inside the zoom view (`.df-zoom`), no `requestAnimationFrame`, active [playback](chart-playback.md) playhead, resize redraws, Table→chart switch. Printing finishes running tweens and reveals waiting charts. Print CSS and zoom-lens clones always show `.df-chart-await` marks. No-script pages keep the authored fallback.

## Add-ons

See [Dot and interval plots](chart-intervals.md) for ranked categories with whiskers, [Histograms](chart-histogram.md) for binned distributions on continuous axes, and [Heatmaps](chart-heatmap.md) for colour grids with contours.

[Register a chart add-on](../extend/chart-addons.md).

## Named source

- Set `data-df-source="name"` on a chart host and enable `data`. Put `mapping` under `options.chart.instances[id]`. Use `{x, series: [{key, field, label?, role?, color?}], pointKey?}`. `x` is a field or `{field, label?}`. Fields match exact column names. `pointKey` names the record field for keyed selection.
- For a mapped pie chart, use `x` for the slice label field and supply exactly one descriptor in `series` for the slice value field. Optional `pointKey` supplies stable slice keys. A full-spec transform can also supply a pie spec directly.
- For grouped line or scatter observations, use `{x, value, group: {field, series?}, pointKey?}`. Each `group.field` value is a string series key. Optional `group.series: [{key, label?, role?, color?}]` orders and styles present groups. Other present groups follow in key order. The adapter sorts by normalized x within each series, preserves irregular sampling, and rejects duplicate x within a series. Use a record filter to select one metric and split before grouping. Grouped local file input uses the same mapping and rejects oversized input.
- Add instance `filter: {scope, fields, where?}` to bind a named source to [scoped record filters](data-blocks.md#record-filters), or use `filter: {where}` for fixed predicates. A local record upload follows the filter. Reset uses the latest source and scope values.
- Use an optional named `transform` to derive fields, or `transformOutput: "spec"` for a full spec. Keep series keys stable across label changes. Source-free series can derive keys from unique names.
- Shared replacement preserves hidden series by key, compatible ranges, and Table mode when supported. Include an authored table for a static fallback.

## Supplied uncertainty

- Point objects accept `interval: {lower, upper, label?, count?}`. Bounds are finite, ordered, in y units, and positive on log y. Count is a nonnegative integer when supplied. For named sources, set `interval: {lower, upper, label?, count?}` on each column-series descriptor or on the grouped mapping. Lower, upper, and count identify exact source fields and must supply numbers. Two null bounds omit the interval. A null count omits the count.
- Bounds contribute to automatic y scales. Lines draw bands across contiguous bounded samples and whiskers for isolated intervals. Bars and scatter draw whiskers. Exact readings and table rows include supplied bounds, label, and count. Gaps, brush, and playback constrain the displayed geometry. Invalid updates preserve the last accepted chart.

## Shared x position

- Set `data-df-x-group="training-step"` on mounted continuous linear-x charts with common x units. Pointer inspection shares the position in data units and keyboard inspection shares the actual sample x. Followers show the cursor where their viewport includes it and keep their own brush and scale.
- `df:chart:x` on `document` carries `{group, current, previous, origin}` with `{x}` states. A [playback controller](chart-playback.md) can drive the reveal across the group.

[Dropzone replacement and Reset](dropzones.md) · [Scenarios](../interact/scenarios.md) · [Source](../../js/chart.js)
