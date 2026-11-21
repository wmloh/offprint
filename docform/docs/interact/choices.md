# Choice groups

`choices` renders single- and multiple-choice controls for parameters, charts, results, matrices, and scenarios. Author choices through [parameter fieldsets](parameters.md#choice-groups).

- `display`: `auto` | `chips` | `combobox`; else `data-df-choice-display` on the host; unknown warns and uses `auto`. `auto` → chips when ≤ 7 options and ≤ 80 total label chars, else combobox. Callers force `chips` for legends and filter values.
- DOM: `fieldset.df-choices.df-choices-{chips|combobox}[.is-multiple]` > `legend.df-choices-label` (eyebrow small caps; `.is-hidden` visually hidden) + chips or `.df-combo`. No wrapper divs, no border, no panel.
  - Chip: `label.df-chip[.is-selected]` > `input.df-chip-input` (transparent overlay; one shared `name` per group, authored name kept) + `span.df-chip-check` (multiple) + swatch + `span.df-chip-text` + `span.df-chip-note`. Authored label text moves into `.df-chip-text`; empty text falls back to the option label.
  - Single: `span.df-choices-glider` slides to the chosen chip (`--df-chip-x/y/w/h` from offsets; `.df-choices-still` skips the first placement; ResizeObserver re-places). Multiple: chosen chips fill with `--df-accent-bg` and grow the check.
  - Arrow keys move and wrap, Home/End jump; single choice also chooses; modified keys stay native.
  - Combobox: `input[role=combobox]` labelled by the legend over `ul[role=listbox]` in a `.df-dropdown-panel` manual popover. Typing filters by folded label or value with a `mark`; ↓/↑ wrap; Enter picks; Escape/Tab/focus-out close. Multiple: removable `.df-combo-chip` items in option order (`.is-new` scales in), Backspace removes the last, All/None, `n of m chosen`.
- Ripple: `span.df-ripple` (`--df-ripple-x/y/size`) spreads from the pointer on `pointerdown`, or from the centre for keyboard changes (a change > 600 ms after the last press), arrow choices, and Enter in a combobox; removed on `animationend`. Runs regardless of `prefers-reduced-motion` (user decision).
- Colour: `--df-accent`/`--df-accent-bg` from `data-df-role`/`data-df-color` on the group or an ancestor. Results groups default to blue.
- Users: parameter fieldsets; chart `toggles` (`.df-chart-series-toggles`, hidden legend, `.df-chart-series-toggle` chips with series swatches, chosen = shown); results quick filters (`.df-filter-chips`) and column value lists (`.df-filter-values`, counts as notes); scenario variants (`.df-scenarios-chooser`); matrix measures (`.df-matrix-picker`, rebuilt per render, absent with one measure).

[Parameters](parameters.md) · [Dropdowns](dropdowns.md) · [Styles](../../css/choices.css) · [Source](../../js/choices.js)
