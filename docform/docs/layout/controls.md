# Reading controls

Enable the `controls` feature. The module inserts the top-left pill without author markup after synchronous module initialization. It always adds a page progress ring. Other buttons depend on available features.

| Control | Requirement and action |
| --- | --- |
| `N` | Sidebar present. Cycle desktop modes `shown` → `hidden` → `auto` → `shown`. On a narrow or hoverless screen with `nav.js`, toggle the drawer. |
| `F` | At least one `h2` or `h3`. Toggle focus mode. |
| `J` / `K` | At least one `h2` or `h3`. Jump to the next or previous heading. |
| `T` | `theme.js`. Switch light/dark. |
| `Ctrl+K` / `Cmd+K` | `search.js` handles the shortcut and provides the pill button. |

- Single-letter shortcuts ignore editable controls, composition, and Ctrl/Cmd/Alt combinations. The progress ring reflects the scroll position over the scrollable page height.
- Focus mode blurs top-level content blocks outside the section at the viewport centre and outside the central 20–80% viewport band. The title stays sharp. Hover reveals a dimmed block.
- Auto sidebar opens at the first 8 px on the left, stays open during pointer or keyboard interaction, and closes on leaving. Page scrollbar reveals within 40 px of the right edge.
- `DocForm.controls.snapshot()` returns `{focus, nav, navMode}`. `nav` reports desktop visibility including a temporary auto peek. Use `setFocus(on)` or `setNavMode('shown'|'hidden'|'auto')`. Set initial `focus` and `navMode` in `options.controls`. Saved preferences take precedence.

[Navigation](navigation.md) · [Theme](theme.md) · [Search](../reading/search.md) · [Controls source](../../js/controls.js)
