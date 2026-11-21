# Timeline diagrams

Enable `timeline` (loads `detail-pane`). Use `figure.df-timeline` with a direct `ol.df-timeline-events`, an optional direct `.df-detail-pane`, and an optional `figcaption`.

```html
<figure class="df-timeline" id="release">
  <ol class="df-timeline-events">
    <li data-df-key="draft" data-df-lane="Writing" data-df-start="2026-06-01"
        data-df-end="2026-06-03" data-df-label="Draft chapter">1–3 June · Draft chapter</li>
    <li data-df-key="review" data-df-lane="Review" data-df-start="2026-06-04"
        data-df-label="Review">4 June · Review</li>
  </ol>
  <div class="df-detail-pane">
    <p data-df-key="draft">Write and illustrate the chapter.</p>
    <p data-df-key="review">Check the figures and captions.</p>
  </div>
  <figcaption>Chapter schedule</figcaption>
</figure>
```

- Events use a unique `data-df-key` or ID, `data-df-label` or text content as the label, required `data-df-start`, optional `data-df-end`, and optional `data-df-lane` (default Events). Equal endpoints or an omitted end draw a point. A later end draws a span.
- Use finite numbers or ISO calendar dates (`YYYY-MM-DD`) throughout one diagram. Dates are parsed in UTC. The linear axis runs from the earliest start to the latest end. Supply numeric units in the caption.
- Lanes follow first occurrence. Earlier starts come first within each lane, with ties in input order. Overlapping spans or labels use separate rows. Long labels appear in full in the button's accessible name and tooltip.
- Select by hovering, clicking, tapping, or using Enter or Space. Left and Right select the previous or next event in lane order. Home and End select the first or last event. Initial selection is the first event unless a markup item has `data-df-initial` or the linked group supplies a matching key.
- Direct detail panes link automatically. External panes use `data-df-detail-for="<timeline id>"`. Detail children use event keys.
- Enable `selection` and set `data-df-selection-group` on the host for linked views. Supports `data-df-selection-mode="both|publish|follow"` and `data-df-selection-seed`.
- The time axis fills the figure width and scrolls inside narrow figures. Enable `zoom-tools` and set `data-df-zoom` on the figure for background-click fullscreen and a crosshair with axis and lane readouts. With script disabled or initial data invalid, the authored list stays visible. Include readable times and lanes in that list when needed. Print shows a list of the current events and their dates or numeric positions.

## Named sources

Enable `data` and set `data-df-source="name"` on the host. An optional authored list serves as fallback. Supply a nonempty flat record array with unique string `key`, `start`, and optional `end`, `label`, and `lane`. Missing labels use the key. Quote ISO dates in YAML. Use `options.timeline.mapping` in site or page options to override field names, for example `{"key":"id","start":"from","end":"through","lane":"team"}`.

Source replacement and reset preserve the selected key when present, otherwise use a matching followed group key or the first event. Invalid replacements are rejected by the source transaction. The timeline follows the shared source's size and row limits.

## API

`DocForm.timeline.get(idOrHost)` returns the selector or `null`. Methods `select(key)`, `reset()`, `snapshot()`, `subscribe(fn, {immediate?})`. Snapshot `{key, index, label, lane, start, end}`; date positions are UTC milliseconds. `df:timeline:change` bubbles with `{current, previous, origin}`.

[Detail panes](../interact/detail-panes.md) · [Linked selection](../interact/linked-highlighting.md) · [Named data sources](../data/data-blocks.md)
