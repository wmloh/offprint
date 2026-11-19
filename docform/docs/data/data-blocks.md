# Named sources and data views

Enable `data` for the registry, `data-view` for raw views, and each consuming feature. `data-view` includes `data`. Enable `results`, `code`, or `tree` for optional table, code, or tree enhancements. [Include order](../setup/include-order.md)

```html
<script type="text/csv" data-df-source="runs">
  run,latency_ms
  r01,12
</script>
<div id="runs-preview" data-df-source="runs" data-df-data-view="table">
  <table data-df-results>
    <thead><tr><th>run</th><th data-df-field="latency_ms" data-df-best="min">Latency (ms)</th></tr></thead>
    <tbody><tr><td>r01</td><td>12</td></tr></tbody>
  </table>
</div>
```

## Source registry

- `DocForm.data.define(name, input)` registers a source and returns its controller or `null`. Input is `{type: 'csv'|'json'|'yaml', text}` or `{type: 'value', value}`. Typed values must be acyclic JSON-compatible data with finite numbers. Register them in `DocForm.setup`. Names are trimmed and case-sensitive. The first accepted definition wins.
- Other inputs include inert scripts with `data-df-source` and a data MIME type, `pre[data-df-source]` with optional `data-df-source-type`, and offline `window.DocFormData` wrappers. The entry loads manifest `assets.data[name].output` wrappers before setup. Authored raw text and static markup provide fallbacks. An invalid raw definition retains its text for the error display and leaves the name available.
- `DocForm.data.source(name)` looks up a controller. `names()` lists sources in registration order. A controller exposes `snapshot()`, `update(input)`, `reset()`, and `subscribe(fn, {immediate: true}?)`. The immutable snapshot is `{name, type, value, text, revision}`. CSV values are typed records and keep the original text. A typed value has `text: null`. Subscriptions receive `(current, {previous, origin})` and return an unsubscribe function.
- An update prepares every bound view before committing. A parse, transform, mapping, or cap rejection leaves the prior revision and rendered views intact. An identical payload succeeds without incrementing the revision. Reset restores the first accepted input. Local view overrides stay visible across shared updates, and their Reset reveals the latest source. `df:data:change` fires on `document` after bound views commit with `{source, current: {revision, type}, previous, origin}`.
- `DocForm.data.defineTransform(name, fn)` registers a synchronous transform in setup. Set an instance's `transform` to its name. It receives `(sourceSnapshot, {host, mapping})` and returns a JSON-compatible value for the adapter. Use `transformOutput: "spec"` for a complete chart spec, results or matrix `{records, mapping}`, scenario `{records, mapping, mode?}`, or raw-view `{type, text|value}` input. Keep transforms free of DOM and controller writes.
- `parse(text, type?)` throws on invalid text and returns `{type, value}` for JSON/YAML or `{type, columns, rows, cells}` for CSV. `table(parsed)` returns `{columns, cells}` for flat data or `null`. `valueOf(parsed)` returns the typed value. Quoted CSV fields preserve text, including embedded newlines, and unquoted leading-zero identifiers stay text. YAML accepts one core-schema document.

## Record filters

- Named chart and results instances accept `filter: {scope: "evaluation", fields: {runs: "run"}, where: {split: "test"}}`. Keys under `fields` name `select` or `multiselect` parameters and their values name exact record fields. `where` matches fixed typed scalars and can stand alone. Enable `parameters` for scope bindings.
- Comparisons are type-exact. Choices within one multiselect combine with OR. Different fields and fixed predicates combine with AND. Empty choices match zero rows. Filters apply to record transforms before view mapping. Full-spec transforms handle any filtering themselves.
- Source and local record replacements are validated against the current scope. Scope updates prepare all bound views before committing the controls and views together. An incompatible update preserves the old state. Reset of the scope restores defaults, while Reset of a local override restores the latest shared data under the current filters.

[Held-out results example](../../../examples/transformers/pages/diagnostics.html#heldout-results)

## Raw rendering

- `data-df-data-view="auto|table|code|tree"` selects the view. Auto renders tabular data as a table and other values as code. A nested table request or a missing tree feature falls back to code. Typed values display as JSON in code mode.
- Raw table instances may use `mapping: {columns: [{field, label?}]}`. Authored `data-df-field` headers select exact fields. Legacy templates can match header text case-insensitively and display blanks for missing optional columns. Without a template or mapping, columns follow source order.
- Use `maxSize` or `data-df-max-size` (default 1 MiB), and `maxRows` or `data-df-max-rows` (default 5000). Initial oversized raw views offer Show anyway. Tables and code load in batches with Show more. Tree limits apply per branch.
- `DocForm.dataView.mount(target, options?)` and `get(target)` accept an ID or element. The controller exposes `update(input)` for a local override, `reset()`, `snapshot()`, and `subscribe()`. The view snapshot is `{name, view, total, shown}` with null counts where unavailable. `df:data-view:render` bubbles after the view and any nested enhancements are ready.

[File wrappers](file-wrapper.md) · [Charts](charts.md) · [Results](results-tables.md) · [Scenarios](../interact/scenarios.md) · [Dropzones](dropzones.md) · [Example](../../../examples/transformers/pages/diagnostics.html#shared-runs)
