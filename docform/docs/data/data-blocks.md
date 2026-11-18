# Data blocks

Load `css/data.css` and `js/data.js` after core. Load wrapped files and, for YAML, `vendor/js-yaml/js-yaml.min.js` before block setup. For enhanced views, add CSS and JS for `results`, `code`, or `tree` before the first draw. [Include order](../setup/include-order.md)

```html
<script type="text/csv" data-df-data="runs">
  model,latency_ms
  Baseline,12
</script>
<div data-df-data="runs">
  <table data-df-results>
    <thead><tr><th>model</th><th data-df-column="latency_ms" data-df-best="min">Latency (ms)</th></tr></thead>
    <tbody><tr><td>Baseline</td><td>12</td></tr></tbody>
  </table>
</div>
```

- `[data-df-data="name"]` renders a named entry from a [wrapped file](file-wrapper.md), a data script, an earlier inline `pre`, or `DocForm.dataset.add` called before setup. A data script only registers its text, and all data scripts register before hosts render. `pre[data-df-data]` displays raw text without JS, then renders its text and registers the name if free. Give placeholders authored fallback content as needed. `data-df-type="csv|json|yaml"` sets or overrides the type. For inline scripts use a data MIME `type` such as `text/csv`, `application/json`, or `application/yaml`.
- `data-df-view="auto"` (default) renders CSV and nonempty arrays of flat records as tables, other shapes as source code. `table` falls back to code for nested data. `code` always shows the source. `tree` builds a collapsible view with [tree assets](data-trees.md) and otherwise falls back to code. CSV trees map rows to records.
- A table template inside a placeholder selects columns from its last header row by `data-df-column` or header text, with case-insensitive fallback. It preserves header labels and results attributes. Missing columns warn and leave blank cells. Without a template, use all columns in source order. The data module re-enhances generated results tables and code after each draw.
- Per-block caps `data-df-max-size` (default 1 MiB of UTF-8, accepts bytes or sizes like `2 MB`) and `data-df-max-rows` (default 5000). Oversize blocks offer Show anyway. Tables and code start with one batch of rows or lines and Show more adds another batch. Tree limits apply per branch.
- CSV requires a header and matching field counts. Quoting preserves text and allows embedded commas, newlines, and escaped quotes (`""`). Unquoted values can become numbers, booleans, or null. Leading-zero identifiers stay text. Tables use original CSV cell text. JSON uses `JSON.parse`. YAML accepts a single document with the core schema. Parse errors expose the reason, location when available, and raw text.
- `DocForm.dataset.add(name, text, type?)`, `get(name)`, `names()`, `parse(text, type?)`, `table(parsed)`, and `valueOf(parsed)`. `parse` returns `{type, value}` for JSON/YAML or `{type, columns, rows, cells}` for CSV and throws on bad input. `table` returns `{columns, cells}` or `null`. Registered names are read from the local registry first, then from `window.DocFormData` on demand.
- `DocForm.dataset.render(element)` redraws a named block. `show(element, {name, type, text}, template?)` replaces displayed data while retaining an existing block's view, limits, and header. `restore(element)` restores the saved entry and display cap, returning false if there is no saved entry.
- Bubbling `df:datarender` carries `{name, view, rows?, error?}` before results or code enhancement. `rows` is the total rows or lines for table or code output. A size refusal emits `view: null` with `error: 'size'`. Parse errors emit `view: 'raw'` with the error message. Listen for `df:filter` on filter-enabled result tables to get filtered counts.

[File wrapper](file-wrapper.md) · [Data trees](data-trees.md) · [Results tables](results-tables.md) · [Code](../reading/code.md) · [Dropzones](dropzones.md) · [Source](../../js/data.js)
