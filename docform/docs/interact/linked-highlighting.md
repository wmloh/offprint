# Linked selection

Enable `selection` in the [offline entry](../setup/setup.md). Names and keys are trimmed, nonempty, case-sensitive strings.

```html
<button type="button" data-df-selection-group="trace" data-df-key="retry">Trace the retry</button>
<p data-df-selection-group="trace" data-df-key="retry">The retry arrives first.</p>
```

- Plain buttons and focusable `role="button"` elements toggle the shared key with click, Enter, or Space. Passive prose, table rows and SVG stay visible. Matches get `data-df-selection-active` and controls reflect `aria-pressed`. Insertion and rekeying resynchronize automatically. [Code annotations](../reading/code.md) copy the group and key to generated markers.
- Put `data-df-selection-group` on [cards](card-panels.md), [figure steps](figure-steps.md), [steppers](worked-examples.md), [tabs](tabs.md), or [charts](../data/charts.md). Stateful hosts accept `data-df-selection-mode="both|publish|follow"` (default `both`). Clearing or an unmatched group key leaves the sequence on its current item and removes passive highlights. Sequence Reset returns to its authored initial item and publishes when enabled.
- Configure `selectionGroups: { "trace": { "initial": "retry", "persist": true } }` in the site or page. Mark a publisher with `data-df-selection-seed` to offer its local initial item (first keyed point for a chart). Startup uses explicit `initial` (including `null`), then a stored key matching a participant or custom seed, then the first eligible declarative seed in document order, then the first custom seed, then clear. Storage is best effort, scoped to the site and group.
- `DocForm.selection.group(name)` returns the controller or `null`. Authored participants implicitly define groups. Declare a custom-only group in configuration or via `DocForm.selection.define(name, {initial?, persist?}?)`. During setup, `DocForm.selection.seed(name, key)` offers a custom seed.
- Group controller: `get()` → key or `null`, `snapshot()` → `{key}`, `select(key)`, `clear()`, and `subscribe(fn, {immediate: true}?)` → unsubscribe. `select` accepts valid keys without current matches. Subscribers receive `(current, {previous, origin})` after participants update and before `df:selection:change` on `document` with `{group, current, previous, origin}`. Setup subscribers receive the committed start after mounting. Idempotent writes emit no change. Writes from notifications apply in call order after the current notification completes.
- Item controllers use `DocForm.<feature>.get(idOrElement)` with the authored host. `select(key)` and `reset()` return boolean, and unknown local keys return false. `snapshot()` reads local state. `subscribe` uses the same callback contract as the group. Host change events bubble and include initial state.

```js
DocForm.setup(function (df) {
  const trace = df.selection.group('trace');
  trace.subscribe((state) => {
    document.getElementById('reading').textContent = state.key ?? 'No event selected';
  }, {immediate: true});
  document.getElementById('show-retry').onclick = () => trace.select('retry');
  document.getElementById('clear-trace').onclick = () => trace.clear();
});
```

[Source](../../js/highlight.js)
