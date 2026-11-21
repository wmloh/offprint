# Detail panes

Enable `detail-pane` (also loaded by `cards`, `figure-steps`, and `pipeline`). A `.df-detail-pane` shows one direct child at a time, matched by its unique `data-df-key`.

```html
<div class="df-detail-pane" data-df-detail-for="setup-cards">
  <div data-df-key="local-setup" data-df-initial>Open your local copy.</div>
  <div data-df-key="shared-setup">Open the copy on the shared drive.</div>
</div>
```

- Source, first match wins: `data-df-detail-for="<id>"` of a [card panel](card-panels.md), [figure-step](figure-steps.md) wrapper, or [pipeline](../diagram/pipelines.md) host; else `data-df-selection-group` (needs `selection`; clearing the group keeps the current detail); else none (API only). A direct child of a `.df-pipeline` is linked to that pipeline automatically.
- Starts on `data-df-initial` or the first child. Unknown keys keep the current detail, so the pane never empties. Inactive children stay mounted and `inert` (nested widgets keep state) and get `tabindex="0"` when unset.
- Screen: children overlap in one grid cell so the longest sets the height, capped by `--df-detail-pane-max` (default `min(22rem, 38svh)`); each scrolls on its own with the shared hover scrollbar (`.df-scrollport`, `.df-scrollbar-hover`). No script and print: all children stacked with dividers.
- `DocForm.detailPane.get(idOrPane)` → `{show(key), snapshot(), subscribe}` or `null`; `snapshot()` → `{key, detailId}`. `DocForm.detailPane.mount(idOrPane, {source?})` mounts a pane added later. `df:detail-pane:change` bubbles from the pane with `{current, previous, origin}` (`source`, `group`, `api`, `init`).
- Diagnostics: missing or duplicate child keys, missing source element, unavailable selection group. A source element that never mounts leaves the pane on its initial child silently.
- Custom sources: `DocForm._detail.source(host, controller)` with `snapshot().key` and `subscribe(fn)`.

[Card panels](card-panels.md) · [Pipelines](../diagram/pipelines.md) · [Source](../../js/detail.js)
