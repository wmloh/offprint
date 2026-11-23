# Section lines

CSS loads with `base` (also in `offprint.css`). Script feature `sections` is in the reading profile. Applies to `h2` elements that are direct children of the main `.op-page` (bubble bodies excluded). No opt-out attribute; restyle through tokens.

- Colour: `h2` index `i` among page `h2`s takes `--op-section-cycle[i % n]`, set as inline `--op-section-color: var(--op-<name>)`. Unknown names warn and drop; empty cycle falls back to `blue green purple orange pink brown`. `data-op-color` or `data-op-role` on the `h2` uses its `--op-accent` instead and keeps its slot (later colours do not shift). Heading text keeps `--op-h2` unless the heading itself is accented.
- Line: `--op-section-line-width`, cycle colour mixed to `--op-section-line-strength`, uniform along its length, `--op-section-offset` left of the column. Without the script (and in print) it is the heading's `h2::before` at heading height. With it, the page gets `.op-sections-drawn` (`position: relative`, `::before` hidden) and a last child `div.op-section-lines[aria-hidden]` holding one absolutely positioned `span.op-section-line` per `h2` (heading's `data-op-color`/`data-op-role` copied, `--op-section-color` set). Each runs from the heading top to the bottom of the last visible block before the next `h2` or page end (skips `script`, `style`, `template`, `.op-pager`, hidden and fixed/absolute blocks); inline `--op-section-length` on the `h2` holds the same length.
- Never filtered: the layer is outside every heading and block and is excluded from focus-mode blocks, so focus blur and dimming never reach the lines.
- No `h3` lines or colours.
- Updates: window resize, page `ResizeObserver`, direct child additions or removals, `data-op-color`/`data-op-role` changes on page `h2`s, `transitionend` on page children, body, sidebar, or section rail, and font loading.
- Clearance: while a visible `.op-section-rail` reaches within 8 px of the line, the page gets `.op-sections-covered` and lines hide. Narrow layout (≤ 860 px or no hover) uses a 9 px offset. Print shows heading-height lines only. Lines sit under fixed overlays (drawer, zoom, search).
- Pure helper: `cycle(text)` returns named colours.

[Stylesheet](../../css/sections.css) · [Script](../../js/sections.js) · [Base layout](base.md) · [Tokens](tokens.md)
