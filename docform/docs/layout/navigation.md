# Sidebar and heading navigation

Load `css/nav.css` and `js/nav.js`. Place `<nav class="df-sidebar"><div data-df-nav></div></nav>` before `<main class="df-page">`, or let the module supply missing elements. The module replaces the host contents. Keep authored sidebar links as a static fallback where needed.

- Uses manifest `pages` and `order` for the site tree and Previous/Next pager. Without a tree, renders the current page outline. An unlisted current page gets a standalone outline, with no pager. Add `data-df-no-pager` to the reading main to suppress its pager.
- Outlines `h2` and `h3` and nests `h3` under the preceding `h2`. Add `data-df-no-outline` to a heading or ancestor to exclude it. Missing IDs derive from heading text with collision suffixes. Heading link buttons copy the section URL.
- Scroll-spy activates the last heading at or above the reading line (30% of viewport height, lower near the page end). The current subsection group opens. Hover temporarily opens groups until the pointer leaves the sidebar. Caret clicks hold a group's state for the current page visit. Indexed sections supply other pages' outlines. [Search](../reading/search.md)
- Drag the sidebar's right separator to resize. A focused separator accepts Left/Right in 16 px steps and Home/End for bounds. Double-click resets. Width is clamped between 200 px and the lesser of 480 px and 40% of the viewport (minimum 200 px), and persisted under `docform-nav-width`.
- At 860 px and below, or when `any-hover: none`, navigation uses an overlay drawer. Escape, backdrop click, or a navigation link closes it. `DocForm.nav.drawer` exposes `isOpen()`, `toggle(opener?)`, and `close()` after setup. `df:drawer` on `document` carries `detail: {open}`. The controls pill takes over the drawer button when present.
- With the desktop sidebar hidden, the numbered rail uses the same heading order. Current and prior headings show progress, and hover or keyboard focus reveals heading labels.

[Manifest](../setup/manifest.md) · [Reading controls](controls.md) · [Navigation source](../../js/nav.js)
