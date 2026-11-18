# Site manifest

Copy [site.template.js](../../site.template.js) to `site.js`. Set `window.DocFormSite` in a classic script before `core.js`. On each page, mark its script with `data-df-site`. Point `src` at the same manifest file using the path from that page.

```js
window.DocFormSite = {
  title: 'Field notes',
  pages: [
    { title: 'Introduction', path: 'index.html' },
    { title: 'Methods', collapsed: true, pages: ['methods/checks.html'] }
  ],
  glossaryPage: { path: 'glossary.html', title: 'Terms' },
  search: 'search-index.js'
};
```

| Field | Shape and behavior |
| --- | --- |
| `title` | String shown in the sidebar when a page tree exists. Links to the first navigable page when available. |
| `pages` | Array of path strings or objects with `title?`, `path?`, `pages?`, `collapsed?`. Path-bearing groups are links as well as groups. Reading order is depth-first, with each linked parent before its children. Omit a title to display the path or `Untitled`. `collapsed` starts a group closed unless it contains the current page. |
| `glossaryPage` | Path or `{path, title?}`. Defaults to `Glossary` and appends a navigation entry unless an existing page has the same resolved URL ignoring its fragment. |
| `roles` | Map of role names to named colours. Trimmed, lowercased keys must match `^[a-z0-9][a-z0-9_-]*$`. Invalid entries warn and are ignored. [Roles](../layout/roles.md) |
| `glossary` | Map of terms to definition strings or `{text, title?, more?}`. `more` is author HTML and `text` is plain text with optional inline TeX. [Tooltips](../reading/tooltips.md) |
| `terms` | `{autoLink?: boolean, hold?: number}`. Auto-link is off unless `true`. Hold defaults to 600 ms. [Tooltips](../reading/tooltips.md) |
| `macros` | KaTeX macro map. Use doubled backslashes in JS string literals, for example `'\\R': '\\mathbb{R}'`. [Math](../reading/math.md) |
| `bibliography` | Map of citation keys to strings or structured entries. [Citations](../reading/citations.md) |
| `refs` | `{equations?: 'all' \| 'labeled'}`. `all` makes every eligible display equation count. The default counts labeled or explicitly opted-in display equations. [References](../reading/references.md) |
| `search` | Path to a generated JS search index. [Search index builder](../reading/search-index.md) |

- `pages[].path`, `glossaryPage`, and `search` resolve via `new URL(path, base)`. The base is the `src` URL of the first `script[data-df-site]`, or the page URL if that script or its `src` is missing. Index entries use the manifest base when a manifest is present. Ordinary HTML asset URLs still resolve from the page.
- `DocForm.site` contains `provided`, `base`, normalized `pages`, flattened navigable `order`, the resolved `glossaryPage` and `search` URLs (or `null`), and the remaining fields. A normalized page node has `{title, path, href, collapsed, pages}`. Arrays and objects are optional and default to empty. Unknown fields are omitted.
- Assign explicit IDs to headings linked across pages if their text may change. Build the search index again after page or manifest changes that affect indexed content or paths.

[Navigation](../layout/navigation.md) · [Core source](../../js/core.js)
