# Tooltips and glossary terms

Enable the `tooltips` feature. Include [math](math.md) for `$…$` in definition text or extended cards. Use `\$` for a literal dollar when mixed math is enabled.

```html
<span data-df-tip="The projection onto a unit vector.">component</span>
<span data-df-term>vector</span>
<span data-df-term="dot product" data-df-more-id="dot-more" data-df-hold="900">inner product</span>
<template id="dot-more"><p>For orthogonal vectors, $u \cdot v = 0$.</p></template>
```

- `data-df-tip` uses inline text. `data-df-term` uses the attribute or the element's text for a manifest lookup. Keys are trimmed, case-folded, and runs of spaces, hyphens, or underscores collapse to a space. Colliding definitions keep the first. Missing terms warn and receive `.df-term-missing`.
- `options.tooltips.terms` definitions accept a string or `{text, title?, more?}`. `more` is author HTML. `data-df-more-id` reads author HTML from a plain template or element ID. `data-df-more` supplies inline HTML and an empty value disables the extended card. When both are present a resolved ID takes precedence.
- Hover or focus shows the tooltip. Hold primary pointer or Enter/Space to open an extended card with a progress ring. Hold precedence is `data-df-hold`, `options.tooltips.hold`, then 600 ms. Use a finite nonnegative value in milliseconds. Releasing early or moving more than 10 px cancels the hold. Escape dismisses the card.
- Auto-link is opt-in via `options.tooltips.autoLink: true` for `.df-page`, or `data-df-autolink` on a root. Opt out with `data-df-no-autolink` or `data-df-autolink="false"`. It matches whole terms in individual paragraph/list-item text nodes, case-insensitively. Leftmost match wins, then longest at the same position. Links, headings, code, math, existing terms, and interactive regions are skipped. Auto-linked spans have a fainter underline and stay out of the tab order.
- `DocForm.tooltips.attach(idOrElement, title, text, options?)` supports `more`, `hold`, `delay` (hover default 120 ms), `className`, `focusable: false`, `describe: false`, `enabled()`, or `content()` returning a node or HTML. Returns an idempotent disposer. A custom body is lazy when `describe: false`. `hide()` closes the active tooltip. `glossary(raw)` normalizes definitions, and `autoLink(roots, matcher(keys))` returns the inserted spans.

[Manifest](../setup/manifest.md) · [Glossary page](glossary.md) · [Tooltip source](../../js/tooltip.js)
