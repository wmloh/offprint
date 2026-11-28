# Sankey diagrams

Enable `"chart-sankey": true` in site or page `features`. Use `data-op-chart="sankey"` with a JSON spec, or pass `{type: "sankey", ...}` to the [chart API](charts.md). Keep an authored fallback table inside the host.

```html
<div id="flows" data-op-chart="sankey" data-op-selection-group="energy">
  <script type="application/json">
    {
      "value": {"label": "Energy", "unit": " kWh"},
      "nodes": [{"key": "solar", "label": "Solar"}, {"key": "store", "label": "Storage"},
                {"key": "loads", "label": "Loads"}],
      "links": [{"source": "solar", "target": "store", "value": 42, "key": "charge"},
                {"source": "store", "target": "loads", "value": 37, "key": "supply"}]
    }
  </script>
  <table>
    <thead><tr><th>Source</th><th>Destination</th><th>kWh</th></tr></thead>
    <tbody><tr><td>Solar</td><td>Storage</td><td>42</td></tr>
      <tr><td>Storage</td><td>Loads</td><td>37</td></tr></tbody>
  </table>
</div>
```

## Input and layout

- `nodes: [{key, label?, column?, order?, color?, role?}]`, up to 60. Omit `nodes` to infer endpoint keys and labels in first-appearance order. With an explicit list, each endpoint must name a listed node. Keys accept nonempty strings or finite numbers and are stored as strings.
- `links: [{source, target, value, key?, color?, role?}]`, up to 200. Values take positive finite numbers or numeric text. Parallel links are allowed. Keys are unique across nodes and links. Generated link keys combine the endpoint pair and its ordinal among links with that pair. Author stable keys for selection and motion when reordering parallel links.
- Columns start at zero. Each automatic column is one beyond its latest predecessor, or zero for a source. Set `column` to an integer from 0 to 59 to place a node explicitly. Every link must move to a later column. Invalid input keeps the authored fallback and warns in the console. The cycle warning lists the keys in the loop.
- Within each column, nodes with a finite `order` come first, sorted in ascending order with input order breaking ties. Other nodes follow alternating weighted barycentre sweeps. Equal scores preserve the current order.
- Ribbons use a shared scale for all values and have a 1px minimum. Node totals are the larger of incoming and outgoing volume. Ribbon ends are centred on each side of the node. OffPrint grows `height` when needed to fit all minimum widths and node spacing.
- `linkColor` is `"source"` (default), `"target"`, or `"role"` (gray for links without a role or colour). An explicit link `role` or palette `color` takes precedence in any mode. Nodes use their own role or palette colour, then the chart palette.
- `value` accepts a label string or `{label, unit, digits}`. The chart also accepts `title`, `height`, `table: false`, and shared motion and selection options.

## Reading and selection

- Hover a node to trace its ancestors and descendants. The readout gives incoming and outgoing totals. Intermediate nodes whose totals differ have dashed outlines, and the readout and table give the direction and size of the difference. Source and destination nodes have their own status.
- Hover a ribbon for its value, its share of source outflow, and its share of destination inflow. On the focused plot, arrow keys walk nodes in column order and then links in record order. Home and End jump to the endpoints of that reading order.
- Enable `selection` and give the chart a selection group to toggle a node or ribbon with click, Enter, or Space. Table view lists node totals and individual links in two keyed tables. Interactive export restores the group’s selected key and the active table or plot view. Reader export captures the current view as static content.
- Nodes, labels, and ribbons tween by key when the spec or source changes. `motion: false` or `data-op-animate="false"` disables chart motion.

## Named sources

- Enable `data`. Set `data-op-source` and configure `options.chart.instances.<id>.mapping` with `{source, target, value, pointKey?, role?, color?}` field names. Each row contributes one link. Use the inline JSON to supply node labels, order, columns, or colours. Without explicit node records, endpoint values become the labels.
- `transformOutput: "spec"` can provide a full spec including `type: "sankey"`. Invalid source updates keep the last valid chart.

[SVG charts](charts.md) · [Named data](data-blocks.md) · [Source](../../js/chart-sankey.js)
