# Offline search index builder

Open `docform/tools/search-index.html` in a browser with folder selection. Choose a local folder containing the pages and optional manifest. Save `search-index.js` beside the manifest and set `search: 'search-index.js'`. Rebuild after changing indexed text, term markup, heading IDs, or page paths.

- The builder evaluates candidate scripts containing `DocFormSite` with a synthetic `window`. It prefers `site.js`, then shallower scripts, and excludes paths under `docform/` and `node_modules/`.
- With a manifest, it walks reading order, including `glossaryPage`, and stores paths relative to the manifest. Directory targets ending in `/` resolve to `index.html`. Off-site and out-of-folder URLs are skipped. Missing files are reported. For a site without a manifest, paths are relative to the chosen folder and pages resolve them against their own URL. Load the index script directly on pages at that level.
- Pages are parsed as HTML. The tool applies manifest glossary auto-linking and extracts author text and term markup. Page scripts that generate content do not run during extraction.
- Output is a classic script assigning `window.DocFormSearch = {generated, pages}`. Each page has `{path, title, sections, terms}`. Sections have `{id, title, level, text}`, with an empty ID for the intro. Term records carry `{text, section, tip}` or `{text, section, term}`, with `section` set to an indexed heading ID or empty for the intro.

[Search palette](search.md) · [Glossary page](glossary.md) · [Builder](../../tools/search-index.html)
