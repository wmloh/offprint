# Reading controls

Enable the `controls` feature. The module inserts the top-left pill without author markup after synchronous module initialization. It always adds a page progress ring. Other buttons depend on available features.

| Control | Requirement and action |
| --- | --- |
| `N` | Sidebar present. Cycle desktop modes `shown` → `hidden` → `auto` → `shown`. On a narrow or hoverless screen with `navigation`, toggle the drawer. |
| `F` | At least one `h2` or `h3`. Toggle focus mode. |
| `J` / `K` | At least one `h2` or `h3`. Jump to the next or previous heading. |
| `T` | `theme`. Switch light/dark. |
| `S` | `search` handles the shortcut and provides the pill button. |
| Export | Open the standalone export dialog. Shared tooltip panel hint, none without `tooltips`. The entry moves to the page footer when the reading controls are unavailable. |
| Previous / Next | `navigation` and an adjacent page in the manifest reading order. Arrow links appear in a separate pill to the right. Each link names its destination and the pill hides while the narrow-screen drawer is open. |

- [Keyboard shortcuts](../interact/shortcuts.md) lists the binding IDs and remapping options. The progress ring reflects the scroll position over the scrollable page height.
- When `tooltips` is active, the floating pills use the same tooltip cards as inline tips. Button hints show effective shortcut keys, and the progress hint updates as you scroll.
- Focus mode blurs top-level content blocks outside the section at the viewport centre and outside the central 20–80% viewport band. The title stays sharp. Hover reveals a dimmed block. Section lines are in a separate layer and are never blurred or dimmed.
- Auto sidebar opens at the first 8 px on the left, stays open during pointer or keyboard interaction, and closes on leaving. A plain pointer click on a sidebar link to another page stores a timestamp in `sessionStorage` (`docform-nav-peek`, read and cleared on load, honoured within 5 s); the next page then starts peeking and closes on the first pointer move outside the panel. Page scrollbar reveals within 40 px of the right edge.
- Set initial `focus` and `navMode` in `options.controls`. Saved preferences take precedence.

## Standalone export

- Use desktop Chrome with JavaScript enabled from a local page. Choose both folders: documentation root (page, manifest, assets) and DocForm library (contains `docform.js`). Both are required, even when the library sits inside the root. Layout rules: [site structure](../setup/site-structure.md). Pick pages in manifest order, build a preview, then download one HTML file.
- Dialog's **Saved reading data** section clears this browser's saved views and imports for the document after an in-dialog confirm; an existing preview is discarded. Hidden when browser-local state is off.
- The active page uses its committed live view. Sibling pages use browser-local saved views and accepted imports when available, with authored defaults for missing or stale state. The preview reports fallbacks, import-derived content, missing assets, unavailable links and output size.
- Open the download from disk with JavaScript enabled. The standalone reader provides contents, sequential navigation, internal heading links and definitions. Interactive source features are frozen and supported assets are embedded. External hyperlinks remain available when online.

[Navigation](navigation.md) · [Theme](theme.md) · [Search](../reading/search.md) · [Controls source](../../js/controls.js)
