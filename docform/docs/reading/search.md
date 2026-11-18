# Search palette

Load `css/search.css` and `js/search.js`. Open with Ctrl+K, Cmd+K, or the optional control pill button. Up/Down selects a result, Enter opens it, and Escape closes the palette. A blank query lists manifest pages in reading order or current-page entries when there is no page tree.

- Every query word must match across the section title, page title, or body. Matching is case-insensitive and ranks title hits ahead of prose. Up to 30 results show snippets with matching text emphasized.
- Search reads the current page live plus other pages from `window.DocFormSearch`. Set manifest `search` to the generated index path for lazy classic-script loading, or load the index script directly to set the global. Without usable index data, query results come from the current page.
- The extractor reads the first `.df-page`, `main`, or `body` and creates an intro plus `h2`/`h3` sections. Each section has up to 4,000 characters of indexed text. Use `data-df-no-search` to skip a subtree or `data-df-no-outline` to keep a heading from starting a section. Hidden areas, navigation, math markup, and most controls are skipped.
- `DocForm.search.open(opener?)`, `close()`, and `toggle(opener?)` drive the dialog. `load(cb)` returns the index or `null` via callback. `pages(cb)` returns resolved `{href, title, sections, terms}` pages or `null`. `find(href, cb)` returns `{page, title, text}` for a page or section, or `null`. `extract(doc, title?)` returns `{title, sections, terms}`.
- The index also supplies other-page outlines, remote link previews, and glossary usage. Use explicit heading IDs for stable external links.

[Search index builder](search-index.md) · [Navigation](../layout/navigation.md) · [Search source](../../js/search.js)
