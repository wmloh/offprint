# Sequence diagrams

Enable `sequence` (loads `detail-pane`). Use `figure.df-sequence` with a direct `ol.df-sequence-messages`, optional direct `ul.df-sequence-participants` and `.df-detail-pane`, and an optional `figcaption`.

```html
<figure class="df-sequence" id="checkout">
  <ul class="df-sequence-participants">
    <li data-df-key="shop">Shop</li>
    <li data-df-key="bank">Payment service</li>
  </ul>
  <ol class="df-sequence-messages">
    <li data-df-key="charge" data-df-from="shop" data-df-to="bank"
        data-df-label="Request payment">Shop → Payment service · Request payment</li>
    <li data-df-key="reply" data-df-from="bank" data-df-to="shop"
        data-df-label="Return result">Payment service → Shop · Return result</li>
  </ol>
  <div class="df-detail-pane">
    <p data-df-key="charge">Send the order reference and total.</p>
    <p data-df-key="reply">Return the authorization result.</p>
  </div>
  <figcaption>Payment request and response</figcaption>
</figure>
```

- Message order follows list order, top to bottom. Use a unique `data-df-key` or ID, sender and receiver keys in `data-df-from` and `data-df-to`, and `data-df-label` or text content. Identical sender and receiver keys draw a loop.
- Participant columns follow the declared list order. Each item has a unique key or ID and a text label. Without the list, participants appear in first-use order, with keys as labels.
- Hover, click, tap, or press Enter or Space to select. Up and Down move through messages, Home and End jump to the boundaries. Initial selection is the first message, a message marked `data-df-initial`, or a matching followed group key.
- Inline details link automatically. External panes use `data-df-detail-for="<figure id>"`. Detail children match message keys.
- Enable `selection` and set `data-df-selection-group` to link views. Supports `data-df-selection-mode="both|publish|follow"` and `data-df-selection-seed`.
- Horizontal overflow stays inside the figure. Enable `zoom-tools` and add `data-df-zoom` to the figure for background-click fullscreen with cursor, magnifier, laser, pen, and highlighter. Authored lists remain visible without script or on invalid initial input.

## Named sources

Enable `data` and set `data-df-source="name"` on the figure. Supply a nonempty record array with unique string `key`, string `from` and `to`, and optional `label`. Record order determines message order. Use `options.sequence.mapping` to override field names. An optional authored message list serves as fallback. Source replacements retain selection by key and reject invalid records transactionally.

## API

`DocForm.sequenceDiagram.get(idOrHost)` returns the selector or `null`. Methods `select(key)`, `reset()`, `snapshot()`, `subscribe(fn, {immediate?})`. Snapshot `{key, index, label, from, to}`. `df:sequence:change` bubbles with `{current, previous, origin}`.

[Detail panes](../interact/detail-panes.md) · [Linked selection](../interact/linked-highlighting.md) · [Named data sources](../data/data-blocks.md)
