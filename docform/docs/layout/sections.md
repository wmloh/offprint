# Section lines

CSS loads with `base` (also in `docform.css`). Script feature `sections` is in the reading profile; API `DocForm.sections`. Applies to `h2` elements that are direct children of the main `.df-page` (bubble bodies excluded). No opt-out attribute; restyle through tokens.

- Colour: `h2` index `i` among page `h2`s takes `--df-section-cycle[i % n]`, set as inline `--df-section-color: var(--df-<name>)`. Unknown names warn and drop; empty cycle falls back to `blue green purple orange pink brown`. `data-df-color` or `data-df-role` on the `h2` uses its `--df-accent` instead and keeps its slot (later colours do not shift). Heading text keeps `--df-h2` unless the heading itself is accented.
- Line: single `h2::before`, `--df-section-line-width`, colour `--df-section-line` (cycle colour mixed to `--df-section-line-strength`), uniform along its length, `--df-section-offset` left of the column. Without the script (and in print) it spans the heading height; with it, inline `--df-section-length` runs from the heading top to the bottom of the last visible block before the next `h2` or page end (skips `script`, `style`, `template`, `.df-pager`, hidden and fixed/absolute blocks). Continuous: it paints over tables, figures, and wide blocks that reach the margin, without gaps.
- No `h3` lines or colours.
- Updates: window resize, page `ResizeObserver`, direct child additions or removals, `data-df-color`/`data-df-role` changes on page `h2`s, `transitionend` on page children, body, sidebar, or section rail, and font loading. `DocForm.sections.layout()` forces a pass and returns `false` before setup.
- Clearance: while a visible `.df-section-rail` reaches within 8 px of the line, the page gets `.df-sections-covered` and lines hide. Narrow layout (≤ 860 px or no hover) uses a 9 px offset. Print shows heading-height lines only. Lines sit under fixed overlays (drawer, zoom, search, bubble panels).
- Pure helper: `cycle(text)` returns named colours.

[Stylesheet](../../css/sections.css) · [Script](../../js/sections.js) · [Base layout](base.md) · [Tokens](tokens.md)
