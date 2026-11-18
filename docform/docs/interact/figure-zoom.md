# Figure zoom

Load `css/zoom.css` and `js/zoom.js` after core. Figures and images inside `.df-page` are triggers. Add `data-df-zoom` to opt in another block or `data-df-no-zoom` to opt out an element and its descendants. A trigger within a figure opens that figure.

- Click or focus the zoomable element and press Enter or Space. Escape, backdrop click, and the close button dismiss the dialog. Tab is contained in the open dialog and closing restores focus to the opener. The real element moves into the stage, leaving a sized placeholder, then returns to its prior position. Live controls and figure state move with it.
- Links, form controls, terms and tips, and animation controls are excluded from figure click activation. Chart plot clicks can open the figure unless handled by keyed selection or range brushing. Without JS the figure stays in the page.
- `DocForm.zoom.open(element)`, `close()`, `isOpen()`, and `current()`. `current()` returns `{target, overlay, stage}` while open, or `null`. Listen on `document` for `df:zoomopen` and `df:zoomclose` with that same detail. Close fires at the start of dismissal before the target is restored.

[Presentation tools](zoom-tools.md) · [Charts](../data/charts.md) · [Wide blocks](../layout/wide.md) · [Source](../../js/zoom.js)
