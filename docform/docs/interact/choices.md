# Choice groups

`choices` feature (`js/choices.js`, `css/choices.css`). Loaded by `parameters`, `chart`, `results`, `matrix`, and `scenarios` (via `chart`). Every single or multiple choice in the library renders through `DocForm.choices.create`; authors reach it through [parameter fieldsets](parameters.md#choice-groups).

```js
const group = DocForm.choices.create({
  host: fieldsetOrNull, label: 'Measure', hideLabel: false, multiple: false,
  options: [{ value: 'count', label: 'Count', swatch: el, note: 12, title: 'tip', mark: (el) => {} }],
  display: 'auto', className: 'df-matrix-picker', onChange: (value) => {}
});
container.appendChild(group.el);
group.show('count'); // starting value, then after every accepted change
```

- Value: string (single) or array in option order (multiple). `onChange` gets the proposed value; the caller commits and calls `show`, or calls `show(previous)` to roll back.
- Returns `{ el, display, mismatch, show }`. `el` is the fieldset (`host` when it is a `FIELDSET`, else new). `mismatch`: authored inputs existed but did not match (`input.type` radio/checkbox, distinct values equal to the option set); they were removed.
- `display`: `auto` | `chips` | `combobox`; else `data-df-choice-display` on the host; unknown warns and uses `auto`. `auto` → chips when ≤ `DocForm.choices.limit` (7) options and ≤ `textLimit` (80) total label chars, else combobox. Callers force `chips` for legends and filter values.
- DOM: `fieldset.df-choices.df-choices-{chips|combobox}[.is-multiple]` > `legend.df-choices-label` (eyebrow small caps; `.is-hidden` visually hidden) + chips or `.df-combo`. No wrapper divs, no border, no panel.
  - Chip: `label.df-chip[.is-selected]` > `input.df-chip-input` (transparent overlay; one shared `name` per group, authored name kept) + `span.df-chip-check` (multiple) + swatch + `span.df-chip-text` + `span.df-chip-note`. Authored label text moves into `.df-chip-text`; empty text falls back to the option label.
  - Single: `span.df-choices-glider` slides to the chosen chip (`--df-chip-x/y/w/h` from offsets; `.df-choices-still` skips the first placement; ResizeObserver re-places). Multiple: chosen chips fill with `--df-accent-bg` and grow the check.
  - Arrow keys move and wrap, Home/End jump; single choice also chooses; modified keys stay native.
  - Combobox: `input[role=combobox]` labelled by the legend over `ul[role=listbox]` in a `.df-dropdown-panel` manual popover via `DocForm.dropdowns.follow` (in-place `hidden` panel without it). Typing filters by folded label or value with a `mark`; ↓/↑ wrap; Enter picks; Escape/Tab/focus-out close. Multiple: removable `.df-combo-chip` items in option order (`.is-new` scales in), Backspace removes the last, All/None, `n of m chosen`.
- Ripple: `span.df-ripple` (`--df-ripple-x/y/size`) spreads from the pointer on `pointerdown`, or from the centre for keyboard changes (a change > 600 ms after the last press), arrow choices, and Enter in a combobox; removed on `animationend`. Runs regardless of `prefers-reduced-motion` (user decision). `DocForm.choices.ripple(el, event?)` for other pressables; `el` needs `position: relative; overflow: hidden`.
- Colour: `--df-accent`/`--df-accent-bg` from `data-df-role`/`data-df-color` on the group or an ancestor. Results groups default to blue.
- `DocForm.choices.read(fieldset)` → `[{ value, label, checked }]` from authored items. `DocForm.choices.display(requested, options)` is the pure display rule.
- Users: parameter fieldsets; chart `toggles` (`.df-chart-series-toggles`, hidden legend, `.df-chart-series-toggle` chips with series swatches, chosen = shown); results quick filters (`.df-filter-chips`) and column value lists (`.df-filter-values`, counts as notes); scenario variants (`.df-scenarios-chooser`); matrix measures (`.df-matrix-picker`, rebuilt per render, absent with one measure).

[Parameters](parameters.md) · [Dropdowns](dropdowns.md) · [Styles](../../css/choices.css) · [Source](../../js/choices.js)
