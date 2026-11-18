# SVG animations

Enable `animation`. Mount in `DocForm.setup` when a figure-step panel needs the controller at startup. Supply a readable authored SVG and caption.

```js
DocForm.setup(({ animation }) => {
  animation.mount('trace', {
    caption: 'Ready to trace.',
    steps: [
      { key: 'path', caption: 'Draw the path.', actions: [{ draw: '#path' }] },
      { key: 'marker', caption: 'Move the marker.', actions: [{ move: '#dot', to: [60, 0] }] }
    ]
  });
});
```

- Steps use `{key, actions, caption?, duration?, easing?}`. Use distinct keys and reserve `start`. Each action's `draw`, `fade`, `move`, or `attr` value is a selector scoped to the figure. `draw` reveals a stroke using `pathLength="1"`. `fade` changes opacity. `move` takes `to: [x, y]` in CSS pixels. `attr` takes `name` and `to`. Use `from` to override the start. Otherwise the previous destination carries forward. Initial defaults are `[0, 0]` for `move`, the authored value for `attr`, and 0 for a draw or fade to a positive value (1 otherwise).
- Steps run in order. Actions in a step can overlap with independent `delay` and `duration` in milliseconds. Duration and easing fall back from action to step to options, then `800` and `ease`. Named easings include `linear`, `ease-in`, `ease-out`, `ease-in-out`, and `back-out`. Playback `hold` defaults to 700 ms between steps.
- Controls play, pause, advance, rewind, and scrub. Mouse or pen entry can start playback. Pausing with the play button suppresses this until pointer exit. `data-df-animation-autoplay` takes precedence over the `autoplay` option. When enabled, a 50% intersection observer starts playback from the beginning. [Figure step panels](figure-steps.md) take over playback. The `caption` option gives the starting text. [Math](../reading/math.md) renders `$…$` in captions when loaded.
- `DocForm.animation.mount(idOrElement, options)` returns the controller. `get(idOrElement)` looks it up. Controller methods include `play()`, `pause()`, `next()`, `prev()`, `seek(ms)`, and `reset()` to pause at `start`. `go(key)` jumps to the end of a step. `to(key)` animates the final leg. Read the detached `timeline` and live `figure` and `svg`.
- `snapshot()` returns `{key, index, completed, time}`. The start has index 0, the first authored step has index 1, and time is in milliseconds. `subscribe(fn, {immediate: true}?)` observes displayed step changes. `df:animation:step` bubbles from the figure with `{current, previous, origin}` on initial render and displayed step changes.
- Paint SVG with `.df-stroke`, `.df-fill`, or `.df-fill-bg` and `data-df-color` or `data-df-role`. `.df-grid`, `.df-axis`, and `.df-muted` provide neutral paint.

[Figure steps](figure-steps.md) · [Parameters](parameters.md) · [Zoom](figure-zoom.md) · [Source](../../js/anim.js)
