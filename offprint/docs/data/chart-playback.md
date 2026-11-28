# Guided chart playback

Enable `features["chart-playback"]`, which includes `chart`. Give the numeric linear-x line chart a plain ID. For several charts, assign a shared `data-op-x-group` and target that group. The first mounted member in document order supplies the reference domain. Members share x units and can sample independently. Each chart can belong to one playback controller.

```html
<ol id="walkthrough" data-op-chart-playback data-op-target="loss-chart">
  <li data-op-key="schedule" data-op-x="400">
    <strong data-op-step-label>Learning rate starts to decay</strong>
    This checkpoint falls between measurements.
  </li>
</ol>
```

- On `ol[data-op-chart-playback]`, use `data-op-target` (or `target`) or `data-op-x-group` (or `xGroup`). Direct list items take precedence as a complete checkpoint list. Use distinct keys and finite strictly increasing x values inside the full reference domain, including endpoints. A stop can fall between samples or within a gap.
- List items accept a direct `data-op-step-label` child and optional `data-op-detail` pointing to an existing HTML note by plain ID. With no direct items, use `options["chart-playback"].instances[id].checkpoints: [{key, x, label?, detail?, initial?}]`. Give each note one owner. Keep notes outside chart hosts and independent of other checkpoints. Notes stay visible before enhancement, with scripts off, or when playback is unavailable. Enhanced, only the note of the reached checkpoint shows; during a leg the note of the stop it left stays until arrival, so the list never collapses. Each list item without a `value` gets `value="<n>"` so its number survives hidden siblings.
- Controls: the [step pill](../layout/buttons.md#step-pill) above the list, in order Reset, Previous, status, Play/Pause, Next. Play animates (or resumes) toward the next stop or end; the same button shows Pause while playing and freezes the playhead. Next jumps straight to the next stop, finishing a running leg. Previous jumps backward and Reset returns to the marked `data-op-initial` checkpoint or the start. Play and Next are disabled at the end. Set positive `duration` or `data-op-duration` in milliseconds per leg (default 800). Reduced motion makes Play arrive immediately. Controls use `aria-disabled` and keep focus at boundaries, and arrival updates the polite status and the note's `aria-current="step"`.
- The playhead clips line and interval geometry while preserving axis scales and brush ranges. Readouts, selection, and Table mode expose reached samples. Connected charts can share inspection up to the playhead. On reference replacement, playback restores the last reached key if valid, or returns to start. Incompatible replacements suspend playback and restore the ordinary charts and notes until compatibility returns.
- With `selection` enabled, `data-op-selection-group` publishes reached keys and jumps to matching incoming keys, subject to the usual selection mode. The marked initial checkpoint, or a checkpoint at the domain start, can seed the group.
## State mode

Opt in with `data-op-chart-playback="state"` (or `mode: "state"`; default `"playhead"`; unknown modes report). Checkpoints set keyed chart states on one non-line chart (bar, pie, scatter, histogram, heatmap, interval) instead of moving a playhead. The line playhead mode is unchanged.

```html
<ol data-op-chart-playback="state" data-op-target="scores" data-op-scope="look">
  <li data-op-key="focus" data-op-state='{"series": ["b"], "params": {"bins": 12}}'>
    <strong data-op-step-label>Only run B</strong> …
  </li>
  <li data-op-key="peak" data-op-state='{"select": "bin:4:6", "range": [2, 8]}'>…</li>
</ol>
```

- State fields, all optional: `series` (visible series keys: key, array, `[]`, or `null` for all), `select` (key or `null` to clear, committed to the chart's own selection group), `range` (`[lo, hi]` on a continuous x axis or `null`), `params` (nonempty object of values for the scope the list resolves to via `data-op-scope`/`data-op-parameter-scope`, else `page`). Markup: `data-op-state` JSON per item (no `data-op-x`). Options: `checkpoints: [{key, label?, detail?, initial?, series?, select?, range?, params?}]`. Other fields, `x`, bad JSON, duplicate keys, empty lists, x-group targets, line charts, series or ranges that do not fit the mounted chart, unknown parameter keys, `select` without a chart selection group (or sharing the playback list's group), and params without `parameters` reject the controller and leave the chart free.
- Order is authored order. Each checkpoint changes only what it names; later checkpoints inherit earlier values. Start (position 0, before the first checkpoint) is the state captured at mount for each field any checkpoint names, so stepping back to Start restores it exactly, including parameter values. Fields no checkpoint names stay reader-controlled.
- Play applies the next state at once; marks, legend filtering, and bound parameter redraws tween over the whole leg (`duration` ms, ease-in-out) instead of the chart's 240 ms, and the note shows on arrival. Pause and Next finish the tween and arrive immediately; Previous, Reset, and Next jumps use the normal tween. Reduced motion skips the leg; chart motion follows its own opt-outs.
- Data replacement (update, named source, bound parameter) restores the applied state's `series` and `range` before drawing; a running leg continues. States that no longer fit keep the reader view. Incompatible replacements (line type, invalid data, removed chart) suspend playback as in playhead mode and restore the last reached checkpoint when compatible again. A rejected parameter write reports and the rest of the state still applies.
- `position` is 0 at Start and `i + 1` at checkpoint `i`. It stays unchanged during a leg. Status reads the label or `Checkpoint N`.

## Step controller

- Use `OffPrint.sequence.get(idOrElement)` for the [shared controller](../interact/step-contract.md). Its read-only `position` gives the playhead x value, the state position, or `null` when suspended. `next()` jumps without animation.

[Charts](charts.md) · [Source](../../js/chart-playback.js)
