# Authoring conventions

Recommended structure and conventions for agents building OffPrint sites: documentation, reports, experiment-results viewers, or any mix in one project. Not enforced, but following them keeps pages exportable, consistent, and easy to maintain. Find feature references through [LIB_MAP.tsv](LIB_MAP.tsv), and read the relevant reference before writing markup.

## Project layout

A project holds one shared `offprint/` copy and one or more **sites**. A site is a self-contained root with exactly one manifest, its own navigation, search, glossary, and export. Names in `<…>` are placeholders.

```text
<project>/                      any repository; code, pipelines, and raw run outputs may sit beside the sites
  offprint/                      one shared library copy; never edit it
  <site>/                       site root, e.g. guide/ or sweep-results/; select it for export and refresh
    index.html                  first manifest page
    glossary.html               optional glossaryPage
    refresh-assets.py           site launcher for data wrappers and search index (see Data)
    pages/<group>/<page>.html   one folder per manifest group, one level deep
    assets/
      site.js                   manifest: the only shared configuration
      site.css                  optional single author stylesheet
      scripts/<name>.js         author scripts (last resort, see Custom code)
      data/                     raw named sources: dynamic, or large static
      generated/                wrappers and search index; tool output only
      media/                    local images, SVG, fonts, video posters
  <other-site>/                 same structure, loading the same ../offprint/
  <folder>/<site>/              sites may be grouped in plain folders; add one ../ per level
```

- Site root holds everything its pages load except `offprint/`. Use only relative URLs. `../` may leave the root only to reach the library. Match path case exactly. [Site structure](setup/site-structure.md)
- One site per reader-facing unit that needs its own navigation, search, and export: a guide, a report, one experiment's viewer. Put experiments in one site, one group each, when readers compare them or they share sources, terms, roles, selection groups, or parameter scopes. Those are per manifest and never cross sites.
- Sites are siblings, never nested: a site root contains no other manifest. Grouping folders above sites are plain folders, not sites.
- Only the library is shared. Stylesheets, scripts, media, data, terms, and citations are per site. Copy a small common file into each site rather than linking outside the root.
- Pipelines write dynamic sources into `<site>/assets/data/`, either directly or as a copy step of the run, because refresh rejects source paths that leave the site root. Keep raw run directories outside sites.
- Relative links to another site's pages work from disk, but export disables them. Do not rely on them for content.
- The page skeleton paths below assume `<project>/<site>/`. Adjust the `../` count to the library for deeper sites.
- Mirror manifest groups in `pages/<group>/`. Use lowercase hyphenated file and site folder names that are stable, because export routes, search paths, and cross-page anchors depend on them.
- Keep heavy unrelated trees such as `.git`, `node_modules`, raw archives, and pipeline outputs not consumed by pages outside every site root.

## Page skeleton

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page · Site</title>
  <link rel="stylesheet" href="../../../offprint/offprint.css">
  <link rel="stylesheet" href="../../assets/site.css">          <!-- optional -->
  <script src="../../assets/site.js" data-op-site></script>
  <script type="application/json" data-op-page>{"features": {"chart": true}}</script>  <!-- page-only -->
  <script src="../../../offprint/offprint.js"></script>
  <script src="../../assets/scripts/name.js"></script>          <!-- optional, after entry -->
</head>
<body>
  <nav class="op-sidebar" aria-label="Site navigation"><div data-op-nav></div></nav>
  <main class="op-page">
    <header><p class="op-eyebrow">Group</p><h1>Page</h1><p>Lead.</p></header>
    …
  </main>
