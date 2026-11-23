# Card panels

Enable `cards`. Place the selector and details directly inside `.op-card-panel`. Label the `.op-step-list` with `aria-labelledby` and pair every button with exactly one direct detail child by its unique ID.

```html
<div class="op-card-panel">
  <div class="op-step-panel" data-op-color="blue">
    <p id="setup-title" class="op-step-heading">Setup options</p>
    <div class="op-step-list" aria-labelledby="setup-title">
      <button type="button" data-op-key="local-setup" data-op-detail="local-setup">Local file</button>
      <button type="button" data-op-key="shared-setup" data-op-detail="shared-setup">Shared folder</button>
    </div>
  </div>
  <div class="op-step-details">
    <div id="local-setup">Open your local copy.</div>
    <div id="shared-setup">Open the copy on the shared drive.</div>
  </div>
</div>
```

- The list can mix direct buttons with `.op-step-group` wrappers containing direct buttons and an optional `.op-step-group-heading`. Group labels describe their tabs. Mark the local start with `data-op-initial` or use the default first card.
- Moving a mouse or pen over a card selects it. Click or tap also selects. Up, Down, Home, and End move focus across all groups. Enter or Space selects the focused card. The generated vertical tablist and tabpanels retain inactive details in the DOM as inert, preserving the state of nested widgets.
- At a container width of 33rem or more, selector and details scroll independently under `--op-step-pane-max` (default `min(22rem, 38svh)`). Below 33rem, the active detail flows below the selector. All details appear with JS disabled and in print. Invalid pairings leave the authored layout and warn.
- Optional extras, each independent:
  - `data-op-numbered` on `.op-card-panel` adds an `aria-hidden` `.op-step-number` circle counting 1..N across groups, tinted by the panel accent. A card's `data-op-number` replaces its value, and an integer value restarts the count from it.
  - Direct `.op-tag` children of a card button move into a right-aligned `.op-step-tags` slot outside the bold label copy. Use a manifest role (`data-op-role`) or a custom `data-op-color` with the required `data-op-tip`. Without JS they stack right-aligned under the label.
  - `data-op-search` on `.op-card-panel` inserts a filter `input` before `.op-step-list`; its value is the placeholder and label (default "Filter cards"). Every whitespace-separated term must appear in the card's text, including its tags. Non-matching cards and empty groups get `.op-step-filtered`; selection stays until a visible card is picked, and the highlight hides meanwhile. Down moves from the box to the first match, Up from the first match returns, and Esc clears. A `role="status"` line reports no matches. Filtered cards stay in page search.
- Details use the shared [detail pane](detail-panes.md) behaviour (`detail-pane` loads with `cards`). A separate `.op-detail-pane` elsewhere can follow the panel with `data-op-detail-for="<panel id>"` and keys matching the card keys.
- `op:cards:change` bubbles from the host with `{current, previous, origin}` and `{key, index, detailId}` states. The index is zero-based.

[Tabs](tabs.md) · [Figure steps](figure-steps.md) · [Detail panes](detail-panes.md) · [Pipelines](../diagram/pipelines.md) · [Code blocks](../reading/code.md) · [Source](../../js/steps.js)
