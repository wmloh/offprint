# Parameters and presets

Enable `features.parameters` with the [offline entry](../setup/include-order.md); it also loads `dropdowns` for combobox popovers. Define `parameterScopes` in the site manifest or page JSON. Site and page definitions merge by scope, parameter, and field. Page fields take precedence and arrays replace earlier arrays.

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
- `multiselect` uses the same ordered choice descriptors. Defaults, writes, and preset entries are arrays of distinct known strings, including `[]`. Omitted defaults select every choice. Values normalize to declaration order, compare by content, and are copied and frozen. Named charts and results can use these choices as [record filters](../data/data-blocks.md#record-filters).
- `data-df-parameter` binds a generated control or a matching native input (`input[type=range]`, `input[type=checkbox]`, `select`, `select[multiple]`). Select and multiselect controls take a [choice style](#choice-styles). For generated controls, `data-df-parameter-label` sets the label and `data-df-parameter-digits` overrides the range readout precision. Native controls can use an HTML label or `data-df-parameter-label` for an accessible name. Include static starting text or native control defaults for JS-off reading.
- `data-df-bind` evaluates an author-supplied JS expression in the resolved scope with Math members available. `data-df-template="Gain {{gain|1}}"` fills expression slots with optional precision. Direct references use definition precision. Other numbers default to up to three decimals. `.df-math` output re-renders with math enabled, and mixed templates can include `$…$`. Use named controller lookups for calculations across scopes.
- `data-df-preset` accepts a nonempty JSON object of known values, including numeric strings for numeric parameters. Invalid presets warn and get `aria-disabled="true"`. Every matching preset gets `aria-current="true"`.

## Choice styles

```html
<div data-df-parameter="mode" data-df-parameter-label="Mode"></div>
<div data-df-parameter="runs" data-df-parameter-style="combobox"></div>
<label>Mode <select data-df-parameter="mode" data-df-parameter-style="chips" data-df-parameter-label="Mode">
  <option>Raw</option><option selected>Scaled</option></select></label>
```

- `data-df-parameter-style`: `auto` (default), `chips`, `combobox`, or `native`; per control, so one parameter can have several styles. Unknown values report and fall back to `auto`.
- `auto` on a generated host: chips when the set has ≤ 8 choices and ≤ 80 label characters in total, else combobox. `auto` on an authored `select` keeps it native.
- `native` on a generated host: `select` for single, labeled checkbox fieldset (`.df-param-multiselect`) for multiple.
- Chips (`.df-param-chips`): `span.df-param-label` + `.df-chips` (`role="radiogroup"` or `"group"`, `aria-labelledby`) of `label.df-chip` pills wrapping visually hidden native radio (one `name` per control) or checkbox inputs. Chosen chips get `.is-selected`. Arrow keys move between chips and wrap; Home/End jump; single choice also chooses, like native radios; modified keys stay native. Single: `.df-chips-glider` slides to the chosen chip (`--df-chip-x/y/w/h` from offsets, first placement and hidden groups do not slide, ResizeObserver re-places it after wrapping). Multiple: the chosen chips fill and grow a check mark.
- Combobox (`.df-param-combobox`): `label` + `input[role=combobox]` with `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, over `ul[role=listbox]` of `li[role=option][aria-selected]` in a `.df-dropdown-panel` manual popover placed by `DocForm.dropdowns.follow`. Without the Popover API or `dropdowns` the panel drops below the field in place (`hidden` toggles).
  - Typing filters by label or value (case- and accent-insensitive substring), underlines the first match with `mark`, and activates the first match; "No matching choices" shows as a status. Click, ↓/↑ (open, then move with wrap), Enter picks the active option, Escape closes, Tab and focus leaving the control close. Pointer down in the panel keeps focus in the field.
  - Single: the field shows the chosen label; focus selects it; picking closes; closing restores the label.
  - Multiple: `aria-multiselectable`; Enter or click toggles and keeps the panel open; chosen values show before the field as `.df-combo-chip` items in declaration order with a `Remove <label>` button (new chips get `.is-new` and scale in); Backspace in an empty field removes the last; All and None actions disable when they would change nothing; a count reads `n of m chosen`.
- An authored `select` with `chips` or `combobox` is hidden (with its wrapping `label`), the generated control follows it, and the hidden select stays in step. Scripts off: the native select shows and reads the starting value. Name it with `data-df-parameter-label` or `aria-label`.

## Linking without scripts

- `data-df-show-when="expr"` shows the element while the expression (resolved scope, Math in scope) is truthy; an empty array counts as false. Add `data-df-show-value="text"` to show only when the result, or any item of an array result, equals that text as a string (for example a multiselect containing a choice). Scope resolution matches controls. Elements get `.df-show-when` and the `hidden` attribute; changes fade and settle over 0.2 s (`.df-show-enter`/`.df-show-leave`), startup applies without animation. A failing expression reports once and leaves the element shown. Scripts off: everything stays visible.
- Chart bindings: `data-df-chart-bind='{"bins":"bins","reference":"cut * 2"}'` on a chart host, or `options.chart.instances.<id>.bind` (the attribute wins). Each value is an expression in the host's resolved scope. Targets: `bins`, `orientation`, `stack`, `reference` (first reference line value) or `reference.N` (0-based; the line must exist in the spec), `colorMin`/`colorMax` (heatmap `scale.min`/`scale.max`; null = automatic), `series` (visible series keys: a key, an array, or null for all), `range` (`[lo, hi]` x range or null). Unknown targets, bad JSON, or no `parameters` feature report an issue and leave the chart unbound.
- Spec targets apply over every spec the chart receives (markup, `update`, named sources, Reset); `spec()` returns the unbound spec. `series` and `range` set the reader view after each replacement; legend clicks and brushing still change it locally until the parameters change again. Changes tween like `update`.
- Each scope commit evaluates every binding in the scope. A result the chart cannot draw (validation error, unknown series key, unusable range, missing reference line) rejects the whole parameter update: values, controls, and other views keep their prior state, and the issue names the chart. Initial values that fail validation leave the chart undrawn with the usual chart warning.
- `select` and `multiselect` definitions accept `selectionGroup: "name"` and `selectionMode: "both" | "publish" | "follow"` (default both); other types or invalid values reject the definition. Needs the `selection` feature. Choice values are the group keys.
  - Publish: a select publishes its value on every committed change (not at startup); a multiselect publishes the last choice added, and clears the group when the shared key is removed.
  - Follow: a group key among the choices sets the select or is added to the multiselect, with origin `selection`. Clearing or a key outside the choices leaves the value. Startup follows the group's starting key; following choices count as participants for stored keys.
  - Generated chips, combobox options, and native checkbox labels carry the group and key, so they get the linked highlight.

## Controller

- `DocForm.parameters.define(name, definitions)` registers a new scope during setup and returns its controller or `null`. A duplicate scope or invalid definition rejects registration. `DocForm.parameters.scope(name = 'page')` looks up a scope and returns its controller or `null`.
- Controller methods `get(key)`, `snapshot()`, `set(key, value)`, `update(values)`, `reset()`, and `subscribe(fn, {keys?, immediate?}?)`. Snapshots are detached and frozen. Unknown reads return `undefined`. Writes require typed values. A nonempty batch validates all entries before applying any. Mutations return a boolean for acceptance. Reset restores the scope's declared defaults.
- `fn(current, {previous, changedKeys, origin})` runs once per affected batch. `keys` optionally filters notifications. `immediate: true` publishes a first snapshot with `previous: null`, `origin: 'init'`, and the watched keys (all keys by default). Setup subscriptions receive it after enhancement. The returned function unsubscribes.
- Controls, presets, and record-filtered views synchronize before callbacks. An incompatible filter change preserves the prior scope and views. Text bindings coalesce per animation frame. The document event `df:parameters:change` follows callbacks with `{scope, current, previous, changedKeys, origin}`. Origins are `api`, `user` for controls and presets, `reset`, and `selection` for group-following writes. Only committed changes emit events.


[Figure steps](figure-steps.md) · [Animations](animations.md) · [Charts](../data/charts.md) · [Linked selection](linked-highlighting.md) · [Source](../../js/params.js)
