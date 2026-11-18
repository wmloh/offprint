# Wide blocks

Load `css/wide.css` and `js/wide.js`. Put `data-df-wide` on a direct child of the first `.df-page`. Nested markers warn and are ignored. Use a figure, a table, or a wrapper containing a table or data block.

```html
<figure data-df-wide><img src="trace.png" alt="Residual trace"><figcaption>Residual trace</figcaption></figure>
<div data-df-wide><table><!-- columns and rows --></table></div>
```

- Total width capped by `--df-wide-width` (1240 px). Set a pixel value on the root, page, or block. Growth is shared between sides as room permits, bounded by the visible sticky sidebar and page gutter.
- If the page has margin-eligible sidenotes with enough room, or peek bubbles with room for side panels, the right gutter is reserved. Load those modules before `wide.js` for the initial measurement.
- Without the script or enough room, the block retains the reading width and large tables scroll locally. With script, margins glide on later layout changes. A direct-child filter bar or Show more control stays aligned to the reading column.
- `DocForm.wide.layout()` recomputes widths when initialized with eligible blocks. Resize, observed page size changes, and sidebar transitions already trigger layout. `DocForm.wide.span({left, right, cellLeft, cellRight, edge, max, margin})` computes `{left, right}` growth in pixels.

[Base layout](base.md) · [Sidenotes](../reading/sidenotes.md) · [Peek bubbles](../reading/peek-bubbles.md) · [PCA telemetry example](../../../examples/pca/pages/telemetry.html#telemetry-chart)
