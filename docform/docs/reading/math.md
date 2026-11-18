# TeX math

Load `vendor/katex/katex.min.css` before `css/math.css`. Keep the vendored fonts beside the KaTeX stylesheet. Load `vendor/katex/katex.min.js` before `js/math.js` in the classic script sequence. KaTeX is bundled for offline use.

```html
<span class="df-math">a^2 + b^2 = c^2</span>
<div class="df-math" data-df-display id="integral">\int_0^1 x\,dx = \tfrac12</div>
```

- Supply bare TeX as text or override it with `data-df-tex`. `data-df-display` opts into display mode. Escape HTML-sensitive characters when writing TeX in HTML.
- Site or page `options.math.macros` are copied and shared within the page. `\gdef` can affect later formulas without mutating the manifest. Double backslashes in JS string literals.
- Missing KaTeX leaves the source and warns. Invalid TeX leaves the source in `.df-math-error` with the error as its title.
- `DocForm.math.render(scope?, force?)` processes new `.df-math` elements, including the scope itself. Pass a plain ID, Element, or Document. Returns the number attempted with KaTeX available. `set(idOrElement, tex)` replaces and rerenders one expression. `source(idOrElement)` reads cached or authored TeX. `html(tex, display?)` returns rendered HTML or throws.
- `mixed(text)` returns escaped HTML with inline `$…$` rendered and escapes handled by `split(text)`. Write `\$` for a literal dollar. Used by [tooltips](tooltips.md) and parameter templates. Plain page prose needs explicit `.df-math` markup.

[Equation numbering](references.md) · [Math source](../../js/math.js)
