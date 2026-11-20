# Scroll reveals

Enable the `reveals` feature. Add `data-df-reveal` to a block to reveal it each time it nears the viewport centre.

```html
<p data-df-reveal="left" data-df-reveal-delay="200">This arrives from the left.</p>
```

- Empty or default direction rises from below. `left`, `right`, and `fade` choose a side or opacity only. `data-df-reveal-delay` is in milliseconds. `data-df-no-reveal` opts a target out.
- Two-way: a rAF-throttled scroll check toggles `.df-revealed` while the target overlaps the viewport minus 15% at each end (entry) or 4% (keep), widened at page ends; a block holding focus stays shown. Entrance uses `--df-reveal-delay`; exit is immediate and quicker. `data-df-reveal-once` stops tracking after the first entrance. `DocForm.reveals.show(idOrElement)` reveals the target and stops tracking it. `DocForm.reveal.revealVisible(top, bottom, vh, scrolled, remaining, shown)` is the pure band test.
- Content remains visible without scripts or `requestAnimationFrame`. Print styles expose marked content. Callouts in `.df-page` use the same assets for a reversible slide through a visibility band.

[Callouts](../reading/callouts.md) · [Split views](split-views.md) · [Source](../../js/reveal.js)
