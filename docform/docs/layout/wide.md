# Wide blocks

Enable `wide` and put `data-df-wide` on a direct child of the first `.df-page`. Use a figure, a table, or a wrapper containing a table or data block.

```html
<figure data-df-wide><img src="trace.png" alt="Residual trace"><figcaption>Residual trace</figcaption></figure>
<div data-df-wide><table><!-- columns and rows --></table></div>
```

- Total width capped by `--df-wide-width` (1240 px). Set a pixel value on the root, page, or block. Growth is shared between sides as room permits, bounded by the visible sticky sidebar and page gutter.
- While top-level `h2` section lines show in the left margin, the block grows only to the right so it never crosses them. When the numbered section rail covers the margin, both sides are available again.
- If the page has margin-eligible sidenotes with enough room, or peek bubbles with room for side panels, the right gutter is reserved.
- `--df-figure-max-width` and `data-df-max-width` do not apply to wide blocks or their contents; `data-df-wide` is the only way past the column. Use `--df-wide-width` to limit a wide block.
- Without the script or enough room, the block retains the reading width and large tables scroll locally. With script, margins glide on later layout changes. A direct-child filter bar or Show more control stays aligned to the reading column.
- `DocForm.wide.layout()` recomputes widths and returns true when initialized with eligible blocks, false otherwise. Resize, observed page size changes, and sidebar transitions already trigger layout. `DocForm.wide.span({left, right, cellLeft, cellRight, edge, max, margin, rail})` computes `{left, right}` growth in pixels.

[Base layout](base.md) · [Sidenotes](../reading/sidenotes.md) · [Peek bubbles](../reading/peek-bubbles.md) · [PCA telemetry example](../../../examples/pca/pages/telemetry.html#telemetry-chart)
