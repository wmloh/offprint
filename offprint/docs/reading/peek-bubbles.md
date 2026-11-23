# Peek bubbles

Enable `peek-bubbles`. Author `details` with a direct `summary` for the label and HTML for the optional content. The first `.op-page` is scanned, with `main` or `body` as fallback. Add `data-op-no-bubble` on a `details` or ancestor to leave native disclosure markup. Nested `details` also retain native behavior.

```html
<details data-op-color="blue">
  <summary>Derivation</summary>
  <p>Expand the square and group the terms.</p>
</details>
```

- On setup the script replaces each eligible `details` with a focusable bubble (`role=button`, `aria-controls` → sheet id) and moves its content into a `.op-bubble-sheet` holding a `.op-bubble-body.op-page`. Collapsed sheets wait in a hidden `div.op-bubble-store` under `body`, laid out at the column width, so page modules still find their content. The default accent is purple. Without the script, `blocks` CSS (also in `offprint.css`) supplies the tinted native disclosure style. Add `open` to start that native fallback expanded if needed.
- Scrolling opens bubbles in place: a bubble opens once its centre rises above 60% of the viewport height, stays open while its top is above 75%, and closes once its bottom passes 10%. At most the three closest to the centre are open. Opening adds `.is-open` and animates the bubble's width (title-width pill → column width) and the sheet's height and opacity (420 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`). The sheet caps at 70vh and the body scrolls inside it.
- Closing reverses the same animation. When the bubble sits above the viewport middle (scrolled past), the script scrolls by each frame's height change so text below stays still, and adds `html.op-bubble-holding` (`overflow-anchor: none`) meanwhile. Reopening mid-shrink grows from the current size. Without Web Animations support, sizes snap.
- The bubble title ends with →; the open bubble omits it.
- Click, Enter, or Space scrolls the bubble to centre and reveals its content. Hover, focus, or tap clears the content blur. Escape closes the bubble when focus is inside it and prevents it reopening until it leaves the scroll band.

[Block styles](../../css/blocks.css) · [Bubble source](../../js/bubble.js)
