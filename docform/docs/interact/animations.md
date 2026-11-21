# SVG animations

Enable `animation`. Mount in `DocForm.setup` when a figure-step panel needs the controller at startup. Supply a readable authored SVG and caption.

```js
DocForm.setup(({ animation }) => {
  animation.mount('trace', {
    label: 'Ready to trace.',
    steps: [
      { key: 'path', label: 'Draw the path.', actions: [{ draw: '#path' }] },
      { key: 'marker', label: 'Move the marker.', actions: [{ move: '#dot', to: [60, 0] }] }
    ]
  });
});
```

- Steps use `{key, actions, label?, detail?, initial?, duration?, easing?}`. Use distinct keys and reserve `start`. Each action's `draw`, `fade`, `move`, or `attr` value is a selector scoped to the figure. `draw` reveals a stroke using `pathLength="1"`. `fade` changes opacity. `move` takes `to: [x, y]` in CSS pixels. `attr` takes `name` and `to`. Use `from` to override the start. Otherwise the previous destination carries forward. Initial defaults are `[0, 0]` for `move`, the authored value for `attr`, and 0 for a draw or fade to a positive value (1 otherwise).
- Steps run in order. Actions in a step can overlap with independent `delay` and `duration` in milliseconds. Duration and easing fall back from action to step to options, then `800` and `ease`. Named easings include `linear`, `ease-in`, `ease-out`, `ease-in-out`, and `back-out`. Playback `hold` defaults to 700 ms between steps.
- Controls play, pause, advance, rewind, and scrub. Mouse or pen entry can start playback. Pausing with the play button suppresses this until pointer exit. `data-df-animation-autoplay` takes precedence over the `autoplay` option. When enabled, a 50% intersection observer starts playback from the beginning. [Figure step panels](figure-steps.md) take over playback. The top-level `label` option gives the starting text. [Math](../reading/math.md) renders `$…$` in captions when loaded.
- A direct `ol[data-df-animation-steps]` may supply keyed step metadata. Give each `li` a `data-df-key` matching a step (or `start`), a direct `[data-df-step-label]` child, optional `data-df-detail` pointing to an external note, and optional `data-df-initial`.
- `DocForm.animation.mount(idOrElement, options)` returns the [shared controller](step-contract.md). Its `select(key)` seeks to the end of a step. Animation also exposes `to(key)` to animate the final leg, `seek(ms)` to scrub, current `time` in milliseconds, the detached `timeline`, and live `figure` and `svg`.
- Paint SVG with `.df-stroke`, `.df-fill`, or `.df-fill-bg` and `data-df-color` or `data-df-role`. `.df-grid`, `.df-axis`, and `.df-muted` provide neutral paint.

[Figure steps](figure-steps.md) · [Parameters](parameters.md) · [Zoom](figure-zoom.md) · [Source](../../js/anim.js)
