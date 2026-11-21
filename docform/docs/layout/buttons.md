# Buttons

Loads with `base` (reading profile and `docform.css`); no script. Put `.df-button` on a `<button>` or `<a>` for author actions.

```html
<button type="button" class="df-button" data-df-role="alert"><svg viewBox="0 0 16 16" aria-hidden="true">…</svg>Zoom to the alert</button>
<button type="button" class="df-button" data-df-color="blue">Run again</button>
```

- Soft tinted pill: accent tint background, accent text, faint accent ring, no border. Colour from `data-df-color` or `data-df-role` on the button or an ancestor (inherited `--df-accent`); neutral gray tint with body text otherwise.
- Optional leading icon: first child `svg` or `.df-button-icon`, sized 1.05 em. Mark decorative icons `aria-hidden="true"`.
- Hover lifts 1 px with an accent shadow; active drops back. `:focus-visible` draws a 2 px ring in the accent, else `--df-focus`. `:disabled` or `aria-disabled="true"` fades to 50 % without lift. `hidden` hides it.
- Font size follows the context; module rules may set compact padding or size.
- Module text buttons use the same class: chart Reset range and Table, data Show more and Show anyway, tree Expand all and Collapse all, dropzone Choose a file and Reset, results Clear filters, filter-menu All, None, and Reset column. Results filter chips keep their toggle chip look.

## Step pill

- `.df-pill` is a frosted, bordered group (`role="group"`, aria-label) with `margin-inline-start: auto`, so it sits right-aligned above stepped content. Used by [steppers](../interact/worked-examples.md), [chart playback](../data/chart-playback.md), and [scenarios](../interact/scenarios.md).
- The icon buttons have accessible labels. The count uses the [eyebrow](text-roles.md) style and announces step changes.
- Buttons use `aria-disabled="true"` (35 % opacity, clicks ignored) so focus stays at ends. `:focus-visible` draws a `--df-focus` ring.

[Tags](../reading/tags.md) · [Colour roles](roles.md) · [Stylesheet](../../css/buttons.css)
