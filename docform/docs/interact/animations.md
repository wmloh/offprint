# SVG animations

Load `css/anim.css` and `js/anim.js` after core. From a later page script call `DocForm.anim(figureIdOrElement, steps, options?)`. Start with a readable authored SVG and `figcaption` for static viewing.

```js
const animation = DocForm.anim('trace', [
  { caption: 'Draw the path.', actions: [{ draw: '#path' }] },
  { caption: 'Move the marker.', actions: [{ move: '#dot', to: [60, 0] }] }
], { caption: 'Ready to trace.' });
```

- Steps are action arrays or `{caption, actions, duration?, easing?}`. Each action's `draw`, `fade`, `move`, or `attr` value is a selector scoped to the figure. `draw` reveals a stroke using `pathLength="1"`. `fade` changes opacity. `move` takes `to: [x, y]` in CSS pixels. `attr` takes `name` and `to`. Use `from` to override the start. Otherwise the previous destination carries forward. Initial defaults are `[0, 0]` for `move`, the authored value for `attr`, and 0 for a draw or fade to a positive value (1 otherwise).
- Steps run in order. Actions in a step can overlap with independent `delay` and `duration` in milliseconds. Duration and easing fall back from action to step to options, then `800` and `ease`. Named easings include `linear`, `ease-in`, `ease-out`, `ease-in-out`, and `back-out`. Playback `hold` defaults to 700 ms between steps.
- Controls play, pause, advance, rewind, and scrub. Mouse or pen entry can start playback. Pausing with the play button suppresses this until pointer exit. `options.autoplay` overrides `data-df-autoplay`. When enabled, a 50% intersection observer starts playback from the beginning. [Figure step panels](figure-steps.md) take over playback. `options.caption` gives step 0 text. [Math](../reading/math.md) renders `$…$` in captions when loaded.
- Controller methods `play()`, `pause()`, `next()`, `prev()`, `go(step)`, `to(step)`, and `seek(ms)`. `go` jumps to the end of a step. `to` animates the final leg if jumping across multiple steps. Step `0` is the start. Read `time`, `step` (completed steps), `timeline`, `figure`, and `svg` or retrieve the controller with `DocForm.anim.get(figureElement)`.
- `df:animstep` fires on the figure when the displayed step changes with `{step, done}` for the displayed step and the count of completed steps. Attach directly to the figure. Paint SVG with `.df-stroke`, `.df-fill`, or `.df-fill-bg` and `data-df-color` or `data-df-role`. `.df-grid`, `.df-axis`, and `.df-muted` provide neutral paint.

[Figure steps](figure-steps.md) · [Parameters](parameters.md) · [Zoom](figure-zoom.md) · [Source](../../js/anim.js)

For [figure steps](figure-steps.md), use `DocForm.animation.mount(figureIdOrElement, {steps, ...options})` with a unique `key` on each step. `DocForm.animation.get(figureIdOrElement)` retrieves that controller. Its `go(key)` and `to(key)` accept a step key or `start` and return false for an unknown key.
