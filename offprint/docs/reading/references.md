# Numbering and cross-references

Enable the `references` feature. Numbering runs on page content at initialization. Figure, table, and equation counters are independent and start at 1 per document.

```html
<figure id="trace">
  <img src="trace.png" alt="Residual trace">
  <figcaption>Residual by hour.</figcaption>
</figure>
<div class="op-math" data-op-display id="residual">r = y - \hat y</div>
<p>See <a href="#trace"></a> and <a href="#residual"></a>.</p>
```

- A non-nested figure or a table outside a figure qualifies with its own caption, ID, or `data-op-number`. A figure containing a table counts as a table unless it also contains a chart host, SVG, image, canvas, video, or math outside the table. Qualifying items receive a caption if needed.
- Display equations outside figures qualify with an ID, `data-op-number`, or `options.references.equations: 'all'`. `data-op-no-number` on an item opts it out. Math rerenders preserve equation numbers. Enable [math](math.md) to render TeX.
- Use an explicit target ID and an `href="#id"` for same-page links. Empty links get the target's numbered label, heading text, `title`, or ID. Missing targets warn and empty links show `??`. On activation the target flashes. Local refs use `--op-xref`.
- The `tooltips` feature provides same-page preview cards for linked items, with up to three following blocks for headings. Links to pages in the manifest get cross-page previews from `search` and its index, or a URL display when unavailable. `data-op-no-preview` on a link or ancestor skips cross-reference enhancement, including automatic label text and flashing.
- The offline entry builds the [citations](citations.md) heading before navigation and resolves links once headings have IDs.

[Math](math.md) · [Search](search.md) · [References source](../../js/refs.js)
