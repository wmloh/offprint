# SVG animations

The `animation` feature drives keyed SVG motion with the [shared step controller](step-contract.md). Controls play, pause, advance, rewind, and scrub. Figure-step panels take over playback. On an initialized figure, `data-df-animation-autoplay` opts into playback when at least half the figure enters view.

- A direct `ol[data-df-animation-steps]` can supply metadata for existing steps. Give each `li` a matching `data-df-key`, a direct `[data-df-step-label]` child, and optionally `data-df-detail` or `data-df-initial`. Use `start` for the opening state.
- Supply a readable authored SVG and caption. Paint SVG with `.df-stroke`, `.df-fill`, or `.df-fill-bg` and `data-df-color` or `data-df-role`. `.df-grid`, `.df-axis`, and `.df-muted` provide neutral paint.

[Live examples](../../../docs/pages/explain/animations.html) · [Figure steps](figure-steps.md) · [Zoom](figure-zoom.md)
