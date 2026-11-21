# Tree diagrams

Enable `tree-diagram` (loads `detail-pane`). Use `figure.df-tree-diagram` with a direct list `.df-tree-diagram-nodes`, an optional direct `.df-detail-pane`, and an optional `figcaption`.

```html
<figure class="df-tree-diagram" id="plan">
  <ul class="df-tree-diagram-nodes">
    <li data-df-key="release">
      <span class="df-tree-diagram-label">Release</span>
      <ul>
        <li data-df-key="docs"><span class="df-tree-diagram-label">Write docs</span></li>
        <li data-df-key="tests"><span class="df-tree-diagram-label">Run checks</span></li>
      </ul>
    </li>
  </ul>
  <div class="df-detail-pane">
    <p data-df-key="release">Prepare the release.</p>
    <p data-df-key="docs">Update the examples.</p>
    <p data-df-key="tests">Run the smoke tests.</p>
  </div>
  <figcaption>Release work breakdown</figcaption>
</figure>
```

- Each node has a unique `data-df-key` or ID, a direct `.df-tree-diagram-label`, and optionally one direct child list. Multiple roots are allowed. Roots and siblings retain input order.
- Branch disclosure buttons expand and collapse descendants. Visible branches animate to their new positions. Add `data-df-collapsed` to start a branch closed.
- Hover over a node, or click, tap, or press Enter or Space on its label to select it. Up and Down move through visible nodes in depth-first order. Right expands or moves to the first child. Left collapses or moves to the parent. Home and End select the first and last visible nodes.
- Initial selection uses the first node, a node marked `data-df-initial`, or a matching followed group key. Selecting a hidden key opens its ancestors. Collapsing a branch containing the selection selects the branch instead.
- Inline details link automatically. External panes use `data-df-detail-for="<figure id>"`. Detail children match node keys.
- Enable `selection` and set `data-df-selection-group` to link views. Supports `data-df-selection-mode="both|publish|follow"` and `data-df-selection-seed`.
- Horizontal overflow stays inside the figure. Enable `zoom-tools` and add `data-df-zoom` to the figure for background-click fullscreen with cursor, magnifier, laser, pen, and highlighter. The authored hierarchy remains visible without script or on invalid initial input.

## Named sources

Enable `data` and set `data-df-source="name"` on the figure. Supply a flat array with unique string `key`, optional string `parent`, optional `label`, and optional Boolean `collapsed`. An empty or omitted parent denotes a root. Parents may appear anywhere in the array. Use `options.tree-diagram.mapping` to override field names. The authored list is optional fallback. Source replacements keep the selected key and the disclosure state of surviving branches when possible. Unknown parents, cycles, and invalid keys reject the transaction.

## Events

`df:tree-diagram:change` bubbles from the diagram with `{current, previous, origin}` and `{key, index, label, parent}` states. The root has `parent: null`.

[Detail panes](../interact/detail-panes.md) · [Linked selection](../interact/linked-highlighting.md) · [Named data sources](../data/data-blocks.md)
