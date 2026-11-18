# Scenario comparisons

Enable `scenarios`, which includes `chart`. Use a table with one `thead` row of unspanned headers, a `tbody`, and columns ordered measure, unit, baseline, then one or more uniquely named variants.

```html
<table data-df-scenarios>
  <caption>Effect of changing the alert limit</caption>
  <thead><tr><th>Measure</th><th>Unit</th><th>Baseline</th><th>Lower limit</th></tr></thead>
  <tbody>
    <tr data-df-condition><th scope="row">Limit</th><td>kPa</td><td>10</td><td>8</td></tr>
    <tr><th scope="row">Alerts</th><td></td><td>2</td><td>3</td></tr>
  </tbody>
</table>
```

- Each row needs a measure name and complete baseline and variant values. No spans or `tfoot`. Mark conditions with `data-df-condition`. Other rows are numeric outcomes, with unique names within each unit. Put units, including `%`, in the unit column, and leave it blank for unitless values.
- Bare `data-df-scenarios` requires exactly one changed condition per variant. `data-df-scenarios="configurations"` allows one or more and lists the changes in authored order. Bundled outcomes describe the combined changes.
- The generated chooser displays the baseline and one variant, plus marked differences and a text summary. Each unit gets a bar chart with a scale shared across every variant. Reset reselects the first variant in table order. Without JS, or if validation or the chart dependency fails, the full source table remains visible.
- With `data-df-source="name"`, enable `data` and declare `options.scenarios.instances[id].mapping` with `recordKey`, `baselineKey`, ordered `variantKeys`, optional `labels` by record key, and `conditions` and `outcomes` arrays of `{field, label?, unit?}`. Fields match exactly. For standalone tables, put `data-df-key` on baseline and variant headers for stable keys.
- `DocForm.scenarios.get(target)` looks up the controller by ID or element. `select(key)` changes the variant. `update(records)` or `update({records, mapping, mode?})` installs a local override. `reset()` restores the current source or authored table and selects the first variant. `snapshot()` gives `{key, index, label, total}`. Use `subscribe()` or `df:scenarios:change` to follow the selection. Shared replacements retain the selected variant when its key still exists.

[Charts](../data/charts.md) · [Source](../../js/scenarios.js)
