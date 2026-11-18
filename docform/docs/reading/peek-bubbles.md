# Peek bubbles

Load `css/blocks.css`, `css/bubble.css`, and `js/bubble.js`. Author `details` with a direct `summary` for the label and HTML for the optional content. The first `.df-page` is scanned, with `main` or `body` as fallback. Add `data-df-no-bubble` on a `details` or ancestor to leave native disclosure markup. Nested `details` also retain native behavior.

```html
<details data-df-color="blue">
  <summary>Derivation</summary>
  <p>Expand the square and group the terms.</p>
</details>
```

- On setup the script replaces the eligible `details` with a focusable bubble, transfers its content into a sheet, and creates a side panel under `body`. The default accent is purple. Without the script, `blocks.css` supplies the tinted native disclosure style. Add `open` to start that native fallback expanded if needed.
- Scrolling opens bubbles near the centre. Up to three closest bubbles share a vertical stack with independent scrolling. The gutter requires at least 280 px for the panel plus 24 px per side. The panel caps at 460 px. With less room, bubbles expand in place.
- Click, Enter, or Space scrolls the bubble to centre and reveals its content. Hover, focus, or tap clears the panel blur. Escape closes the active bubble when focus is inside it and prevents it reopening until it leaves the scroll band.
- `DocForm.bubble.layout(viewportWidth, contentRight)` returns `{mode, width, right}`. `mode` is `panel` or `inline`. [Wide blocks](../layout/wide.md) use this to reserve gutter space.

[Block styles](../../css/blocks.css) · [Bubble source](../../js/bubble.js)
