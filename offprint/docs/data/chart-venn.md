# Venn diagrams

Enable `"chart-venn": true` in `features`. Use `data-op-chart="venn"` with a JSON spec, or pass `{type: "venn", ...}` to the [chart API](charts.md). Keep an authored fallback inside the host.

```json
{
  "sets": [
    {"key": "collected", "label": "Collected", "members": ["S01", "S02", "S03"], "color": "blue"},
    {"key": "reviewed", "label": "Reviewed", "members": ["S02", "S03"], "color": "green"}
  ],
  "regionOptions": [{"sets": ["collected", "reviewed"], "key": "reviewed", "revealStep": "review"}]
}
```

## Input

- `sets: [{key, label?, color?, role?, members?}]`, exactly two or three. Role takes precedence over a named palette colour. Keys and members accept trimmed nonempty strings or finite numbers, stored as strings. Repeated members count once per set.
- Supply `members` for every set, or omit every `members` field and supply `regions: [{sets, count, key?, revealStep?}]`. Each count is a nonnegative safe integer. Each nonempty `sets` tuple names exactly the sets its members belong to. A missing tuple contributes zero. Duplicate tuples, repeated or unknown set keys, duplicate region keys, and mixed input modes are errors.
- For member mode, `regionOptions: [{sets, key?, revealStep?}]` applies metadata to derived regions. The default key is `'region:' + JSON.stringify(sortedSetKeys)`, stable under tuple and set reordering. All keys must be unique within the chart.
- Circle sizes are schematic. Nonempty equal sets share one circle and one legend entry. Empty sets appear in the legend. Disjoint sets separate and strict subsets nest where the circle topology allows it. If the pattern requires a different boundary shape, the chart warns and draws the classic overlap with zero-count areas hatched.

## Reading and export

- Hover a region to read its exclusive count and, in member mode, up to eight identifiers and the remaining count. Arrow keys browse visible regions. Home and End jump to the first and last.
- Enable `selection` and set `data-op-selection-group` to select by region key with click, Enter, or Space. Table view includes every exclusive region, including zeros, with the same keys. Use `table: false` to hide the switch.
- Set `data-op-reveal-sequence="<sequence-id>"` on the chart to reveal regions cumulatively by `revealStep`. Region fills, count labels and table rows follow the sequence. Circle outlines keep their position. Reader export captures reveal steps in the current chart or table view. Interactive export restores linked selection and view state.
- Standard chart `title`, `height`, and `motion` options apply.

## Named sources

Enable `data` and set `data-op-source`. Put the set descriptors in the chart spec. Give `options.chart.instances.<id>.mapping` the fields `{sets, count, pointKey?, revealStep?}`. Each row supplies one exclusive region. The membership field can be a single key, keys joined with `|`, or a JSON array encoded as text for keys containing `|` or starting with `[`. Optional mapped fields may be blank. A named-source transform with `transformOutput: "spec"` can also supply a complete member-list spec.

[SVG charts](charts.md) · [Named data](data-blocks.md) · [Reveal steps](../interact/step-contract.md) · [Source](../../js/chart-venn.js)
