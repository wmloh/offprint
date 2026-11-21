# Sidebar and heading navigation

Enable the `navigation` feature. Place `<nav class="df-sidebar"><div data-df-nav></div></nav>` before `<main class="df-page">`, or let the module supply missing elements. The module replaces the host contents. Keep authored sidebar links as a static fallback where needed.

- Uses manifest `pages` and `order` for the site tree and adjacent page links. The links appear at the bottom and, with `controls`, in a floating pill. Both show only available directions. Without a tree or a listed current page, renders a standalone outline. Add `data-df-no-pager` to the reading main to suppress both sets of links.
- Page groups use a divider and semibold label. A page's sidebar outline lists its `h1` headings in document order, even when a heading repeats the page title. Add `data-df-no-outline` to a heading or ancestor to exclude it. Missing IDs derive from heading text with collision suffixes. Heading link buttons copy the section URL.
- Scroll-spy highlights the section at or above the reading line (30% of viewport height, lower near the page end). Use the caret to open or close a group. Outlines for other pages require an offline index containing heading anchors for `h1`. Rebuild older indexes with the asset tool. [Search](../reading/search.md)
- Drag the sidebar's right separator to resize. A focused separator accepts Left/Right in 16 px steps and Home/End for bounds. Double-click resets. Width is clamped between 200 px and the lesser of 480 px and 40% of the viewport (minimum 200 px), and persisted under `docform-nav-width`.
- At 860 px and below, or when `any-hover: none`, navigation uses an overlay drawer. Escape, backdrop click, or a navigation link closes it. The `df:navigation:drawer` event on `document` reports `{current, previous, origin}` with `{open}` states.
- With the desktop sidebar hidden, the numbered rail includes `h1` and `h2` in document order. Current and prior headings show progress, and hover or keyboard focus reveals heading labels.

[Manifest](../setup/manifest.md) · [Reading controls](controls.md) · [Navigation source](../../js/nav.js)
