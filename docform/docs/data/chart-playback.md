# Guided chart playback

Enable `features["chart-playback"]`, which includes `chart`. Give the numeric linear-x line chart a plain ID. For several charts, assign a shared `data-df-x-group` and target that group. The first mounted member in document order supplies the reference domain. Members share x units and can sample independently. Each chart can belong to one playback controller.

```html
<ol id="walkthrough" data-df-chart-playback data-df-target="loss-chart">
  <li data-df-key="schedule" data-df-x="400">
    <strong data-df-step-label>Learning rate starts to decay</strong>
    This checkpoint falls between measurements.
  </li>
</ol>
```

- On `ol[data-df-chart-playback]`, use `data-df-target` (or `target`) or `data-df-x-group` (or `xGroup`). Direct list items take precedence as a complete checkpoint list. Use distinct keys and finite strictly increasing x values inside the full reference domain, including endpoints. A stop can fall between samples or within a gap.
- List items accept a direct `data-df-step-label` child and optional `data-df-detail` pointing to an existing HTML note by plain ID. With no direct items, use `options["chart-playback"].instances[id].checkpoints: [{key, x, label?, detailId?}]`. Give each note one owner. Keep notes outside chart hosts and independent of other checkpoints. Notes stay visible before enhancement, with scripts off, or when playback is unavailable.
- Controls: the [step pill](../interact/buttons.md#step-pill) above the list, in order Reset, Previous, status, Play/Pause, Next. Play animates (or resumes) toward the next stop or end; the same button shows Pause while playing and freezes the playhead. Next jumps straight to the next stop, finishing a running leg. Previous jumps backward and Reset returns to the start. Play and Next are disabled at the end. Set positive `duration` or `data-df-duration` in milliseconds per leg (default 800). Reduced motion makes Play arrive immediately. Controls use `aria-disabled` and keep focus at boundaries, and arrival updates the polite status and the note's `aria-current="step"`.
- The playhead clips line and interval geometry while preserving axis scales and brush ranges. Readouts, selection, and Table mode expose reached samples. Connected charts can share inspection up to the playhead. On reference replacement, playback restores the last reached key if valid, or returns to start. Incompatible replacements suspend playback and restore the ordinary charts and notes until compatibility returns.
- With `selection` enabled, `data-df-selection-group` publishes reached keys and jumps to matching incoming keys, subject to the usual selection mode. Only a checkpoint at the domain start can seed the group.
## State mode

Opt in with `data-df-chart-playback="state"` (or `mode: "state"`; default `"playhead"`; unknown modes report). Checkpoints set keyed chart states on one non-line chart (bar, pie, scatter, histogram, heatmap, interval) instead of moving a playhead. The line playhead mode is unchanged.

```html
<ol data-df-chart-playback="state" data-df-target="scores" data-df-scope="look">
  <li data-df-key="focus" data-df-state='{"series": ["b"], "params": {"bins": 12}}'>
    <strong data-df-step-label>Only run B</strong> …
  </li>
  <li data-df-key="peak" data-df-state='{"select": "bin:4:6", "range": [2, 8]}'>…</li>
</ol>
```

- State fields, all optional: `series` (visible series keys: key, array, `[]`, or `null` for all), `select` (key or `null` to clear, committed to the chart's own selection group), `range` (`[lo, hi]` on a continuous x axis or `null`), `params` (nonempty object of values for the scope the list resolves to via `data-df-scope`/`data-df-parameter-scope`, else `page`). Markup: `data-df-state` JSON per item (no `data-df-x`). Options: `checkpoints: [{key, label?, detailId?, series?, select?, range?, params?}]`. Other fields, `x`, bad JSON, duplicate keys, empty lists, x-group targets, line charts, series or ranges that do not fit the mounted chart, unknown parameter keys, `select` without a chart selection group (or sharing the playback list's group), and params without `parameters` reject the controller and leave the chart free.
- Order is authored order. Each checkpoint changes only what it names; later checkpoints inherit earlier values. Start (position 0, before the first checkpoint) is the state captured at mount for each field any checkpoint names, so Previous and Reset restore it exactly, including parameter values. Fields no checkpoint names stay reader-controlled.
- Play applies the next state at once, so marks, legend filtering, and bound parameter updates tween while the leg runs for `duration` ms; then the note shows. Pause and Next arrive immediately. Reduced motion skips the leg; chart motion follows its own opt-outs.
- Data replacement (update, named source, bound parameter) restores the applied state's `series` and `range` before drawing; a running leg continues. States that no longer fit keep the reader view. Incompatible replacements (line type, invalid data, removed chart) suspend playback as in playhead mode and restore the last reached checkpoint when compatible again. A rejected parameter write reports and the rest of the state still applies.
- Snapshot `x` is the position (0 start, `i + 1` for checkpoint `i`, unchanged during a leg). Status reads the label, else `Checkpoint N`. A playback selection group never seeds from state mode.

## API

- `DocForm.chartPlayback.mount(idOrElement, options?)` is idempotent and returns a controller or `null`. `get(idOrElement)` looks up a mounted controller. Methods `play()`, `pause()`, `next()`, `prev()`, `select(key)`, and `reset()` return acceptance booleans; `next()` jumps without animation. `snapshot()` gives `{x, key, index, total, state}`, with zero-based authored index, nullable key and index between stops, and state `paused|playing|ended`. Suspension sets x to null. `subscribe(fn, {immediate: true}?)` and bubbling `df:chart-playback:change` report startup and transport changes with current, previous, and origin.

[Charts](charts.md) · [Training example](../../../examples/transformers/pages/diagnostics.html#guided-training) · [Source](../../js/chart-playback.js)
