# Site structure

A project uses one complete `docform/` library and one or more site roots, such as documentation, reports, or per-experiment viewers, that share it. Export asks for a site root and uses the library’s bundled styles and fonts.

## Rules

- Site root holds every page, its one manifest, data sources and wrappers, search index, media, fonts, author scripts and stylesheets. Nothing a page loads may sit outside it except the library.
- Several sites may share one library. Keep site roots as siblings, never nested: manifest discovery scans the chosen folder, and several manifests make the CLI error and the asset tool ask. Sites share nothing but the library. Export disables links to another site's pages.
- Data sources resolve inside the site root; refresh rejects paths that leave it.
- Library: copy `docform/` whole, keeping `docform.js`, `css/`, `js/`, `tools/`, `vendor/` as shipped. Point the pages’ script URLs to its location.
- Local URLs are relative: pages → library, manifest, assets, other pages. No `file://`, drive letters or root-absolute `/` paths. `../` may leave the root only to reach the library.
- Manifest lives inside the root. Every manifest page path resolves inside the root.
- Match path case exactly; export lookups are case-sensitive even on Windows.
- Remote resources are not embedded; they are reported and left out. Store needed media locally. Video keeps its poster only.
- Load generated data through `assets.data` wrappers ([data wrappers](../tools/file-wrapper.md)); reader-imported files need no folder (saved in the browser).
- No unrelated heavy trees (`.git`, `node_modules`, build output, raw archives) inside the root.

## Suggested layout

See [authoring conventions](../AUTHORING.md#project-layout) for the recommended layout. Layout is a convention; the rules above are what export relies on. For export, select the site root (the dialog's documentation folder).

[Offline setup](setup.md) · [Site manifest](manifest.md) · [Reading controls → export](../layout/controls.md)
