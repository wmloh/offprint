# Tooltips and glossary terms

Enable the `tooltips` feature. Include [math](math.md) for `$…$` in definition text or extended cards. Use `\$` for a literal dollar when mixed math is enabled.

```html
<span data-op-tip="The projection onto a unit vector." data-op-tip-tags="Geometry, Maths">component</span>
<span data-op-term>vector</span>
<span data-op-term="dot product" data-op-more-id="dot-more" data-op-hold="900">inner product</span>
<template id="dot-more"><p>For orthogonal vectors, $u \cdot v = 0$.</p></template>
```

- `data-op-tip` uses inline text. `data-op-term` uses the attribute or the element's text for a manifest lookup. Keys are trimmed, case-folded, and runs of spaces, hyphens, or underscores collapse to a space. Colliding definitions keep the first. Missing terms warn and receive `.op-term-missing`.
- Glossary tags (required): every manifest term needs `tags: [labels]` and every running-text `data-op-tip` needs `data-op-tip-tags="A, B"`, naming `options.tags.glossary` labels ([tags](tags.md)). Running text excludes content inside `.op-tag`, `.op-legend-item`, `.op-tooltip`, `a[href]`, `button`, form controls, `label`, `summary`, `svg`, `[role=button|tab]`, `.op-controls`, `.op-sidebar`. Unknown labels warn and drop. Untagged terms produce one summary warning; untagged tips warn each and get `.op-tip-untagged` (red underline). Tooltip and hold cards show a `.op-tooltip-tags` line of circle chips, or a dashed `Untagged` chip.
- `options.tooltips.terms` definitions accept a string or `{text, title?, more?, tags?}`. `more` is author HTML. `data-op-more-id` reads author HTML from a plain template or element ID. `data-op-more` supplies inline HTML and an empty value disables the extended card. When both are present a resolved ID takes precedence.
- Hover or focus shows the tooltip. Hold primary pointer or Enter/Space to open an extended card with a progress ring. Hold precedence is `data-op-hold`, `options.tooltips.hold`, then 600 ms. Use a finite nonnegative value in milliseconds. Releasing early or moving more than 10 px cancels the hold. Escape dismisses the card.
- Auto-link is opt-in via `options.tooltips.autoLink: true` for `.op-page`, or `data-op-autolink` on a root. Opt out with `data-op-no-autolink` or `data-op-autolink="false"`. It matches whole terms in individual paragraph/list-item text nodes, case-insensitively. Leftmost match wins, then longest at the same position. Links, headings, code, math, tags, existing terms, and interactive regions are skipped; Tags labelled with a whole term get its tooltip, and remaining tags use a role tip or a warned fallback (see [tags](tags.md)). Auto-linked spans have a fainter underline and stay out of the tab order.
- Control hints: `OffPrint.util.hint(el, text)` shows plain text in one shared hover/focus card (no tags; empty text clears). Library icon buttons, step pills, diagram labels, math errors, and Markdown link titles use it. Native `title` only when `tooltips` is off. Hint cards are skipped by Reader snapshots.
- Cards are fixed at `z-index: 70`, above the [zoom view](../interact/figure-zoom.md), so tips inside an enlarged figure stay visible.

[Manifest](../setup/manifest.md) · [Glossary page](glossary.md) · [Tooltip source](../../js/tooltip.js)
