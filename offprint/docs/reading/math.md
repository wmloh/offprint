# TeX math

Enable `math`. The entry loads bundled KaTeX. Keep its fonts beside the vendored stylesheet.

```html
<span class="op-math">a^2 + b^2 = c^2</span>
<div class="op-math" data-op-display id="integral">\int_0^1 x\,dx = \tfrac12</div>
```

- Supply bare TeX as text or override it with `data-op-tex`. `data-op-display` opts into display mode. Escape HTML-sensitive characters when writing TeX in HTML.
- Site or page `options.math.macros` are copied and shared within the page. `\gdef` can affect later formulas without mutating the manifest. Double backslashes in JS string literals.
- Missing KaTeX leaves the source and warns. Invalid TeX leaves the source in `.op-math-error` with the error as its [control hint](tooltips.md); a later valid render clears both.
- `mixed(text)` returns escaped HTML with inline `$…$` rendered and escapes handled by `split(text)`. Write `\$` for a literal dollar. Used by [tooltips](tooltips.md) and parameter templates. Plain page prose needs explicit `.op-math` markup.

[Equation numbering](references.md) · [Math source](../../js/math.js)
