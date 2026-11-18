# Scenario comparisons

Load `css/chart.css` and `css/scenarios.css`. Load `js/chart.js` before `js/scenarios.js`, after core. Use a table with one `thead` row of unspanned headers, a `tbody`, and columns ordered measure, unit, baseline, then one or more uniquely named variants.

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

[Charts](../data/charts.md) · [Source](../../js/scenarios.js)
