# Detail panes

Enable `detail-pane` (also loaded by `cards`, `figure-steps`, `pipeline`, `timeline`, `sequence`, and `tree-diagram`). A `.df-detail-pane` shows one direct child at a time, matched by its unique `data-df-key`.

```html
<div class="df-detail-pane" data-df-detail-for="setup-cards">
  <div data-df-key="local-setup" data-df-initial>Open your local copy.</div>
  <div data-df-key="shared-setup">Open the copy on the shared drive.</div>
</div>
```

- Source, first match wins: `data-df-detail-for="<id>"` of a [card panel](card-panels.md), [figure-step](figure-steps.md) wrapper, [pipeline](../diagram/pipelines.md), [timeline](../diagram/timelines.md), [sequence diagram](../diagram/sequences.md), or [tree diagram](../diagram/tree-diagrams.md); else `data-df-selection-group` (needs `selection`; clearing the group keeps the current detail); otherwise the pane stays on its initial child. A direct child pane links to its diagram automatically.
- Starts on `data-df-initial` or the first child. Unknown keys keep the current detail, so the pane never empties. Inactive children stay mounted and `inert` (nested widgets keep state) and get `tabindex="0"` when unset.
- Screen: children overlap in one grid cell so the longest sets the height, capped by `--df-detail-pane-max` (default `min(22rem, 38svh)`); each scrolls on its own with the shared hover scrollbar (`.df-scrollport`, `.df-scrollbar-hover`). No script and print: all children stacked with dividers.
- `df:detail-pane:change` bubbles from the pane with `{current, previous, origin}` and `{key, detailId}` states.
- Diagnostics: missing or duplicate child keys, missing source element, unavailable selection group. A source element that never mounts leaves the pane on its initial child silently.

[Card panels](card-panels.md) · [Pipelines](../diagram/pipelines.md) · [Source](../../js/detail.js)
