# Card panels

Enable `cards`. Place the selector and details directly inside `.df-card-panel`. Label the `.df-step-list` with `aria-labelledby` and pair every button with exactly one direct detail child by its unique ID.

```html
<div class="df-card-panel">
  <div class="df-step-panel" data-df-color="blue">
    <p id="setup-title" class="df-step-heading">Setup options</p>
    <div class="df-step-list" aria-labelledby="setup-title">
      <button type="button" data-df-key="local-setup" data-df-detail="local-setup">Local file</button>
      <button type="button" data-df-key="shared-setup" data-df-detail="shared-setup">Shared folder</button>
    </div>
  </div>
  <div class="df-step-details">
    <div id="local-setup">Open your local copy.</div>
    <div id="shared-setup">Open the copy on the shared drive.</div>
  </div>
</div>
```

- The list can mix direct buttons with `.df-step-group` wrappers containing direct buttons and an optional `.df-step-group-heading`. Group labels describe their tabs. Mark the local start with `data-df-initial` or use the default first card.
- Moving a mouse or pen over a card selects it. Click or tap also selects. Up, Down, Home, and End move focus across all groups. Enter or Space selects the focused card. The generated vertical tablist and tabpanels retain inactive details in the DOM as inert, preserving the state of nested widgets.
- At a container width of 33rem or more, selector and details scroll independently under `--df-step-pane-max` (default `min(22rem, 38svh)`). Below 33rem, the active detail flows below the selector. All details appear with JS disabled and in print. Invalid pairings leave the authored layout and warn.
- `DocForm.cards.get(idOrHost)` returns the [item controller](linked-highlighting.md) or `null`. Snapshot `{key, index, detailId}` uses a zero-based index. `df:cards:change` bubbles from the host with `{current, previous, origin}`.

[Tabs](tabs.md) · [Figure steps](figure-steps.md) · [Code blocks](../reading/code.md) · [Source](../../js/steps.js)
