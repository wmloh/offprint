# Text roles

Loads with `base` (reading profile and `offprint.css`); CSS only, no script. Two roles for visual hierarchy: eyebrows and labelled fields. Tokens in [tokens](tokens.md).

```html
<p class="op-eyebrow">Incident review</p>
<h1>Investigate a telemetry incident</h1>
<dl class="op-fields">
  <dt>Input</dt><dd>Standardized window</dd>
  <dt data-op-role="alert">Alert when</dt><dd>Residual above 0.80</dd>
</dl>
```

## Eyebrow `.op-eyebrow`

- Block of a few words of context placed directly before the heading or block it introduces: section kicker, "Step 2 of 4", "What happens". Not a heading; not in the outline or search titles (indexed as body text).
- Muted `--op-text-label`, `--op-eyebrow-size` (max(12px, 0.75em)), weight 650, tracking 0.07em, `text-transform: var(--op-eyebrow-case)` (uppercase). Write sentence case; CSS capitalizes, so screen readers read words. `--op-eyebrow-case: none` turns caps off site-wide (dyslexia, early readers).
- Accent text from `data-op-color`/`data-op-role` on the eyebrow or its parent.
- Spacing inside `.op-page`: 1.25em above, 0.2em below, 0 as first child; the next sibling's top margin is zeroed. Direct page child before `h2`/`h3` takes `--op-space-h2`/`--op-space-h3` instead and the heading loses its own top margin, so the pair keeps section spacing. First child of a page `header` before `h1` takes the h1's usual top margin (3.75 × `--op-font-size`), so titles line up across pages.
- Built-in labels on the same tokens: step pill count (`.op-pill-count`), `.op-step-heading`, peek panel page label, scenario "Changed conditions". Chart playback status stays sentence case.

## Labelled fields `.op-fields`

- On `<dl>`: muted aligned labels (`dt`, 0.9em, 600, `--op-text-label`) in a `fit-content(--op-field-label-width)` (11em) column beside values (`dd`). Optional `<div>` around each `dt`/`dd` pair (subgrid). Several `dd` under one `dt` share a row group.
- Hairline `--op-border` between rows; first row tight. `dd` first/last child margins zeroed, so paragraphs, lists, math, and tags fit.
- Accent labels: `data-op-color`/`data-op-role` on one `dt`, a pair `<div>`, or the whole list (values stay body colour).
- `container-type: inline-size`; below 30em of list width rows stack (label above value), e.g. split panes, step details, phones. Container sizing means the list collapses inside shrink-to-fit parents (inline-block, floats, `fit-content` grid tracks); give it a definite width there.
- Use for short facts with recurring labels (Inputs, Outputs, Why it happens). Use a table for comparisons across items, a concept table for definitions side by side.

[Tags](../reading/tags.md) · [Buttons](buttons.md) · [Stylesheet](../../css/text.css)
