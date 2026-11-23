# Parameters and presets

Enable `features.parameters` with the [offline entry](../setup/include-order.md); it also loads [`choices`](choices.md) for choice groups and `dropdowns` for combobox popovers. Define `parameterScopes` in the site manifest or page JSON. Site and page definitions merge by scope, parameter, and field. Page fields take precedence and arrays replace earlier arrays.

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
<div class="op-params" data-op-parameter-scope="decoder">
  <div data-op-parameter="gain" data-op-parameter-label="Gain"></div>
  <fieldset data-op-choice="mode">
    <legend>Mode</legend>
    <label><input type="radio" name="mode" value="raw" checked> Raw</label>
    <label><input type="radio" name="mode" value="scaled"> Scaled</label>
  </fieldset>
  <label><input type="checkbox" data-op-parameter="trace"> Show trace</label>
  <p>Doubled gain is <span data-op-bind="2 * gain" data-op-digits="1">4.0</span>.</p>
  <button type="button" data-op-preset='{"gain":2,"mode":"scaled","trace":true}'>Scaled trace</button>
</div>
<label>Gain <input type="range" data-op-parameter="gain" data-op-scope="decoder"
  min="0" max="5" step="0.1" value="2"></label>
```

- Scope resolution for controls, bindings, and presets: explicit `data-op-scope`, nearest (or own) `data-op-parameter-scope`, then `page`. Repeated wrappers with the same name share state. Unknown explicit scopes leave authored content in place. Scope names are trimmed, nonempty, case-sensitive strings. Parameter keys use JS identifier syntax.
- `range`: finite ordered bounds, default 0 to 1, positive `step` (roughly 1/100 of the span), default value `min`, precision from `step`.
- `number`: finite numeric state for scripts and bindings, with a required `default` and optional finite `min` and `max`.
- `select`: nonempty ordered `choices`, each with distinct string `value` and string `label`. Default is the first value. `toggle`: boolean, default false. `digits` accepts 0–100 decimal places.
- `multiselect` uses the same ordered choice descriptors. Defaults, writes, and preset entries are arrays of distinct known strings, including `[]`. Omitted defaults select every choice. Values normalize to declaration order, compare by content, and are copied and frozen. Named charts and results can use these choices as [record filters](../data/data-blocks.md#record-filters).
- `data-op-parameter` binds a range or toggle: a generated control or a matching native input (`input[type=range]`, `input[type=checkbox]`). On a `select` or `multiselect` definition it reports an issue and stays unenhanced; use a [choice fieldset](#choice-groups). `.op-params` is an unboxed wrapper (scope holder, vertical spacing only). For generated controls, `data-op-parameter-label` sets the label and `data-op-parameter-digits` overrides the range readout precision. Native controls can use an HTML label or `data-op-parameter-label` for an accessible name. Include static starting text or native control defaults for JS-off reading.
- `data-op-bind` evaluates an author-supplied JS expression in the resolved scope with Math members available. `data-op-template="Gain {{gain|1}}"` fills expression slots with optional precision. Direct references use definition precision. Other numbers default to up to three decimals. `.op-math` output re-renders with math enabled, and mixed templates can include `$…$`.
- `data-op-preset` accepts a nonempty JSON object of known values, including numeric strings for numeric parameters. Invalid presets warn and get `aria-disabled="true"`. Every matching preset gets `aria-current="true"`.

## Choice groups

```html
<fieldset data-op-choice="runs" data-op-choice-display="combobox"></fieldset>
<fieldset data-op-parameter-scope="report" data-op-choice="groups">
  <legend>Groups to show</legend>
  <label><input type="checkbox" value="setup" checked> Setup</label>
  <label><input type="checkbox" value="layout"> Layout</label>
</fieldset>
```

- `data-op-choice="key"` on a `fieldset` binds a `select` (radios) or `multiselect` (checkboxes) definition; any other host tag, a missing `choices` feature, or a non-choice definition reports an issue. Scope resolves like controls, including `data-op-parameter-scope` on the fieldset itself.
- `legend` is the label (math-aware when generated); without one, the key is used. Authored `label > input` items are the no-script view: reused in place as chips when their values and input types match the definition exactly, otherwise removed and regenerated with an issue. Authored `checked` is display-only; the definition default sets state.
- Rendering, display choice (`data-op-choice-display`, chips ≤ 7 choices and ≤ 80 label chars), keyboard, glider, combobox, and ripple: see [Choice groups](choices.md). Selection-group definitions mark each chip or combobox option with `data-op-selection-group` and `data-op-key`.

## Linking without scripts

- `data-op-show-when="expr"` shows the element while the expression (resolved scope, Math in scope) is truthy; an empty array counts as false. Add `data-op-show-value="text"` to show only when the result, or any item of an array result, equals that text as a string (for example a multiselect containing a choice). Scope resolution matches controls. Elements get `.op-show-when` and the `hidden` attribute; changes fade and settle over 0.2 s (`.op-show-enter`/`.op-show-leave`), startup applies without animation. A failing expression reports once and leaves the element shown. Scripts off: everything stays visible.
- Chart bindings: `data-op-chart-bind='{"bins":"bins","reference":"cut * 2"}'` on a chart host, or `options.chart.instances.<id>.bind` (the attribute wins). Each value is an expression in the host's resolved scope. Targets: `bins`, `orientation`, `stack`, `reference` (first reference line value) or `reference.N` (0-based; the line must exist in the spec), `colorMin`/`colorMax` (heatmap `scale.min`/`scale.max`; null = automatic), `series` (visible series keys: a key, an array, or null for all), `range` (`[lo, hi]` x range or null). Unknown targets, bad JSON, or no `parameters` feature report an issue and leave the chart unbound.
- Spec targets apply over every spec the chart receives (markup, `update`, named sources, Reset); `spec()` returns the unbound spec. `series` and `range` set the reader view after each replacement; legend clicks and brushing still change it locally until the parameters change again. Changes tween like `update`.
- Each scope commit evaluates every binding in the scope. A result the chart cannot draw (validation error, unknown series key, unusable range, missing reference line) rejects the whole parameter update: values, controls, and other views keep their prior state, and the issue names the chart. Initial values that fail validation leave the chart undrawn with the usual chart warning.
- `select` and `multiselect` definitions accept `selectionGroup: "name"` and `selectionMode: "both" | "publish" | "follow"` (default both); other types or invalid values reject the definition. Needs the `selection` feature. Choice values are the group keys.
  - Publish: a select publishes its value on every committed change (not at startup); a multiselect publishes the last choice added, and clears the group when the shared key is removed.
  - Follow: a group key among the choices sets the select or is added to the multiselect, with origin `selection`. Clearing or a key outside the choices leaves the value. Startup follows the group's starting key; following choices count as participants for stored keys.
  - Chips and combobox options carry the group and key, so they get the linked highlight.

## Events

- Controls, presets, and record-filtered views synchronize before callbacks. An incompatible filter change preserves the prior scope and views. Text bindings coalesce per animation frame. The document event `op:parameters:change` follows callbacks with `{scope, current, previous, changedKeys, origin}`. Origins are `api`, `user` for controls and presets, `reset`, and `selection` for group-following writes. Only committed changes emit events.

[Choice groups](choices.md) · [Figure steps](figure-steps.md) · [Animations](animations.md) · [Charts](../data/charts.md) · [Linked selection](linked-highlighting.md) · [Source](../../js/params.js)
