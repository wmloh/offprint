# Offline search index

Open [tools/assets.html](../../tools/assets.html) from disk. Choose the folder containing the site pages and manifest. Use an external `script[src][data-df-site]` on the pages. Choose the intended manifest if several are found. A file named `site.js` is also discoverable without a marked page. The manifest must be a single `window.DocFormSite = <JSON object>;` assignment.

- Configure `"assets": {"search": {"output": "search-index.js"}}` in the manifest. The optional `include` array replaces the default manifest reading order, including `glossaryPage`. Paths resolve from the manifest. Directory page paths resolve to `index.html`.
- The tool extracts authored page text, heading IDs, term uses, and inline tips. It applies glossary auto-linking and reads embedded page options. Page scripts stay inert during extraction.
- The tool marks each output missing, stale, current, or blocked. The output records a generator and format version, normalized configuration, and ordered SHA-256 input hashes. Identical inputs and configuration produce identical scripts.
- Check the outputs to regenerate. Save selected outputs directly if the folder offers save access, or use the listed destinations to place downloaded files. Expand an output to preview or copy its script.
- The index assigns `window.DocFormSearch = {format, version, metadata, pages}`. Each page has `{path, title, sections, terms}`. Page paths resolve from the manifest. Sections have `{id, title, level, text}`, with an empty ID for the intro. Term uses have `{text, section, tip}` or `{text, section, term}`.

[Search palette](search.md) · [Glossary page](glossary.md) · [Data wrappers](../data/file-wrapper.md)