</body>
</html>
```

- Head order is fixed: stylesheets → manifest → page JSON → entry → author scripts. [Include order](setup/include-order.md)
- One `h1` per page. Use `h2` for sections (they get colour cycling and section lines) and `h3`/`h4` below them. Do not skip levels.

## Configuration

- Manifest-first: anything used by two or more pages goes in `site.js`. That includes `features`, `options.roles`, `options.tags`, `options.tooltips.terms`, `options.citations.entries`, `options.math.macros`, `options.shortcuts`, `selectionGroups`, `parameterScopes`, and `assets`. [Manifest](setup/manifest.md)
- Page JSON holds only page-specific features and `options[feature].instances[id]`. Do not copy shared options into it.
- The manifest is strict JSON inside one `window.OffPrintSite = {…};` assignment: no comments, trailing commas, or expressions.
- Register every page in `pages`. An unlisted page is missing from navigation, prev/next links, search, and export page pickers.

## Features

- Keep the default `reading` profile and turn on only the features in use. Enable a feature in the manifest if several pages use it, or in page JSON if only one does. Use `profile: "none"` only for a documented reason.
- Enable dependencies explicitly when the reference names them, for example `data` with named-source charts or `parameters` for scoped filters. Never disable a feature that another enabled feature needs. [Include order](setup/include-order.md)

## Custom code ladder

Take the first rung that works. Moving down a rung requires that every rung above it has failed.

1. Markup: `data-op-*` attributes and `.op-*` classes from the feature references.
2. Options: manifest or page JSON, including instance options, `mapping`, `filter`, selection groups, and parameter scopes.
3. Composition: combine existing features through selection groups, parameters, step sequences, detail panes, and data transforms.
4. Extension API: `OffPrint.setup` + `OffPrint.register`, `OffPrint.data.defineTransform`, `OffPrint.chart.addon`, and controllers and events read in `ready`. [Extension API](extend/api.md)
5. A plain author script, as a last resort. Start the file with a one-line comment that names the gap and why rungs 1–4 failed.

- Never re-implement a shipped feature such as tabs, tooltips, dropdowns, dialogs, charts, tables, steppers, reveals, or zoom. If a feature almost fits, use its options or an add-on.
- Author scripts are ordered classic `<script src>` files in `assets/scripts/`. Do not use modules, `async`, `fetch`/XHR, or CDNs. Use only public, non-underscore APIs. Keep authored HTML fallbacks readable without script.
- Name each file after its feature (`assets/scripts/<feature>.js`). Use the same ID in `OffPrint.register('<feature>', …)`.

## Styling

- Order of preference: semantic classes and text roles (`.op-eyebrow`, `.op-fields`, callouts, tags), then `data-op-role` or `data-op-color`, then token overrides, then rules in `site.css`. [Tokens](layout/tokens.md) · [Roles](layout/roles.md) · [Text roles](layout/text-roles.md)
- Restyle by overriding tokens on `:root` or a wrapper. Set `-light`/`-dark` inputs where a token has them.
- One author stylesheet, `assets/site.css`. Its rules use token variables only (`var(--op-…)`): no literal colours, fonts, font sizes, or spacing. Do not restyle `.op-*` internals. Do not use `<style>` blocks or style-bearing `style=""` attributes in pages.
- Give colour a meaning: define a role with a tip and reuse it across prose, tags, callouts, SVG, and legends. Do not use colour as decoration only.
- Check both themes. Size layouts for a 1920×1080 viewport, and confirm they still work in the narrow layout.

## Data

| Kind | Where | Form |
| --- | --- | --- |
| Static, ≤ ~100 rows or 10 KB | Inline, next to its view | `<script type="text/csv" data-op-source="name">` (or a TSV, JSON, YAML, XML, or Markdown MIME type), authored tables, or inline specs |
| Static, larger | `assets/data/` | Named source via `assets.data` wrapper |
| Dynamic (changes between runs, e.g. ML results) | `assets/data/` | Named source via `assets.data` wrapper, always |

- Static data is fixed once written. Dynamic data is produced by an external process. Pages never load raw files directly, because `file://` blocks fetches. Pages load only the wrappers in `generated/`. [Data wrappers](tools/file-wrapper.md) · [Named sources](data/data-blocks.md)
- The pipeline overwrites the same file names in `assets/data/` each run. Field names, types, and keys are a contract with the pages, so treat renames as breaking changes. Changing values is fine.
- Every site ships its own `refresh-assets.py` at its root (no arguments, or `--check`). Set `LIBRARY` to the site's relative path to `offprint/`. [Terminal refresh](tools/refresh-assets.md)

