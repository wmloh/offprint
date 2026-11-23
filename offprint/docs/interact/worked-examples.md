# Worked-example steppers

Enable `stepper`. Use a nonempty `ol[data-op-stepper]` with an ID. Each direct `li` needs a unique `data-op-key` and a direct child with `data-op-step-label` and nonempty text.

```html
<ol id="delivery" data-op-stepper data-op-selection-group="trace">
  <li data-op-key="send" data-op-initial><strong data-op-step-label>Send</strong> Start the timer.</li>
  <li data-op-key="retry" data-op-detail="retry-note"><strong data-op-step-label>Retry</strong> Reuse the same ID.</li>
</ol>
<p id="retry-note">The timeout has expired.</p>
```

- A right-aligned [step pill](../layout/buttons.md#step-pill) before the list (Reset, Previous step, `Step n of m` status, Next step) shows one step at a time; ends set `aria-disabled` and keep focus. Without scripts every step stays visible. The authored initial item is marked `data-op-initial`, or defaults to the first step. Companion views anywhere on the page match by list ID and key and follow the local item. Invalid sequences, unenhanced sequences, and their companions remain visible.
- Optional `data-op-detail` points to an external note by ID. To bind multiple companion views, give each `data-op-stepper-view="list-id"` and the matching `data-op-key`.
- Use `OffPrint.sequence.get(idOrList)` for the [shared controller and event](step-contract.md).
- For a highlighted trace, use the same selection group on the stepper, chart and passive rows. Match each step key to its chart point and row keys. The row remains visible when another key is selected.

[Source](../../js/stepper.js)
