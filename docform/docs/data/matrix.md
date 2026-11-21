# Evaluation matrices

Enable `features.matrix`, which includes `base` and `data`. Bind a table to a named source. Keep a caption and authored table sections for scripts-off reading and initial source failures.

```html
<table id="confusion" data-df-matrix data-df-source="counts">
  <caption>Next-token classes</caption>
  <thead><tr><th scope="col">Actual class</th><th scope="col">Predicted common</th></tr></thead>
  <tbody><tr><th scope="row">Common</th><td>10 (100%)</td></tr></tbody>
</table>
```

Set `options.matrix.instances.confusion.mapping`.

```json
{
  "row": "actual", "column": "predicted",
  "rows": [{"key": "common", "label": "Common"}],
  "columns": [{"key": "common", "label": "Predicted common"}],
  "measures": [
    {"key": "count", "field": "count", "label": "Count"},
    {"key": "share", "field": "share", "label": "Row share", "unit": "%",
     "range": [0, 100], "normalization": "Share of actual class"}
  ]
}
```

- Records use exact field names, e.g. `{"actual":"common","predicted":"common","count":10,"share":100}`. Axis and measure descriptors are ordered and need unique keys and nonempty labels. Each coordinate is unique and declared on both axes. All mapped measure values must be finite numbers or null. Absent coordinates and null values display as Missing. Zero displays as a value.
- All cells of the active measure share a color scale from finite extents or an authored increasing `range`. Authored ranges clamp color while cell text retains the supplied number. A constant extent uses a neutral tone. A single-choice [chip group](../interact/choices.md) (`.df-matrix-picker`, legend Measure) appears for multiple measures and is rebuilt when measures change. `unit` is a suffix and `normalization` describes the supplied basis. Supply percentages as numbers in percent units. The component displays supplied normalization.
- Standard input size and row limits apply. Set `maxCells` or `data-df-max-cells` to a positive integer dense-grid cap (default 5000). Record transforms can supply rows or use `transformOutput: "spec"` for `{records, mapping}`.
- Shared replacements retain a compatible measure. Bubbling `df:matrix:change` reports `{current, previous, origin}` with `{key, index, label, total}` states.

[Named data](data-blocks.md) · [Confusion matrix example](../../../examples/transformers/pages/diagnostics.html#token-confusion) · [Source](../../js/matrix.js)
