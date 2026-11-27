# Chart annotations

Enable `"chart-annotations": true` in site or page `features` (loads [SVG charts](charts.md)). Add an `annotations` array to any line, bar, scatter, or add-on chart spec, or put the JSON on the host as `data-op-annotations`. Pie charts ignore annotations with a warning.

```html
<div id="load" data-op-chart="line" data-op-brush
  data-op-annotations='[{"type":"range","x":3,"x2":5,"text":"Maintenance"},
    {"type":"marker","x":8,"text":"Release 2.1","color":"green"},
    {"point":"peak","text":"Peak after the cache flush"}]'>
  <script type="application/json">{"series": [{"name": "Load", "data": [[1, 20], {"x": 6, "y": 92, "key": "peak"}, [9, 40]]}]}</script>
</div>
```

## Input

- `annotations: [{type?, text, key?, x?, x2?, y?, y2?, series?, point?, side?, dx?, dy?, color? | role?, revealStep?}]`. `type`: `note` (default), `range`, `marker`. `text`: nonempty. `key`: unique string, default `annotation-<n>`; identifies the annotation across redraws (motion) and in the DOM (`data-op-annotation`).
- Values read on the chart's axes: numbers (numeric text accepted), timestamps on time x (epoch ms or zoned ISO), positive values on log axes, category labels on categorical x (bars, interval plots, string x) and on both heatmap axes (`x` = column, `y` = row). Horizontal bars keep data axes: `x` = category, `y` = value.
- `note`: a callout with a leader line and anchor dot. Anchor: `point` (a point key; `series` narrows the search), else `x` + `y`, else `x` with y from `series` or from the only series, else `x` at the plot top (value-axis end on horizontal bars). Needs `x` or `point`.
- `range`: a shaded band with a label at its top left (beside the band when narrow). `x` + `x2` spans the x axis across the plot; `y` + `y2` the y axis; both pairs make a rectangle. Category ends cover whole bands. Partly visible bands clip to the plot.
- `marker`: a labelled event line. Exactly one of `x` (line across x, label at the top) or `y` (line across y, label at the right end).
- `color` (palette name) or `role` (manifest role) tints the annotation through `--op-accent`; default muted text colour.
- Shape errors (non-array, unknown type or side, empty text, duplicate key, unreadable value, unknown series, missing anchor fields) fail validation like other spec errors. Anchors that do not resolve at draw time are hidden, not errors.

## Placement

- Order: ranges, then markers, then notes, each in authored order. Range and marker labels are fixed; a label that overlaps an earlier one moves down 14px (up to 4 times).
- Note labels wrap to 2 lines of 28 characters; longer text ends in `…` and shows in full in the shared tooltip panel on hover. Candidates: 8 directions (preference top-right, top, right, top-left, bottom-right, left, bottom, bottom-left) × 3 distances (22, 40, 62px), slid back inside the plot. Cost: overlap with mark bounds + 4 × overlap with earlier labels + 3 × area outside the plot + 40 × outside the frame + 40 × over the anchor, plus direction and distance penalties. Lowest wins (greedy).
- `side` limits candidates to one direction. `dx`/`dy` (px) put the label centre at that offset from the anchor and skip the search.
- Marks avoided: every mark in the chart's mark map via `geom.bounds()` ([add-on geometry](../extend/chart-addons.md#layers)). Heatmap cells are not obstacles; contours are.

## Visibility

- Hidden when the anchor or span lies off the plot (outside a brushed range, off a log or categorical axis), when its point's series is hidden by a legend chip, or when its point key or series value is not found. A legend note counts them: `2 annotations not shown: outside the range, on hidden series`.
- Redraws follow brushing, Reset, legend toggles, `update`, named-source replacement, and resizes. With motion on, annotations are marks (`annotation` kind, keyed): kept ones tween, new ones fade in, departing ones fade out; on entrance they fade in last. The layer waits hidden with the marks (`.op-chart-await`).
- Table view adds an `Annotations` table (text, kind, position) after the values. The plot description lists every annotation with its position.

## Reveal steps

- Set `data-op-reveal-sequence="<id>"` on the chart host, naming the element of a [step sequence](../interact/step-contract.md#reveal-steps): figure steps box, stepper list, chart playback list, animation figure, pipeline, or scenario table. `revealStep: "<step key>"` shows the annotation once the sequence reaches that step and keeps it at later steps. Between chart playback checkpoints the last reached checkpoint holds. Unkeyed annotations always show.
- Hidden annotations keep their reserved label positions (no shift when they appear) and fade with `.op-reveal-pending`; their table rows follow. Without the host attribute, `revealStep` warns once and is ignored.
- Reader export: followers of captured figure steps or animations step with that figure; other sequences get their own Reader step controls before the chart, labelled from the sequence items. Interactive export runs the feature and follows the restored sequence.

## Notes

- Classes: `.op-chart-annotations` > `.op-annotation.is-note|is-range|is-marker` with `.op-annotation-leader`, `-anchor`, `-box`, `-text`, `-band`, `-line`, `-label`. Legend `.op-chart-annotation-note`; table `.op-chart-annotations-table`.
- `OffPrint._chartAnnotations` exposes `normalize`, `anchor`, and `placeNote` for tests and custom layers.

[Charts](charts.md) · [Chart add-ons](../extend/chart-addons.md) · [Source](../../js/chart-annotations.js)
