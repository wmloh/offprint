# Step sequences

Worked-example steppers, figure steps, guided chart playback, SVG animations, stepped pipelines, and scenario variants share the sequence controller.

## Markup

- Use the component's host and item elements. Give each step a unique, nonempty `data-df-key` and put its label in a direct `[data-df-step-label]` child. Set optional `data-df-detail="plain-id"` to show authored HTML for that step. Mark the initial item with `data-df-initial`. Reset returns to that item or the component's default starting position.
- Enable `selection` and set `data-df-selection-group` on each host. Use matching keys. A mounted sequence follows the group's initial key if it has that key. Matching changes jump to a step. Clear and unmatched keys leave the local step in place. `data-df-selection-mode="both|publish|follow"` controls direction. `data-df-selection-seed` offers the initial key at startup if the sequence starts on a keyed step.
- The generated step pill keeps focus at boundaries. Timed sequences also offer Play/Pause. Native choices in figure steps or scenarios can select a step directly.

## JavaScript

- `DocForm.sequence.get(idOrElement)` returns the mounted controller or `null`. Read `key`, zero-based `index`, and the frozen ordered `keys` array.
- `snapshot()` returns a frozen `{key, index, count, canPrev, canNext}`. Timed controllers add `playing`. Chart tours use `null` for the key and index between checkpoints or when unavailable.
- `select(key)`, `next()`, `prev()`, and `reset()` return whether the action was accepted. Unknown keys and movement past an end return false. Timed controllers add `play()` and `pause()`.
- `subscribe(fn, {immediate: true}?)` calls `fn(snapshot, {previous, origin})` and returns an unsubscribe function. It also reports changes in playback state or navigation availability. The bubbling `df:step` event carries `{key, index, origin}` on initialization and when the active step changes.

```js
DocForm.ready(() => {
  const sequence = DocForm.sequence.get('walkthrough');
  sequence.select('retry');
});
```

[Worked examples](worked-examples.md) · [Figure steps](figure-steps.md) · [SVG animations](animations.md) · [Chart playback](../data/chart-playback.md) · [Pipelines](../diagram/pipelines.md) · [Scenarios](scenarios.md)
