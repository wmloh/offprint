# Figure zoom

Enable the `zoom` feature. Figures and images inside `.df-page` are triggers. Add `data-df-zoom` to opt in another block or `data-df-no-zoom` to opt out an element and its descendants. A trigger within a figure opens that figure. Timeline, sequence, and tree figures require `data-df-zoom` on the figure to enable click and keyboard zoom.

- Click or focus the zoomable element and press Enter or Space. Escape, backdrop click, and the close button dismiss the dialog. Tab is contained in the open dialog and closing restores focus to the opener. The real element moves into the stage, leaving a sized placeholder, then returns to its prior position. Live controls and figure state move with it.
- Links, form controls, terms and tips, and animation controls are excluded from figure click activation. Chart plot clicks can open the figure unless handled by keyed selection or range brushing. Without JS the figure stays in the page.
- On `document`, `df:zoom:closing` fires before restoration and `df:zoom:change` fires after each commit. Detail is `{current, previous, origin}`. An open state is `{target, overlay, stage}` with live elements. A closed state is `null`.

[Presentation tools](zoom-tools.md) · [Charts](../data/charts.md) · [Source](../../js/zoom.js)
