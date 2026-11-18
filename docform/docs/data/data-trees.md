# Data trees

Enable `tree` and `data-view` to render a [named source](data-blocks.md). JSON/YAML objects and lists keep their structure. CSV displays as a list of records keyed by header.

```html
<div data-df-source="config" data-df-data-view="tree" data-df-tree-depth="2" data-df-max-rows="100"></div>
```

- Top-level entries are visible. `data-df-tree-depth` sets the number of levels to open (default `1`). Use `0` to start with every branch closed. Arrays use indexes, objects use keys, and scalars display typed text. Each branch or root list shows up to the block's row limit. Show more adds another batch to that list.
- Click to toggle a row. Up/Down move between visible rows. Right opens a branch or enters its children. Left closes it or moves to its parent. Home/End go to the first/last visible row. Enter/Space toggles a branch or activates Show more. `*` expands branches among the current row and its siblings. Expand all opens branches up to each child-list cap. Collapse all closes them.
- `DocForm.tree.build(value, {label?, open?, maxItems?})` returns the DOM widget for direct insertion. `label` provides an accessible tree name. `open` and `maxItems` use the same depth and cap as data-block attributes. Pass nested records, arrays, or scalar values. Without the tree script, a data block requesting `tree` falls back to code.

[Data blocks](data-blocks.md) · [Dropzones](dropzones.md) · [Source](../../js/tree.js)
