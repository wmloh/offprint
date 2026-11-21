# Scenario comparisons

Enable `scenarios`, which includes `chart`. Use a table with one `thead` row of unspanned headers, a `tbody`, and columns ordered measure, unit, baseline, then one or more uniquely named variants.

```html
<table data-df-scenarios>
  <caption>Effect of changing the alert limit</caption>
  <thead><tr><th>Measure</th><th>Unit</th><th data-df-key="base">Baseline</th><th data-df-key="lower"><span data-df-step-label>Lower limit</span></th></tr></thead>
  <tbody>
    <tr data-df-condition><th scope="row">Limit</th><td>kPa</td><td>10</td><td>8</td></tr>
    <tr><th scope="row">Alerts</th><td></td><td>2</td><td>3</td></tr>
  </tbody>
</table>
```

- Each row needs a measure name and complete baseline and variant values. No spans or `tfoot`. Mark conditions with `data-df-condition`. Other rows are numeric outcomes, with unique names within each unit. Put units, including `%`, in the unit column, and leave it blank for unitless values.
- Bare `data-df-scenarios` requires exactly one changed condition per variant. `data-df-scenarios="configurations"` allows one or more and lists the changes in authored order. Bundled outcomes describe the combined changes.
- The generated chooser displays the baseline and one variant, plus marked differences and a text summary. Each unit gets a bar chart with a scale shared across every variant. The Variant [choice group](choices.md) (`.df-scenarios-chooser`; chips, or a combobox past seven variants) is followed by a [step pill](../layout/buttons.md#step-pill): Reset (marked initial variant or first in table order), Previous variant, a visual `n of m` count (hidden from assistive tech; the status paragraph announces changes), and Next variant, disabled at the ends. Without JS, or if validation or the chart dependency fails, the full source table remains visible.
- With `data-df-source="name"`, enable `data` and declare `options.scenarios.instances[id].mapping` with `recordKey`, `baselineKey`, ordered `variantKeys`, optional `labels` by record key, optional `initial` variant key, and `conditions` and `outcomes` arrays of `{field, label?, unit?}`. Fields match exactly. On authored tables, require `data-df-key` on baseline and variant headers. A variant header can use `[data-df-step-label]`, `data-df-initial`, and `data-df-detail`.
- A mapped outcome can declare `interval: {lower, upper, label?, count?}` for absolute estimates and `pairedDifference: {field, baselineKeyField, interval?}` for a supplied variant-minus-baseline estimate. Bounds and counts map exact fields as in [charts](../data/charts.md#supplied-uncertainty). Each supplied paired estimate must be finite and name the configured `baselineKey` in its variant's `baselineKeyField`. Its interval is independent of the absolute interval. A null paired estimate with no bounds keeps the ordinary comparison. Invalid paired input rejects the replacement.
- Use `DocForm.sequence.get(idOrElement)` for the [shared step controller and event](step-contract.md). Bubbling `df:scenarios:change` reports `{current, previous, origin}` with `{key, index, label, total}` states. Shared replacements retain the selected variant when its key still exists.

[Charts](../data/charts.md) · [Paired-loss example](../../../examples/transformers/pages/diagnostics.html#paired-loss) · [Source](../../js/scenarios.js)
