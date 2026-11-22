# SVG animations

The `animation` feature drives keyed SVG motion with the [shared step controller](step-contract.md). Controls play, pause, advance, rewind, and scrub. Figure-step panels take over playback. On an initialized figure, `data-df-animation-autoplay` opts into playback when at least half the figure enters view.

- Put one direct `script[type="application/json"][data-df-animation]` in the figure. Supply an object with a `steps` array. Each step has a unique `key`, an optional `label`, and an `actions` array. Reserve `start` for the opening state. Set its label in the top-level object. Top-level and step fields also accept `detail` (an HTML element ID) and `initial` (mark one state).
- Actions use one of `draw`, `fade`, `move`, or `attr` with a CSS selector within the first SVG. Draw targets SVG geometry. Draw and fade accept fractional `from` and `to` values, defaulting to a reveal. Move takes a two-number pixel offset for `to` and optionally `from`. Attr takes `name`, `to`, and optionally `from`. Supported attributes are `x y x1 y1 x2 y2 cx cy r rx ry width height d points viewBox transform opacity fill-opacity stroke-opacity stroke-width stroke-dasharray stroke-dashoffset visibility`.
- Times are nonnegative milliseconds. Set `duration` and named `easing` on the animation, a step, or an action. Actions can also set `delay`. Set the pause between steps with top-level `hold`.
- A direct `ol[data-df-animation-steps]` can override metadata. Give each `li` a matching `data-df-key`, a direct `[data-df-step-label]` child, and optionally `data-df-detail` or `data-df-initial`.
- Supply a readable authored SVG and caption. Paint SVG with `.df-stroke`, `.df-fill`, or `.df-fill-bg` and `data-df-color` or `data-df-role`. `.df-grid`, `.df-axis`, and `.df-muted` provide neutral paint.
- Standalone Reader exports step through the endpoints of declarative animations. They retain the step labels and referenced details. The programmatic animation API renders as a static snapshot in Reader.

[Live examples](../../../docs/pages/explain/animations.html) · [Figure steps](figure-steps.md) · [Zoom](figure-zoom.md)
