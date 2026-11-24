# Reading controls

Enable `controls`. Inserts the top-left pill (no markup) with a page progress ring; other buttons depend on enabled features.

| Control | Requirement and action |
| --- | --- |
| `N` | Sidebar present. Cycle desktop modes `shown` → `hidden` → `auto` → `shown`. On a narrow or hoverless screen with `navigation`, toggle the drawer. |
| `F` | Toggle focus mode. |
| `J` / `K` | At least one `h2` or `h3`. Jump to the next or previous heading. |
| `T` | `theme`. Switch light/dark. |
| `S` | `search` handles the shortcut and provides the pill button. |
| Export | Open the [standalone export](../setup/export.md) dialog. Moves to the page footer when the pill is unavailable. |
| Previous / Next | `navigation` and an adjacent manifest page. Separate arrow pill to the right; hints name the destination; hidden while the narrow drawer is open. |

- Binding IDs and remapping: [keyboard shortcuts](../interact/shortcuts.md). Progress = scroll position over scrollable height.
- With `tooltips`, pill buttons use [control hints](../reading/tooltips.md) showing effective keys; the progress hint updates on scroll. Without it: native `title` (Export: none).
- Focus mode blurs each content element outside the central 20–80% viewport band, regardless of section. Plain `section`, `article`, and attribute-free `div` wrappers are opened so their children blur individually. The title stays sharp. Hover reveals a dimmed block. Section lines are in a separate layer and are never blurred or dimmed.
- Auto sidebar opens at the first 8 px on the left, stays open during pointer or keyboard interaction, and closes on leaving. A plain pointer click on a sidebar link to another page stores a timestamp in `sessionStorage` (`offprint-nav-peek`, read and cleared on load, honoured within 5 s); the next page then starts peeking and closes on the first pointer move outside the panel. Page scrollbar reveals within 40 px of the right edge.
- Initial `focus` and `navMode` via `options.controls`; saved preferences win.

[Navigation](navigation.md) · [Theme](theme.md) · [Search](../reading/search.md) · [Export](../setup/export.md) · [Controls source](../../js/controls.js)
