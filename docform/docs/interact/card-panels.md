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
- Optional extras, each independent:
  - `data-df-numbered` on `.df-card-panel` adds an `aria-hidden` `.df-step-number` circle counting 1..N across groups, tinted by the panel accent. A card's `data-df-number` replaces its value, and an integer value restarts the count from it.
  - Direct `.df-tag` children of a card button move into a right-aligned `.df-step-tags` slot outside the bold label copy. Use a manifest role (`data-df-role`) or a custom `data-df-color` with the required `data-df-tip`. Without JS they stack right-aligned under the label.
  - `data-df-search` on `.df-card-panel` inserts a filter `input` before `.df-step-list`; its value is the placeholder and label (default "Filter cards"). Every whitespace-separated term must appear in the card's text, including its tags. Non-matching cards and empty groups get `.df-step-filtered`; selection stays until a visible card is picked, and the highlight hides meanwhile. Down moves from the box to the first match, Up from the first match returns, and Esc clears. A `role="status"` line reports no matches. Filtered cards stay in page search.
- Details use the shared [detail pane](detail-panes.md) behaviour (`detail-pane` loads with `cards`). A separate `.df-detail-pane` elsewhere can follow the panel with `data-df-detail-for="<panel id>"` and keys matching the card keys.
- `DocForm.cards.get(idOrHost)` returns the [item controller](linked-highlighting.md) or `null`. Snapshot `{key, index, detailId}` uses a zero-based index. `df:cards:change` bubbles from the host with `{current, previous, origin}`.

[Tabs](tabs.md) · [Figure steps](figure-steps.md) · [Detail panes](detail-panes.md) · [Pipelines](pipelines.md) · [Code blocks](../reading/code.md) · [Source](../../js/steps.js)
