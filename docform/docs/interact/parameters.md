# Parameters and presets

Load `css/params.css` and `js/params.js` after core. Load [math](../reading/math.md) before parameter setup for TeX. Parameter names are page-wide JS identifiers. Controls sharing a name need the same type and compatible values. The first supplies the initial value unless one was already set.

```html
<div class="df-params">
  <div data-df-param="gain" data-df-label="Gain" data-df-max="5" data-df-step="0.1" data-df-value="2"></div>
  <div data-df-param="mode" data-df-type="select">
    <option value="raw">Raw</option><option value="scaled" selected>Scaled</option>
  </div>
  <div data-df-param="trace" data-df-type="toggle" data-df-value="true"></div>
</div>
<p>Doubled gain is <span data-df-bind="2 * gain" data-df-digits="1">4.0</span>.</p>
<button type="button" data-df-preset='{"gain":2,"mode":"scaled","trace":true}'>Default</button>
```

- `range` is the default type. Use `data-df-min` (0), `data-df-max` (1), `data-df-step` (about 1/100 of the span), `data-df-value` (min), and `data-df-digits` (precision inferred from step). Assignments accept finite numbers or numeric strings within every matching slider's range.
- `select` uses distinct option values (text fallback). Initial choice is valid `data-df-value`, the first marked `selected`, or the first option. `toggle` is a switch with boolean values, initial `data-df-value="true"` or `"false"` (default false). `data-df-label` defaults to the name for all types.
- `data-df-bind` evaluates an author-supplied JS expression with parameter names and `Math` members in scope. `data-df-template="Gain {{gain|1}}"` fills `{{expression}}` slots with optional `|decimals`. A direct reference to a slider uses its precision. Other numeric bindings default to up to three decimals. `.df-math` output is re-rendered by math, and mixed templates can include `$…$`. Supply static starting text for JS-off reading.
- A preset is a nonempty JSON object of known parameter values. Validation is atomic. Invalid buttons warn and receive `aria-disabled="true"`. Every button whose supplied values match receives `aria-current="true"`.
- `DocForm.params.get(name)`, `values()` (snapshot), `set(name, value)`, and `apply(object)`. `set` and `apply` return true on success, false on rejection. `set` also accepts an undeclared name with a finite number. A batch propagates only changed values.
- `DocForm.params.on(nameOrArray, fn)` returns an unsubscribe function. `fn(snapshot, name, changedNames)` runs at setup or subscription if all requested names exist, then once per affected update. Initial calls use `name = null` and the subscribed names. A batch uses the sole changed name or `null` when several change. Controls update before subscribers, and text bindings are coalesced on the next animation frame. Call chart or figure APIs from the subscription to connect them to the controls.

[Figure steps](figure-steps.md) · [Animations](animations.md) · [Charts](../data/charts.md) · [Source](../../js/params.js)
