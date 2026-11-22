# Authoring conventions

Recommended structure and conventions for agents building sites with DocForm. Not enforced, but following them keeps pages exportable, consistent, and easy to maintain. Find feature references through [LIB_MAP.tsv](LIB_MAP.tsv), and read the relevant reference before writing markup.

## Project layout

```text
project/
  docform/                      library copied whole; never edit it
  docs/                         documentation root (select this folder for export)
    index.html                  first manifest page
    glossary.html               optional glossaryPage
    refresh-data.py             project launcher for data wrappers (see Data)
    pages/<group>/<page>.html   one folder per manifest group, one level deep
    assets/
      site.js                   manifest: the only shared configuration
      site.css                  optional single author stylesheet
      scripts/<name>.js         author scripts (last resort, see Custom code)
      data/                     raw named sources: dynamic, or large static
      generated/                wrappers and search index; tool output only
      media/                    local images, SVG, fonts, video posters
```

- The root holds everything a page loads except `docform/`. Use only relative URLs. `../` may leave the root only to reach the library. Match path case exactly. [Site structure](setup/site-structure.md)
- Mirror manifest groups in `pages/<group>/`. Use lowercase hyphenated file names that are stable, because export routes, search paths, and cross-page anchors depend on them.
- Keep heavy unrelated trees such as `.git`, `node_modules`, raw archives, and pipeline outputs not consumed by pages outside the root.

## Page skeleton

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page · Site</title>
  <link rel="stylesheet" href="../../../docform/docform.css">
  <link rel="stylesheet" href="../../assets/site.css">          <!-- optional -->
  <script src="../../assets/site.js" data-df-site></script>
  <script type="application/json" data-df-page>{"features": {"chart": true}}</script>  <!-- page-only -->
  <script src="../../../docform/docform.js"></script>
  <script src="../../assets/scripts/name.js"></script>          <!-- optional, after entry -->
</head>
<body>
  <nav class="df-sidebar" aria-label="Site navigation"><div data-df-nav></div></nav>
  <main class="df-page">
    <header><p class="df-eyebrow">Group</p><h1>Page</h1><p>Lead.</p></header>
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
- The manifest is strict JSON inside one `window.DocFormSite = {…};` assignment: no comments, trailing commas, or expressions.
- Register every page in `pages`. An unlisted page is missing from navigation, prev/next links, search, and export page pickers.

## Features

- Keep the default `reading` profile and turn on only the features in use. Enable a feature in the manifest if several pages use it, or in page JSON if only one does. Use `profile: "none"` only for a documented reason.
- Enable dependencies explicitly when the reference names them, for example `data` with named-source charts or `parameters` for scoped filters. Never disable a feature that another enabled feature needs. [Include order](setup/include-order.md)

## Custom code ladder

Take the first rung that works. Moving down a rung requires that every rung above it has failed.

1. Markup: `data-df-*` attributes and `.df-*` classes from the feature references.
2. Options: manifest or page JSON, including instance options, `mapping`, `filter`, selection groups, and parameter scopes.
3. Composition: combine existing features through selection groups, parameters, step sequences, detail panes, and data transforms.
4. Extension API: `DocForm.setup` + `DocForm.register`, `DocForm.data.defineTransform`, `DocForm.chart.addon`, and controllers and events read in `ready`. [Extension API](extend/api.md)
5. A plain author script, as a last resort. Start the file with a one-line comment that names the gap and why rungs 1–4 failed.

- Never re-implement a shipped feature such as tabs, tooltips, dropdowns, dialogs, charts, tables, steppers, reveals, or zoom. If a feature almost fits, use its options or an add-on.
- Author scripts are ordered classic `<script src>` files in `assets/scripts/`. Do not use modules, `async`, `fetch`/XHR, or CDNs. Use only public, non-underscore APIs. Keep authored HTML fallbacks readable without script.
- Name each file after its feature (`assets/scripts/<feature>.js`). Use the same ID in `DocForm.register('<feature>', …)`.

## Styling

- Order of preference: semantic classes and text roles (`.df-eyebrow`, `.df-fields`, callouts, tags), then `data-df-role` or `data-df-color`, then token overrides, then rules in `site.css`. [Tokens](layout/tokens.md) · [Roles](layout/roles.md) · [Text roles](layout/text-roles.md)
- Restyle by overriding tokens on `:root` or a wrapper. Set `-light`/`-dark` inputs where a token has them.
- One author stylesheet, `assets/site.css`. Its rules use token variables only (`var(--df-…)`): no literal colours, fonts, font sizes, or spacing. Do not restyle `.df-*` internals. Do not use `<style>` blocks or style-bearing `style=""` attributes in pages.
- Give colour a meaning: define a role with a tip and reuse it across prose, tags, callouts, SVG, and legends. Do not use colour as decoration only.
- Check both themes. Size layouts for a 1920×1080 viewport, and confirm they still work in the narrow layout.

## Data

