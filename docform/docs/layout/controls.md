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

- Use desktop Chrome with JavaScript enabled from a local page. Choose the documentation root that contains the pages, manifest, and assets. DocForm includes its bundled library styles and fonts. Pick pages in manifest order, build a preview, then download one HTML file. [Site structure](../setup/site-structure.md)
- Dialog's **Saved reading data** section clears this browser's saved views and imports for the document after an in-dialog confirm; an existing preview is discarded. Hidden when browser-local state is off.
- Both modes start with the active page's committed live view and sibling pages' browser-local saved views. Missing or stale views use authored defaults. The preview reports view sources, fallbacks, import-derived content, missing assets, unavailable links, and exact HTML bytes. Changing mode, pages, or consent requires a fresh preview.
- Open the download from disk with JavaScript enabled. The sidebar lists the selected page groups and outlines the active page’s visible `h1`–`h3` headings, respecting `data-df-no-outline`. Page and section links use `#page-N` and `#page-N/heading-id` routes with browser Back and Forward.
- The exported reading pill uses fixed shortcuts `N` for navigation, `F` for focus mode, `T` for theme, and `J` / `K` for heading jumps. The progress ring tracks the current page. Sidebar mode, width, focus mode, and theme carry across pages within the open export.
- `N` cycles shown, hidden, and auto-hide on desktop. In auto-hide, approach the left edge or press Down Arrow on the navigation button. Drag the separator or use Left Arrow, Right Arrow, Home, or End. On narrow and touch-only screens, `N` opens the drawer and Escape closes it. The dimmed area also closes the drawer.
- Separate arrow buttons move to adjacent pages. Inline definitions work on hover, focus, and touch. Supported assets are embedded. Links to omitted pages are disabled. External hyperlinks remain available when online.
- **Reader** (default) keeps captured page content and supports discrete declarative figure steps and their details. Other DocForm controls display their captured state.
- **Interactive** starts the active page's supported built-in controls from authored inputs. Includes card panels and nested controls, timed SVG animations, pipelines, sequences, trees, timelines, charts and chart playback, linked views, and zoom tools. Committed changes replay on revisits within the open export. Pages with missing inputs or failed startup use their Reader captures.
- Interactive automatically embeds authored data used by supported controls. **Include full imported datasets** separately opts in to each available page and file revision. The preview lists the file bytes and consumers. A page that needs an omitted import uses its Reader capture, which can contain rendered values from that file. Reset live imports and clear saved views and imports before exporting if those values should be excluded.

[Navigation](navigation.md) · [Theme](theme.md) · [Search](../reading/search.md) · [Controls source](../../js/controls.js)

### Local author scripts

Build an Interactive preview, use **Include local author scripts** to enable scripts for each page, and rebuild the preview. Dependencies and resources appear under their owner. Paths resolve against the authored page base and must be in the selected folder. Unavailable dependencies are shown in the preview. Clearing consent and rebuilding drops payloads used solely by the cleared choices.

```html
<script src="widgets.js"
  data-df-export-dependencies='["helpers.js"]'
  data-df-export-resources='["labels.json", "marker.svg"]'></script>
```

- Ordered classic scripts run automatically when the downloaded page opens. Dependencies run in declaration order before the first enabled script that needs them. External `defer` scripts run after ordinary scripts. `DocForm.setup` and `DocForm.ready` keep their startup order. Listeners receive a replayed `DOMContentLoaded` event.
- Read a declared UTF-8 file via `DocFormExportFiles.text("labels.json")`. Assign declared image and font URLs via `DocFormExportFiles.url("marker.svg")`. These APIs are available in the standalone author frame. On the original page, use the site's regular resource loading paths.
- Enable scripts you trust. Run code that uses the page's own DOM, classic globals, and the DocForm lifecycle. The isolated frame restricts storage, network and file reads, popups, and parent access. Use exported page routes for navigation. Modules, `async` scripts, parser-time APIs, and browser dialogs are unavailable.
- Startup errors and uncaught page-script errors switch the page to its readable capture.
