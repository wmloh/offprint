# Standalone export

Reading-pill **Export** (footer link when `controls` is off) builds one offline HTML file from selected pages. Desktop Chrome, JavaScript on, page opened from disk. [Site structure](site-structure.md) · [Reading controls](../layout/controls.md)

## Dialog

- Pick the documentation root (pages, manifest, assets), then pages in manifest order, then build a preview and download. Bundled library styles and KaTeX fonts are included. Changing mode, pages, or consent needs a fresh preview.
- Start state: active page's committed live view; other pages' browser-local saved views; else authored defaults. Preview lists view sources, fallbacks, import-derived content, missing assets, unavailable links, and exact HTML bytes.
- **Saved reading data**: clears this browser's saved views and imports for the document after confirmation and discards the preview. Hidden when browser-local state is off.

## Modes

- **Reader** (default): captured page content. Declarative figure steps and their details stay steppable; other controls show their captured state.
- **Interactive**: restarts the active page's supported built-in controls from authored inputs: card panels and nested controls, timed SVG animations, pipelines, sequences, trees, timelines, charts and playback, linked views, zoom tools. Committed changes replay on revisits within the open file. Missing inputs or failed startup fall back to that page's Reader capture.
- Interactive embeds authored data automatically. **Include full imported datasets** opts in per page and file revision; preview lists bytes and consumers. A page needing an omitted import uses its Reader capture, which can still show values from that file; reset imports and clear saved data first to exclude them.

## Exported file

- Sidebar lists selected page groups and outlines the active page's visible `h1`–`h3` (honours `data-df-no-outline`). Routes `#page-N` and `#page-N/heading-id` with Back/Forward.
- Fixed pill keys: `N` navigation, `F` focus, `T` theme, `J`/`K` headings; progress ring per page. Sidebar mode, width, focus, and theme persist across pages. `N` cycles shown/hidden/auto on desktop (auto: approach left edge or Down Arrow on the button; resize by drag or Left/Right/Home/End); on narrow or touch-only screens it opens the drawer (Escape or backdrop closes).
- Arrow pill for adjacent pages. Definitions work on hover, focus, and touch. Supported assets embedded; links to omitted pages disabled; external links work when online.

## Local author scripts

Interactive only. Build a preview, tick **Include local author scripts** per page, rebuild. Dependencies and resources list under their owner; paths resolve against the authored page and must stay in the selected folder; unavailable ones are flagged. Clearing consent drops payloads only those scripts used.

```html
<script src="widgets.js"
  data-df-export-dependencies='["helpers.js"]'
  data-df-export-resources='["labels.json", "marker.svg"]'></script>
```

- Ordered classic scripts run on open; dependencies run in declaration order before the first enabled script needing them; external `defer` scripts run after ordinary ones. `DocForm.setup`/`ready` order is kept; listeners get a replayed `DOMContentLoaded`.
- In the export frame: `DocFormExportFiles.text("labels.json")` reads a declared UTF-8 file; `DocFormExportFiles.url("marker.svg")` gives a declared image or font URL. Use normal paths on the original page.
- Isolated frame: page DOM, classic globals, and the DocForm lifecycle only; no storage, network or file reads, popups, or parent access. Navigate with exported routes. Unsupported: modules, `async`, parser-time APIs, browser dialogs.
- Startup or uncaught script errors switch the page to its Reader capture. Enable only trusted scripts.

[Authoring: export rules](../AUTHORING.md#export-hard-requirement) · [Reader state](../../js/reader-state.js) · [Package source](../../js/export-package.js)
