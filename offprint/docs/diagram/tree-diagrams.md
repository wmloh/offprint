# Tree diagrams

Enable `tree-diagram` (loads `detail-pane`). Use `figure.op-tree-diagram` with a direct list `.op-tree-diagram-nodes`, an optional direct `.op-detail-pane`, and an optional `figcaption`.

```html
<figure class="op-tree-diagram" id="plan">
  <ul class="op-tree-diagram-nodes">
    <li data-op-key="release">
      <span class="op-tree-diagram-label">Release</span>
      <ul>
        <li data-op-key="docs"><span class="op-tree-diagram-label">Write docs</span></li>
        <li data-op-key="tests"><span class="op-tree-diagram-label">Run checks</span></li>
      </ul>
    </li>
  </ul>
  <div class="op-detail-pane">
    <p data-op-key="release">Prepare the release.</p>
    <p data-op-key="docs">Update the examples.</p>
    <p data-op-key="tests">Run the smoke tests.</p>
  </div>
  <figcaption>Release work breakdown</figcaption>
</figure>
```

- Each node has a unique `data-op-key` or ID, a direct `.op-tree-diagram-label`, and optionally one direct child list. Multiple roots are allowed. Roots and siblings retain input order.
- Branch disclosure buttons expand and collapse descendants. Visible branches animate to their new positions. Add `data-op-collapsed` to start a branch closed.
- Hover over a node, or click, tap, or press Enter or Space on its label to select it. Up and Down move through visible nodes in depth-first order. Right expands or moves to the first child. Left collapses or moves to the parent. Home and End select the first and last visible nodes.
- Initial selection uses the first node, a node marked `data-op-initial`, or a matching followed group key. Selecting a hidden key opens its ancestors. Collapsing a branch containing the selection selects the branch instead.
- Inline details link automatically. External panes use `data-op-detail-for="<figure id>"`. Detail children match node keys.
- Enable `selection` and set `data-op-selection-group` to link views. Supports `data-op-selection-mode="both|publish|follow"` and `data-op-selection-seed`.
- Horizontal overflow stays inside the figure. Enable `zoom-tools` and add `data-op-zoom` to the figure for background-click fullscreen with every [zoom tool](../interact/zoom-tools.md) except measure. The authored hierarchy remains visible without script or on invalid initial input.

## Named sources

Enable `data` and set `data-op-source="name"` on the figure. Supply a flat array with unique string `key`, optional string `parent`, optional `label`, and optional Boolean `collapsed`. An empty or omitted parent denotes a root. Parents may appear anywhere in the array. Use `options.tree-diagram.mapping` to override field names. The authored list is optional fallback. Source replacements keep the selected key and the disclosure state of surviving branches when possible. Unknown parents, cycles, and invalid keys reject the transaction.

## Events

`op:tree-diagram:change` bubbles from the diagram with `{current, previous, origin}` and `{key, index, label, parent}` states. The root has `parent: null`.

[Detail panes](../interact/detail-panes.md) · [Linked selection](../interact/linked-highlighting.md) · [Named data sources](../data/data-blocks.md)
