# Split views

Enable the `split-views` feature. Wrap panes as direct children of `.df-split`. Each pane can contain a figure, chart, table, or multiple blocks.

```html
<div class="df-split" data-df-split="3:2" data-df-align="center">
  <figure><img src="trace.png" alt="Signal trace"></figure>
  <div><p>The highest reading occurs after startup.</p></div>
</div>
```

- Default equal shares. `data-df-split` takes positive shares separated by colons, whitespace, slashes, or commas. Missing or invalid shares count as `1`. `data-df-align="center"` centers panes vertically.
- At 700 px viewport width or below the panes stack. With `reveals` enabled, the two-way reveal band shows and hides the split as a unit, staggering panes by 140 ms. At wider sizes the outer panes enter from their respective sides. `data-df-no-reveal` keeps the layout stationary. Without JS, panes stay visible and CSS assumes two equal columns before the stacking breakpoint.

[Reveals](reveals.md) · [Styles](../../css/reveal.css) · [Source](../../js/reveal.js)