| Kind | Where | Form |
| --- | --- | --- |
| Static, ≤ ~100 rows or 10 KB | Inline, next to its view | `<script type="text/csv" data-df-source="name">` (or a TSV, JSON, YAML, XML, or Markdown MIME type), authored tables, or inline specs |
| Static, larger | `assets/data/` | Named source via `assets.data` wrapper |
| Dynamic (changes between runs, e.g. ML results) | `assets/data/` | Named source via `assets.data` wrapper, always |

- Static data is fixed once written. Dynamic data is produced by an external process. Pages never load raw files directly, because `file://` blocks fetches. Pages load only the wrappers in `generated/`. [Data wrappers](tools/file-wrapper.md) · [Named sources](data/data-blocks.md)
- The pipeline overwrites the same file names in `assets/data/` each run. Field names, types, and keys are a contract with the pages, so treat renames as breaking changes. Changing values is fine.
- Every project ships its own no-argument `refresh-data.py` at the root:

```python
#!/usr/bin/env python3
from pathlib import Path
from runpy import run_path
if __name__ == '__main__':
    site = Path(__file__).resolve().parent
    refresh = run_path(str(site.parent / 'docform/tools/refresh_data.py'))['refresh']
    raise SystemExit(refresh(site / 'assets/site.js', site_root=site))
```

- Refresh is all-or-nothing: one invalid entry blocks every output. Prefer CSV, TSV, JSON, XML, or Markdown for dynamic sources; YAML needs PyYAML. Never hand-edit `generated/`.
- One source, many views: bind charts, results tables, matrices, and data views to the source name. Do not duplicate data across pages. Filter with `filter`/`where` or a named transform instead of creating derived copies.

## Content conventions

- Tooltips: use `data-df-tip` with `data-df-tip-tags`, or `data-df-term` backed by `options.tooltips.terms` with `tags`. Define a recurring term once in the manifest. Never use a native `title` attribute; hint custom icon buttons with `DocForm.util.hint(el, text)`. [Tooltips](reading/tooltips.md)
- Tags: every `.df-tag` has a class (registry label or `data-df-tag-class`) and a tooltip. Circle shapes are reserved for glossary tags. [Tags](reading/tags.md)
- References and citations: give figures, tables, and equations IDs and captions, and link with reference markup instead of typing "Figure 3". Cite manifest keys. [Cross-references](reading/references.md) · [Citations](reading/citations.md)
- Give an explicit `id` to any heading that another page links to. Formulas use `.df-math` with shared macros. Side remarks use sidenotes, and optional depth uses peek bubbles or callouts, not long parentheticals.
- Interactive views: give hosts stable IDs and keys. Use one selection group or parameter scope per linked concept, and name each after the concept, not the widget.

## Naming

- Files and folders: lowercase-hyphen. Source, role, scope, group, and instance IDs: lowercase-hyphen nouns that are stable over time (`eval-runs`, `split`). Keep each ID identical everywhere it appears.
- Glossary tag labels and tag class labels: Title Case, short, and unique across the site.

## Export (hard requirement)

Every page must work in both **Reader** and **Interactive** standalone export. [Export](setup/export.md)

- Resources must be local, relative, and inside the root. Remote media is dropped, and video keeps only its poster.
- Load data through wrappers or inline sources, never from runtime file reads.
- Author scripts use only the lifecycle API. Declare their extra files with `data-df-export-dependencies` and `data-df-export-resources`, and read them through `DocFormExportFiles` in export. Startup errors fall back to the Reader capture, so treat a fallback as a bug.

## Anti-patterns

- Native `title` tooltips, untagged tips (red underline), unclassified tags (dashed outline).
- Literal hex, rgb, or px values in page markup or `site.css`, `<style>` blocks, and inline colour styles.
- Hand-built tabs, accordions, modals, tooltips, charts, sortable tables, or scroll animations.
- `fetch`, ES modules, CDN links, `file://`, absolute or drive paths, and wrong-case paths.
- Edits inside `docform/`. Use of `DocForm._*` internals. Hand-edited `generated/` files.
- Shared options duplicated in page JSON, and data duplicated across pages.
- `profile: "none"` or blanket feature enabling without a reason.
- Content that is empty or broken without script.

## Pre-ship checklist

- [ ] No `[docform]` console warnings. `DocForm.diagnostics.list()` is empty on every page.
- [ ] `python3 refresh-data.py` exits with status 0, and wrappers in `generated/` are current.
- [ ] `tools/assets.html` reports the search index and all wrappers as current. Regenerate after any page, heading, term, or manifest change.
- [ ] Every page is in the manifest, prev/next order reads correctly, and cross-page anchors resolve.
- [ ] Light and dark themes, 1920×1080 and narrow widths, focus mode, and print all look correct.
- [ ] The export preview builds in Reader and Interactive modes with no missing resources or fallback pages.
- [ ] Author scripts start with their gap comment and register through `DocForm.register`. `site.css` uses only tokens.

[Site structure](setup/site-structure.md) · [Manifest](setup/manifest.md) · [Include order](setup/include-order.md) · [Extension API](extend/api.md)
