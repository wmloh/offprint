# Worked-example steppers

Load `css/stepper.css` and `js/stepper.js` after core. Use a nonempty `ol[data-df-stepper]` with an ID. Each direct `li` needs a unique nonempty `data-df-step-key` and a direct child with `data-df-step-name` and nonempty text. Invalid markup warns and stays visible.

```html
<ol id="delivery" data-df-stepper>
  <li data-df-step-key="send"><strong data-df-step-name>Send</strong> Start the timer.</li>
  <li data-df-step-key="retry"><strong data-df-step-name>Retry</strong> Reuse the same ID.</li>
</ol>
<p data-df-stepper-view="delivery" data-df-step-key="retry">The timeout has expired.</p>
```

- Previous, Next, and Reset expose one step at a time. Reset returns to the first step. Bound views anywhere on the page match by list ID and key. They are visible only for the current step. The authored full sequence and views remain visible without enhancement.
- `DocForm.stepper.get(idOrList)` returns `{index, key, name, total}` (`index` zero-based), or `null`. `select(idOrList, key)` returns `false` for an unknown list or key. `df:stepperchange` bubbles from the list with the same state as detail, including at initialization. Selecting the active step emits no event.
- To preserve all rows in a linked trace, give the rows [highlight](linked-highlighting.md) attributes and use those same keys in the stepper and [chart points](../data/charts.md). Load both scripts and styles, then attach the bridge in a page script before initialization to catch the first step. An empty highlight selection leaves the stepper on its current step.

```js
document.addEventListener('df:stepperchange', event => {
  if (event.target.id === 'delivery') DocForm.highlight.set('trace', event.detail.key);
});
document.addEventListener('df:highlightchange', event => {
  const {group, key} = event.detail;
  if (group === 'trace' && key) DocForm.stepper.select('delivery', key);
});
```

[Figure steps](figure-steps.md) · [PCA linked trace example](../../../examples/pca/pages/telemetry.html#incident-timeline) · [Source](../../js/stepper.js)
