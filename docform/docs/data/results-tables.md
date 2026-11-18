# Results tables

Load `css/results.css` and `js/results.js` after core. Use `table[data-df-results]` with a header and body. Enhancement reads the final `thead` row and first `tbody`. Use unspanned column headers and regular rows for interactive columns.

```html
<table data-df-results data-df-filters data-df-chips="Within budget: latency &lt;= 25">
  <thead><tr><th>Model</th><th data-df-column="latency" data-df-best="min"
    data-df-heat-range="0, 40" data-df-threshold="&lt;= 25" data-df-threshold-label="Budget">Latency (ms)</th></tr></thead>
  <tbody><tr><th scope="row">Baseline</th><td>12 ms</td></tr></tbody>
</table>
```

- Header sort cycles best/largest first for numbers, earliest first for dates, alphabetic first for text, then reverse and authored order. Ties preserve authored order and missing values sort last. `data-df-no-sort` or a spanning header disables its button. Numbers can include units, currency, thousands separators, percent, or a spread such as `92.1 ± 0.3`. `data-df-value` supplies a cell's comparison text without changing its display.
- `data-df-best="min|max"` marks the best values, including ties. Table `data-df-heat` shades numeric columns after the first. Header `data-df-heat` selects a column and optionally direction, or `"false"` opts out. Direction uses header heat, header best, table heat, then max. `data-df-heat-color` on table or header overrides the blue tint. An increasing `data-df-heat-range="0, 40"` enables fixed shading and clamps values to the endpoints.
- Header `data-df-threshold="<= 25"` adds Pass or Fail for numeric values, with `<`, `<=`, `>`, `>=`, `≤`, or `≥`. Uses the comparison value, including `data-df-value`. Missing values stay unclassified. `data-df-threshold-label` names the displayed rule (default `Pass`). Invalid ranges and rules warn and are ignored.
- `data-df-filters` enables all eligible columns. `data-df-filter` opts in one header and `data-df-no-filter` or `data-df-filter="false"` opts it out. Text uses value checkboxes, numeric columns use inclusive Min/Max, and ISO dates use From/To. Zoneless times are UTC. `data-df-filter="values"` forces checkboxes. Blank bounds are open. Setting a bound excludes missing values.
- `data-df-chips="Label: Column op value & Other = a | b; Next: Column > 2"` defines named predicates with `=`, `!=`, `<`, `<=`, `>`, `>=` (also `≠`, `≤`, `≥`). Separate chips with semicolons. `|` alternatives apply to `=` and `!=`. Match column by `data-df-column` or header text, case-insensitive. Text equality is case-insensitive and whole-cell. Invalid chips warn and are skipped.
- Column filters and enabled chips combine with AND. Clear clears both. Sorting and verdicts persist while filtering. Relative heat and best marks recompute over visible rows. [Data-block](data-blocks.md) filters operate on loaded rows and restore by column name and chip label after Show more or replacement within that block. Without JS the source table stays readable.
- `DocForm.results.enhance(table)` initializes an inserted table. `DocForm.results.filters(table)` returns a controller when there are column filters or valid chips, otherwise `null`. Use `set(column, {min,max})` with numbers or epoch milliseconds, `set(column, {excluded: [...]})` for value lists, `set(column, null)` to clear one, `chip(label[, on])`, `clear()`, and `shown()`. `df:filter` bubbles from the table on setup and refresh with `{shown, total}`. `DocForm.results.bar(table)` returns its filter bar if present.

[Concept tables](concept-tables.md) · [Dropzone targets and load order](dropzones.md) · [Wide wrappers](../layout/wide.md) · [Run filter example](../../../examples/transformers/pages/diagnostics.html#run-filters) · [Source](../../js/results.js)
