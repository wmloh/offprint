# Callouts

Enable `callouts` or link `docform.css` for static styling. Add `.df-callout`, an optional accent, and optionally `data-df-icon` for a CSS-generated icon. Use `.df-callout-title` for an optional accent-coloured title.

```html
<div class="df-callout" data-df-role="warning" data-df-icon="⚠">
  <span class="df-callout-title">Check the units</span>
  Use the same unit for the reading and the limit.
</div>
```

- Body text uses the normal foreground. Without an accent the background is subtle with an inset border.
- With `reveals`, callouts inside `.df-page` slide in from the right when they overlap the middle half of the viewport and slide out again on leaving it. The visibility band widens at the page ends.
- `data-df-no-reveal` keeps a callout stationary. The base callout renders without JS.

[Colour roles](../layout/roles.md) · [Block styles](../../css/blocks.css) · [Reveal source](../../js/reveal.js)
