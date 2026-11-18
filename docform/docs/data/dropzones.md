# Local file dropzones

Load `css/dropzone.css` and `js/dropzone.js` with the [data and view assets](data-blocks.md). `js/data.js` must precede `js/dropzone.js`. For a static results-table target, put `dropzone.js` before `results.js` so the authored header is captured before enhancement. A chart target also needs `chart.css` and `chart.js`. Use an ID on the target or its wrapper.

```html
<div id="run-config" data-df-data="config" data-df-view="tree"></div>
<div data-df-dropzone data-df-accept="json yaml" data-df-target="run-config">
  <p>Drop a replacement configuration file.</p>
</div>
```

- Drop or choose one local file. FileReader reads it locally. The zone uses its authored content as a prompt, or generates one. Without JS the prompt stays visible. `data-df-accept` accepts type names separated by spaces or commas (default CSV, JSON, YAML). Extensions take priority, MIME only when no extension is present. Both `.yaml` and `.yml` are accepted as YAML. Unsupported types, multiple dropped files, and files larger than `data-df-max-size` (default 1 MiB) are rejected.
- No `data-df-target` displays the file under the zone with its `data-df-view`, `data-df-max-rows`, `data-df-max-size`, and `data-df-tree-depth` options. Reset clears that output.
- For a chart, tabular files use the first column as x and subsequent columns as series. The chart keeps its type, axis labels and kinds, reference lines, and role/colour for matching series names. Fixed bounds are dropped, and table rows are capped by the zone's `data-df-max-rows`. A JSON/YAML object with a `series` array can override spec fields. Reset reapplies the original spec, enabling the authored source table again when the view is unfiltered. Chart visibility and range follow the ordinary update rules.
- For an existing data block, replacement uses the target's view, limits, and header. Reset restores its original entry. For a static results table, the file must be tabular. Replacement uses a new data block with the captured header and results options, and Reset reinstates the original table and filter bar with their prior state.
- `DocForm.dropzone.accepted`, `fileType`, and `check(file, types, maxBytes)` expose type and size checks. `chartSpec(parsed, base, maxRows)` returns `{spec, rows, total}` for testing or custom adapters, with null counts for supplied chart specs.

[Data blocks](data-blocks.md) · [Charts](charts.md) · [Results tables](results-tables.md) · [File wrapper](file-wrapper.md) · [Chart replacement example](../../../examples/transformers/pages/diagnostics.html#training-history) · [Source](../../js/dropzone.js)
