# Linked highlighting

Load `css/highlight.css` and `js/highlight.js` after core. Put the same nonempty `data-df-highlight-group` and `data-df-highlight-key` strings on a control and every item it should outline.

```html
<button type="button" data-df-highlight-group="trace" data-df-highlight-key="retry">Trace the retry</button>
<p data-df-highlight-group="trace" data-df-highlight-key="retry">The retry arrives first.</p>
```

- Each group starts clear and holds one case-sensitive key. Native buttons and focusable `[role="button"][tabindex]` controls toggle the key with click, Enter, or Space. Matching controls gain `aria-pressed` and all active items gain `data-df-highlight-active`. Passive items can be prose, table rows, SVG, or code annotations. Keep enough authored context to follow the trace with scripts disabled.
- `DocForm.highlight.get(group)` returns the selected key or `null`. `set(group, key)` selects it and `set(group, null)` clears it. On change, `document` emits `df:highlightchange` with `{group, key}`. Reassigning the current value leaves state and events unchanged. DOM updates that add marked items or change keys are synchronized automatically.
- [Charts](../data/charts.md) take a group on the spec or host and keys on points. [Code annotations](../reading/code.md) copy the group and key from the authored annotation item to its generated marker. [Worked-example steppers](worked-examples.md) can share the keys through their change event to outline source rows and plot points without hiding the other steps' rows.

[Source](../../js/highlight.js)
