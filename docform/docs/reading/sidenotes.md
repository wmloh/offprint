# Sidenotes

Enable `sidenotes`. Put `.df-note` inline at its reference point. Notes get page-wide numbers, stable author IDs or generated `df-note-<n>` IDs, and marker buttons.

```html
<p>The data has a gap.<span class="df-note">The monitor was offline for one hour.</span></p>
```

- Eligible notes use the right margin when it fits `--df-note-width` (240 px), `--df-note-gap` (32 px), and a 16 px edge. Hover links the marker and note visually. Clicking a margin marker flashes its note.
- Narrow layouts and notes inside split views, tables, figures, code, tabs, card panels, figure steps, or peek panels use the marker's hover/focus card when `tooltips` is enabled. Without tooltip JS the marker toggles the note in place. Without notes JS the note appears as a muted parenthesized aside.
- The offline entry mounts `peek-bubbles` before `sidenotes` so moved content is measured in its panel. `DocForm.sidenotes.fits(viewWidth, columnRight, width, gap, edge)` tests margin fit. `layout()` is available after notes initialize.

[Tooltips](tooltips.md) · [Sidenote source](../../js/notes.js)
