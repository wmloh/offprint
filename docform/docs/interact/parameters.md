# Parameters and presets

Enable `features.parameters` with the [offline entry](../setup/include-order.md). Define `parameterScopes` in the site manifest or page JSON. Site and page definitions merge by scope, parameter, and field. Page fields take precedence and arrays replace earlier arrays.

```json
{
  "features": {"parameters": true},
  "parameterScopes": {
    "decoder": {
      "gain": {"type": "range", "min": 0, "max": 5, "step": 0.1, "default": 2},
      "mode": {"type": "select", "choices": [{"value": "raw", "label": "Raw"}, {"value": "scaled", "label": "Scaled"}]},
      "trace": {"type": "toggle"},
      "subtotal": {"type": "number", "default": 0}
    }
  }
}
```

```html
<div class="df-params" data-df-parameter-scope="decoder">
  <div data-df-parameter="gain" data-df-parameter-label="Gain"></div>
  <div data-df-parameter="mode" data-df-parameter-label="Mode"></div>
  <label><input type="checkbox" data-df-parameter="trace"> Show trace</label>
  <p>Doubled gain is <span data-df-bind="2 * gain" data-df-digits="1">4.0</span>.</p>
  <button type="button" data-df-preset='{"gain":2,"mode":"scaled","trace":true}'>Scaled trace</button>
</div>
<label>Gain <input type="range" data-df-parameter="gain" data-df-scope="decoder"
  min="0" max="5" step="0.1" value="2"></label>
```

- Scope resolution for controls, bindings, and presets: explicit `data-df-scope`, nearest (or own) `data-df-parameter-scope`, then `page`. Repeated wrappers with the same name share state. Unknown explicit scopes leave authored content in place. Scope names are trimmed, nonempty, case-sensitive strings. Parameter keys use JS identifier syntax.
- `range`: finite ordered bounds, default 0 to 1, positive `step` (roughly 1/100 of the span), default value `min`, precision from `step`. API writes can use finite in-range values between steps. The browser displays the nearest available tick on the range input.
- `number`: finite numeric state for scripts and bindings, with a required `default` and optional finite `min` and `max`.
- `select`: nonempty ordered `choices`, each with distinct string `value` and string `label`. Default is the first value. `toggle`: boolean, default false. `digits` accepts 0–100 decimal places.
- `data-df-parameter` binds a generated control or a matching native range, select, or checkbox. For generated controls, `data-df-parameter-label` sets the label and `data-df-parameter-digits` overrides the range readout precision. Native controls can use an HTML label or `data-df-parameter-label` for an accessible name. Include static starting text or native control defaults for JS-off reading.
- `data-df-bind` evaluates an author-supplied JS expression in the resolved scope with Math members available. `data-df-template="Gain {{gain|1}}"` fills expression slots with optional precision. Direct references use definition precision. Other numbers default to up to three decimals. `.df-math` output re-renders with math enabled, and mixed templates can include `$…$`. Use named controller lookups for calculations across scopes.
- `data-df-preset` accepts a nonempty JSON object of known values, including numeric strings for numeric parameters. Invalid presets warn and get `aria-disabled="true"`. Every matching preset gets `aria-current="true"`.

## Controller

- `DocForm.parameters.define(name, definitions)` registers a new scope during setup and returns its controller or `null`. A duplicate scope or invalid definition rejects registration. `DocForm.parameters.scope(name = 'page')` looks up a scope and returns its controller or `null`.
- Controller methods `get(key)`, `snapshot()`, `set(key, value)`, `update(values)`, `reset()`, and `subscribe(fn, {keys?, immediate?}?)`. Snapshots are detached and frozen. Unknown reads return `undefined`. Writes require typed values. A nonempty batch validates all entries before applying any. Mutations return a boolean for acceptance. Reset restores the scope's declared defaults.
- `fn(current, {previous, changedKeys, origin})` runs once per affected batch. `keys` optionally filters notifications. `immediate: true` publishes a first snapshot with `previous: null`, `origin: 'init'`, and the watched keys (all keys by default). Setup subscriptions receive it after enhancement. The returned function unsubscribes.
- Controls and preset state synchronize before callbacks. Bindings coalesce per animation frame. The document event `df:parameters:change` follows callbacks with `{scope, current, previous, changedKeys, origin}`. Origins are `api`, `user` for controls and presets, and `reset`. Only committed changes emit events.

Legacy pages using individual scripts can load `css/params.css` and `js/params.js` after core. Their `data-df-param` controls and `DocForm.params` still support existing examples. For migration, move local control constraints to definitions and replace `on`, `values`, and `apply` with scoped `subscribe`, `snapshot`, and `update`.

[Figure steps](figure-steps.md) · [Animations](animations.md) · [Charts](../data/charts.md) · [Source](../../js/params.js)
