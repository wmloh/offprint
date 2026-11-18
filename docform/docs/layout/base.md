# Base layout and typography

Enable `base` (included in the reading profile and `docform.css`). Use `<main class="df-page">` as a direct child of `body`. An optional sibling `<nav class="df-sidebar">` enables the desktop sidebar grid. Author headings, paragraphs, figures, and tables in reading order.

- Desktop with a hover-capable pointer and viewport wider than 860 px. The reading column caps at `--df-content-width` (1120 px) plus two `--df-page-gutter` values (24 px each). It centers in the viewport when the sidebar clears it and shifts beside the sidebar otherwise. It sizes against the configured sidebar width in either visibility state.
- At 860 px and below, or with no hover-capable pointer, the base layout stacks and uses 16 px inner gutters. [Navigation](navigation.md) enhances the sidebar into a drawer. The design viewport is 1920 × 1080.
- Default typography is 16 px system sans-serif at line height 1.6. `h1`, `h2`, and `h3` use 1.875, 1.5, and 1.25 em. A first-child `h1` directly under `.df-page` uses 2.5 em. `h4`–`h6` use 1 em. Code uses the mono token. Underlined links use `--df-link`.
- Standalone figures, tables, media, and captions center where applicable. Tables and code blocks scroll horizontally inside the reading column. Table hover tints the row and, for the first 12 cell positions, the column, headers included.
- Lists use accented counter badges and dots with hover feedback. The tint follows `data-df-color` or `data-df-role` on an item, list, or ancestor, with gray as the default. Put `data-df-no-list-style` on a list or ancestor for native markers. Navigation lists, lists with an explicit `role`, and the roles legend also skip custom markers.
- Sidebar, table, and `pre` scrollbars use a transparent thumb until hover or visible focus. The page scrollbar is handled by [reading controls](controls.md).

[Tokens](tokens.md) · [Wide blocks](wide.md) · [Stylesheet](../../css/base.css)
