# Worked-example steppers

Enable `stepper`. Use a nonempty `ol[data-df-stepper]` with an ID. Each direct `li` needs a unique `data-df-key` and a direct child with `data-df-step-label` and nonempty text.

```html
<ol id="delivery" data-df-stepper data-df-selection-group="trace">
  <li data-df-key="send" data-df-initial><strong data-df-step-label>Send</strong> Start the timer.</li>
  <li data-df-key="retry"><strong data-df-step-label>Retry</strong> Reuse the same ID.</li>
</ol>
<p data-df-stepper-view="delivery" data-df-key="retry">The timeout has expired.</p>
```

- A right-aligned [step pill](buttons.md#step-pill) before the list (Reset, Previous step, `Step n of m` status, Next step) shows one step at a time; ends set `aria-disabled` and keep focus. Without scripts every step stays visible. The authored initial item is marked `data-df-initial`, or defaults to the first step. Companion views anywhere on the page match by list ID and key and follow the local item. Invalid sequences, unenhanced sequences, and their companions remain visible.
- `DocForm.stepper.get(idOrList)` returns the [item controller](linked-highlighting.md) or `null`. Snapshot `{key, index, label, total}` uses a zero-based index. `df:stepper:change` bubbles from the list with `{current, previous, origin}`.
- For a highlighted trace, use the same selection group on the stepper, chart and passive rows. Match each step key to its chart point and row keys. The row remains visible when another key is selected.

[PCA linked trace example](../../../examples/pca/pages/telemetry.html#incident-timeline) · [Source](../../js/stepper.js)
