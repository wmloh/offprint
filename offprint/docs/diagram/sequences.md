# Sequence diagrams

Enable `sequence` (loads `detail-pane`). Use `figure.op-sequence` with a direct `ol.op-sequence-messages`, optional direct `ul.op-sequence-participants` and `.op-detail-pane`, and an optional `figcaption`.

```html
<figure class="op-sequence" id="checkout">
  <ul class="op-sequence-participants">
    <li data-op-key="shop">Shop</li>
    <li data-op-key="bank">Payment service</li>
  </ul>
  <ol class="op-sequence-messages">
    <li data-op-key="charge" data-op-from="shop" data-op-to="bank"
        data-op-label="Request payment">Shop → Payment service · Request payment</li>
    <li data-op-key="reply" data-op-from="bank" data-op-to="shop"
        data-op-label="Return result">Payment service → Shop · Return result</li>
  </ol>
  <div class="op-detail-pane">
    <p data-op-key="charge">Send the order reference and total.</p>
    <p data-op-key="reply">Return the authorization result.</p>
  </div>
  <figcaption>Payment request and response</figcaption>
</figure>
```

- Message order follows list order, top to bottom. Use a unique `data-op-key` or ID, sender and receiver keys in `data-op-from` and `data-op-to`, and `data-op-label` or text content. Identical sender and receiver keys draw a loop.
- Participant columns follow the declared list order. Each item has a unique key or ID and a text label. Without the list, participants appear in first-use order, with keys as labels.
- Hover, click, tap, or press Enter or Space to select. Up and Down move through messages, Home and End jump to the boundaries. Initial selection is the first message, a message marked `data-op-initial`, or a matching followed group key.
- Inline details link automatically. External panes use `data-op-detail-for="<figure id>"`. Detail children match message keys.
- Enable `selection` and set `data-op-selection-group` to link views. Supports `data-op-selection-mode="both|publish|follow"` and `data-op-selection-seed`.
- Horizontal overflow stays inside the figure. Enable `zoom-tools` and add `data-op-zoom` to the figure for background-click fullscreen with every [zoom tool](../interact/zoom-tools.md) except measure. Authored lists remain visible without script or on invalid initial input.

## Named sources

Enable `data` and set `data-op-source="name"` on the figure. Supply a nonempty record array with unique string `key`, string `from` and `to`, and optional `label`. Record order determines message order. Use `options.sequence.mapping` to override field names. An authored participants list still sets column order and labels, and records must then use its keys. An optional authored message list serves as fallback. Source replacements retain selection by key and reject invalid records transactionally.

## Events

`op:sequence:change` bubbles from the diagram with `{current, previous, origin}` and `{key, index, label, from, to}` states.

[Detail panes](../interact/detail-panes.md) · [Linked selection](../interact/linked-highlighting.md) · [Named data sources](../data/data-blocks.md)
