# Step sequences

Worked-example steppers, figure steps, guided chart playback, SVG animations, stepped pipelines, and scenario variants share the sequence controller.

## Markup

- Use the component's host and item elements. Give each step a unique, nonempty `data-op-key` and put its label in a direct `[data-op-step-label]` child. Set optional `data-op-detail="plain-id"` to show authored HTML for that step. Mark the initial item with `data-op-initial`. Reset returns to that item or the component's default starting position.
- Enable `selection` and set `data-op-selection-group` on each host. Use matching keys. A mounted sequence follows the group's initial key if it has that key. Matching changes jump to a step. Clear and unmatched keys leave the local step in place. `data-op-selection-mode="both|publish|follow"` controls direction. `data-op-selection-seed` offers the initial key at startup if the sequence starts on a keyed step.
- The generated step pill keeps focus at boundaries. Timed sequences also offer Play/Pause. Native choices in figure steps or scenarios can select a step directly.

## Reveal steps

- Any host can follow a sequence: `data-op-reveal-sequence="<id>"` names the element the sequence is mounted on (the ID `OffPrint.sequence.get` accepts). Descendants with `data-op-reveal-step="<step key>"` show from that step on (cumulative) and fade without layout shift (`.op-reveal-pending`: opacity 0, hidden, no pointer input). Between steps (chart playback between checkpoints) the last reached step holds; before the first, keyed items wait. Unknown step keys warn once and show. A sequence still missing after startup warns once and shows everything.
- Plain HTML hosts mount automatically after startup. [Chart annotations](../data/chart-annotations.md) use `revealStep` on each annotation. Pipelines keep their own `data-op-reveal-step` on blocks.
- Reader export steps followers with captured figure steps or animations; other followers get their own step controls. Internal helper: `OffPrint._revealSteps.follow(host, onChange)` → `{shown(step), apply(scope?), items(), label(step)}`.

## JavaScript

- `OffPrint.sequence.get(idOrElement)` returns the mounted controller or `null`. Read `key`, zero-based `index`, and the frozen ordered `keys` array.
- `snapshot()` returns a frozen `{key, index, count, canPrev, canNext}`. Timed controllers add `playing`. Chart tours use `null` for the key and index between checkpoints or when unavailable.
- `select(key)`, `next()`, `prev()`, and `reset()` return whether the action was accepted. Unknown keys and movement past an end return false. Timed controllers add `play()` and `pause()`.
- `subscribe(fn, {immediate: true}?)` calls `fn(snapshot, {previous, origin})` and returns an unsubscribe function. It also reports changes in playback state or navigation availability. The bubbling `op:step` event carries `{key, index, origin}` on initialization and when the active step changes.

```js
OffPrint.ready(() => {
  const sequence = OffPrint.sequence.get('walkthrough');
  sequence.select('retry');
});
```

[Worked examples](worked-examples.md) · [Figure steps](figure-steps.md) · [SVG animations](animations.md) · [Chart playback](../data/chart-playback.md) · [Pipelines](../diagram/pipelines.md) · [Scenarios](scenarios.md)