```python
#!/usr/bin/env python3
from pathlib import Path
from runpy import run_path
LIBRARY = '../offprint'
if __name__ == '__main__':
    site = Path(__file__).resolve().parent
    main = run_path(str(site / LIBRARY / 'tools/refresh_assets.py'))['main']
    raise SystemExit(main(site / 'assets/site.js', site_root=site))
```

- Refresh is all-or-nothing: one invalid data entry or blocked index blocks every output. Search needs Node.js; without it data still refreshes and the run exits 1. Prefer CSV, TSV, JSON, XML, or Markdown for dynamic sources; YAML needs PyYAML. Never hand-edit `generated/`.
- One source, many views: bind charts, results tables, matrices, and data views to the source name. Do not duplicate data across pages of a site. Filter with `filter`/`where` or a named transform instead of creating derived copies.

## Content conventions

- Tooltips: use `data-op-tip` with `data-op-tip-tags`, or `data-op-term` backed by `options.tooltips.terms` with `tags`. Define a recurring term once in the manifest. Never use a native `title` attribute; hint custom icon buttons with `OffPrint.util.hint(el, text)`. [Tooltips](reading/tooltips.md)
- Tags: every `.op-tag` has a class (registry label or `data-op-tag-class`) and a tooltip. Circle shapes are reserved for glossary tags. [Tags](reading/tags.md)
- References and citations: give figures, tables, and equations IDs and captions, and link with reference markup instead of typing "Figure 3". Cite manifest keys. [Cross-references](reading/references.md) · [Citations](reading/citations.md)
- Give an explicit `id` to any heading that another page links to. Formulas use `.op-math` with shared macros. Side remarks use sidenotes, and optional depth uses peek bubbles or callouts, not long parentheticals.
- Interactive views: give hosts stable IDs and keys. Use one selection group or parameter scope per linked concept, and name each after the concept, not the widget.

## Naming

- Files and folders: lowercase-hyphen. Source, role, scope, group, and instance IDs: lowercase-hyphen nouns that are stable over time (`eval-runs`, `split`). Keep each ID identical everywhere it appears.
- Glossary tag labels and tag class labels: Title Case, short, and unique across the site.

## Export (hard requirement)

Every page must work in both **Reader** and **Interactive** standalone export. [Export](setup/export.md)

- Resources must be local, relative, and inside the site root. Remote media is dropped, and video keeps only its poster.
- Load data through wrappers or inline sources, never from runtime file reads.
- Author scripts use only the lifecycle API. Declare their extra files with `data-op-export-dependencies` and `data-op-export-resources`, and read them through `OffPrintExportFiles` in export. Startup errors fall back to the Reader capture, so treat a fallback as a bug.

## Anti-patterns

- Native `title` tooltips, untagged tips (red underline), unclassified tags (dashed outline).
- Literal hex, rgb, or px values in page markup or `site.css`, `<style>` blocks, and inline colour styles.
- Hand-built tabs, accordions, modals, tooltips, charts, sortable tables, or scroll animations.
- `fetch`, ES modules, CDN links, `file://`, absolute or drive paths, and wrong-case paths.
- Edits inside `offprint/`. Use of `OffPrint._*` internals. Hand-edited `generated/` files.
- Shared options duplicated in page JSON, and data duplicated across pages.
- `profile: "none"` or blanket feature enabling without a reason.
- Content that is empty or broken without script.

## Pre-ship checklist

Run per site.

- [ ] No `[offprint]` console warnings. `OffPrint.diagnostics.list()` is empty on every page.
- [ ] `python3 <site>/refresh-assets.py --check` exits with status 0: the search index and all wrappers are current (or `tools/assets.html` reports them current when Node.js is unavailable). Regenerate after any page, heading, term, data, or manifest change.
- [ ] Every page is in the manifest, prev/next order reads correctly, and cross-page anchors resolve.
- [ ] Light and dark themes, 1920×1080 and narrow widths, focus mode, and print all look correct.
- [ ] The export preview builds in Reader and Interactive modes with no missing resources or fallback pages.
- [ ] Author scripts start with their gap comment and register through `OffPrint.register`. `site.css` uses only tokens.

[Site structure](setup/site-structure.md) · [Manifest](setup/manifest.md) · [Include order](setup/include-order.md) · [Extension API](extend/api.md)
