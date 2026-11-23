# Callouts

Enable `callouts` or link `offprint.css` for static styling. Add `.op-callout`, an optional accent, and optionally `data-op-icon` for a CSS-generated icon. Use `.op-callout-title` for an optional accent-coloured title.

```html
<div class="op-callout" data-op-role="warning" data-op-icon="⚠">
  <span class="op-callout-title">Check the units</span>
  Use the same unit for the reading and the limit.
</div>
```

- Body text uses the normal foreground. Without an accent the background is subtle with an inset border.
- With `reveals`, callouts inside `.op-page` slide in from the right when they overlap the middle half of the viewport and slide out again on leaving it. The visibility band widens at the page ends.
- `data-op-no-reveal` keeps a callout stationary. The base callout renders without JS.

[Colour roles](../layout/roles.md) · [Block styles](../../css/blocks.css) · [Reveal source](../../js/reveal.js)
