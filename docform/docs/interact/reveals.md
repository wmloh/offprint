# Scroll reveals

Load `css/reveal.css` and `js/reveal.js` after core. Add `data-df-reveal` to the block to reveal it once per page view.

```html
<p data-df-reveal="left" data-df-reveal-delay="200">This arrives from the left.</p>
```

- Empty or default direction rises from below. `left`, `right`, and `fade` choose a side or opacity only. `data-df-reveal-delay` is in milliseconds. `data-df-no-reveal` opts a target out.
- The reveal observer uses `rootMargin: '0px 0px -12% 0px'` to wait for the target to enter the viewport. An element already above the viewport also reveals, including after scroll restoration. JS removes each revealed target from observation and adds `.df-revealed`. `DocForm.reveal.show(element)` adds the class directly.
- Content remains visible without scripts or `IntersectionObserver`. Print styles expose marked content. Callouts in `.df-page` use the same assets for a reversible slide through a visibility band.

[Callouts](../reading/callouts.md) · [Split views](split-views.md) · [Source](../../js/reveal.js)
