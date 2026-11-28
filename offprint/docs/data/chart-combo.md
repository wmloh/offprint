# Combo charts

Enable `"chart-combo": true` in site or page `features` (loads [SVG charts](charts.md)). Use `data-op-chart="combo"` or spec `type: "combo"`. Each series draws as bars or a line over one categorical or time x axis; an opt-in second value axis (`y2`) sits at the right.

```html
<div data-op-chart="combo" data-op-toggles>
  <script type="application/json">{"y": {"label": "Builds", "unit": " builds"}, "y2": {"label": "Pass rate", "unit": "%"},
    "stack": "stacked", "series": [
      {"name": "Passed", "data": [["Jan", 42], ["Feb", 48]]}, {"name": "Failed", "data": [["Jan", 8], ["Feb", 7]]},
      {"name": "Pass rate", "mark": "line", "axis": "y2", "data": [["Jan", 84], ["Feb", 87.3]]}]}</script>
</div>
```

## Input

- Series as in [charts](charts.md) plus `mark: "bar"` (default) | `"line"` and `axis: "y"` (default) | `"y2"`. One value per series and x. No intervals, `gaps`, or log axes. At least one series on `y`.
- x: categories (text or numeric-looking values stay categories in first-appearance order; `categories` sets the order) or `x: {type: "time"}` (epoch ms or zoned ISO, UTC). Other `x.type` values are errors.
- `y`, `y2`: `{label, unit, digits, min, max}`; linear only. `y2` exists only when a series sets `axis: "y2"`; otherwise `y2` settings warn once (`chart-y2-unused`) and are ignored.
- `stack: "stacked"` stacks bars per axis in series order (positives up, negatives down); `"none"`/`null`/`false` (default) groups every bar series side by side. `"percent"` and `orientation` other than vertical are errors. Markup: `data-op-stack`; [parameter binding](../interact/parameters.md#linking-without-scripts) target `stack`.
- Table markup: header cells take `data-op-mark` and `data-op-axis` beside `data-op-role`/`data-op-color`. Named sources: column-series descriptors take `mark` and `axis` (`{key, field, label?, mark?, axis?}`); grouped mappings are not supported.

## Axes

- Both axes include zero; `min > 0` or `max < 0` on either is an error. With a second axis, zero sits at one height on both (the range with less room below zero widens); grid lines follow the left axis. The baseline is drawn at zero.
- Units guard: one-time warning `chart-y2-units` when `y.unit` and `y2.unit` match or either is missing.
- An axis with one series is tinted with its colour (`.op-chart-axis.is-tinted`) and, when unlabelled, takes the series name as its label; an axis shared by several series stays neutral. Tick labels sit in `g.op-chart-axis.is-y` / `.is-y2`; the y2 label is top-right.
- Default scales cover every series (hidden ones too); `rescale: true` fits both axes to the visible series.

## Marks and reading

- Bars: one slot per bar series (grouped) or per axis (stacked) within each category band or time slot; on time x, the slot is the smallest x spacing. Lines run through slot centres above the bars; dots at each reading (radius 0 past 24 readings unless keyed with a selection group).
- Readout per x: every visible series with value in its axis units and a `left`/`right` tag (`.op-chart-axis-tag`) when y2 exists; the read series is `is-current`. Categorical x shades the band.
- Legend: keys mirror the mark (`is-bar` or line); with y2 each item gets a `left`/`right` tag. `toggles` hides series; stacks re-form from visible bars.
- Table view (`.op-chart-combo-table`): x column, one column per series with a header tag `Left axis · <label>` / `Right axis · <label>` when y2 exists, plus a `Total` column per axis with more than one stacked bar series. Lists readings inside a brushed range.
- Description names bar and line series and each axis's series, label, and unit.

## Interaction

- `brush: true` on time x narrows the range (drag, `+`/`-`, Shift+arrows). Bars partly inside stay (clipped); lines keep the readings just beyond each end. Categorical x has no brush.
- `selectionGroup` + point `key`: click, Enter, or Space selects. Motion: bars, lines, and dots tween by series key + kind + point key, including grouped ↔ stacked and data updates; a series switched between bar and line cross-fades.
- [Annotations](chart-annotations.md): a note on a point or series reads on that series' axis; `axis: "y2"` reads an annotation's `y`/`y2` on the right axis.
- Keyed-state [playback](chart-playback.md) checkpoints and Interactive export restore hidden series, range, and table mode.

`OffPrint._chartCombo` exposes `barLayout`, `axisExtent`, and `secondAxis` for tests.

[Charts](charts.md) · [Chart add-ons](../extend/chart-addons.md) · [Source](../../js/chart-combo.js)
