# Linked selection

Enable `selection` in the [offline entry](../setup/setup.md). Names and keys are trimmed, nonempty, case-sensitive strings.

```html
<button type="button" data-op-selection-group="trace" data-op-key="retry">Trace the retry</button>
<p data-op-selection-group="trace" data-op-key="retry">The retry arrives first.</p>
```

- Plain buttons and focusable `role="button"` elements toggle the shared key with click, Enter, or Space. Passive prose, table rows and SVG stay visible. Matches get `data-op-selection-active` and controls reflect `aria-pressed`. `highlight.css` marks matches with a 12 % tint and a 2 px inset leading edge in `--op-selection-color` (inherited `--op-accent` from `data-op-color`/`data-op-role` on the item or an ancestor, else blue), fading over 0.25 s as the key moves. Table rows tint their cells without the edge; SVG shapes get a drop-shadow glow (chart marks keep their own stroke); code markers fill. Keyed participants keep a separate solid `--op-focus` ring at 3 px offset. Insertion and rekeying resynchronize automatically. [Code annotations](../reading/code.md) copy the group and key to generated markers.
- Put `data-op-selection-group` on [cards](card-panels.md), [step sequences](step-contract.md), [tabs](tabs.md), or [charts](../data/charts.md). Select and multiselect [parameters](parameters.md#linking-without-scripts) join through `selectionGroup` in their definition. Stateful hosts accept `data-op-selection-mode="both|publish|follow"` (default `both`). Clearing or an unmatched group key leaves the sequence on its current item and removes passive highlights. Sequence Reset returns to its authored initial item and publishes when enabled.
- Configure `selectionGroups: { "trace": { "initial": "retry", "persist": true } }` in the site or page. Mark a publisher with `data-op-selection-seed` to offer its local initial item (first keyed point for a chart). Startup uses explicit `initial` (including `null`), then a stored key matching a participant or custom seed, then the first eligible declarative seed in document order, then the first custom seed, then clear. Storage is best effort, scoped to the site and group.
- `OffPrint.selection.group(name)` returns the controller or `null`. Authored participants implicitly define groups. Declare a custom-only group in configuration or via `OffPrint.selection.define(name, {initial?, persist?}?)`. During setup, `OffPrint.selection.seed(name, key)` offers a custom seed.
- Group controller: `get()` → key or `null`, `snapshot()` → `{key}`, `select(key)`, `clear()`, and `subscribe(fn, {immediate: true}?)` → unsubscribe. `select` accepts valid keys without current matches. Subscribers receive `(current, {previous, origin})` after participants update and before `op:selection:change` on `document` with `{group, current, previous, origin}`. Setup subscribers receive the committed start after mounting. Idempotent writes emit no change. Writes from notifications apply in call order after the current notification completes.
- Feature-specific item events bubble from the host and include the initial state. See the feature reference for its event name and payload.

```js
OffPrint.setup(function (op) {
  const trace = op.selection.group('trace');
  trace.subscribe((state) => {
    document.getElementById('reading').textContent = state.key ?? 'No event selected';
  }, {immediate: true});
  document.getElementById('show-retry').onclick = () => trace.select('retry');
  document.getElementById('clear-trace').onclick = () => trace.clear();
});
```

[Source](../../js/highlight.js)
