# Text roles

Loads with `base` (reading profile and `docform.css`); CSS only, no script. Two roles for visual hierarchy: eyebrows and labelled fields. Tokens in [tokens](../layout/tokens.md).

```html
<p class="df-eyebrow">Incident review</p>
<h1>Investigate a telemetry incident</h1>
<dl class="df-fields">
  <dt>Input</dt><dd>Standardized window</dd>
  <dt data-df-role="alert">Alert when</dt><dd>Residual above 0.80</dd>
</dl>
```

## Eyebrow `.df-eyebrow`

- Block of a few words of context placed directly before the heading or block it introduces: section kicker, "Step 2 of 4", "What happens". Not a heading; not in the outline or search titles (indexed as body text).
- Muted `--df-text-label`, `--df-eyebrow-size` (max(12px, 0.75em)), weight 650, tracking 0.07em, `text-transform: var(--df-eyebrow-case)` (uppercase). Write sentence case; CSS capitalizes, so screen readers read words. `--df-eyebrow-case: none` turns caps off site-wide (dyslexia, early readers).
- Accent text from `data-df-color`/`data-df-role` on the eyebrow or its parent.
- Spacing inside `.df-page`: 1.25em above, 0.2em below, 0 as first child; the next sibling's top margin is zeroed. Direct page child before `h2`/`h3` takes `--df-space-h2`/`--df-space-h3` instead and the heading loses its own top margin, so the pair keeps section spacing. First child of a page `header` before `h1` takes the h1's usual top margin (3.75 × `--df-font-size`), so titles line up across pages.
- Built-in labels on the same tokens: step pill count (`.df-pill-count`), `.df-step-heading`, peek panel page label, scenario "Changed conditions". Chart playback status stays sentence case.

## Labelled fields `.df-fields`

- On `<dl>`: muted aligned labels (`dt`, 0.9em, 600, `--df-text-label`) in a `fit-content(--df-field-label-width)` (11em) column beside values (`dd`). Optional `<div>` around each `dt`/`dd` pair (subgrid). Several `dd` under one `dt` share a row group.
- Hairline `--df-border` between rows; first row tight. `dd` first/last child margins zeroed, so paragraphs, lists, math, and tags fit.
- Accent labels: `data-df-color`/`data-df-role` on one `dt`, a pair `<div>`, or the whole list (values stay body colour).
- `container-type: inline-size`; below 30em of list width rows stack (label above value), e.g. split panes, step details, phones. Container sizing means the list collapses inside shrink-to-fit parents (inline-block, floats, `fit-content` grid tracks); give it a definite width there.
- Use for short facts with recurring labels (Inputs, Outputs, Why it happens). Use a table for comparisons across items, a concept table for definitions side by side.

[Tags](tags.md) · [Buttons](../interact/buttons.md) · [Stylesheet](../../css/text.css) · [PCA telemetry example](../../../examples/pca/pages/telemetry.html) · [Transformer attention steps](../../../examples/transformers/pages/attention.html#causal-mask)
