# Site manifest

Copy [site.template.js](../../site.template.js) to `site.js`. Set `window.DocFormSite` in a classic script before `docform.js` in the head. On each page, mark its script with `data-df-site`. Point `src` at the same manifest file using the path from that page.

```js
window.DocFormSite = {
  "title": "Field notes",
  "pages": [
    { "title": "Introduction", "path": "index.html" },
    { "title": "Methods", "collapsed": true, "pages": ["methods/checks.html"] }
  ],
  "glossaryPage": { "path": "glossary.html", "title": "Terms" },
  "features": { "chart": true },
  "assets": { "search": { "output": "search-index.js" } }
};
```

Use a classic assignment with a JSON object. Inline `script[data-df-site]` uses the page URL as its base. A single `<script type="application/json" data-df-page>` can set page options and features. Profile precedence is page JSON → entry `data-df-profile` → site → `reading`. A page JSON profile of `none` clears inherited feature choices before applying its own. Site and page options merge recursively by key, with arrays replaced. Put theme configuration before the entry. `options.theme.mode` accepts `light`, `dark`, or `null` for system preference when no choice is saved.

| Field | Shape and behavior |
| --- | --- |
| `title` | String shown in the sidebar when a page tree exists. Links to the first navigable page when available. |
| `pages` | Array of path strings or objects with `title?`, `path?`, `pages?`, `collapsed?`. Path-bearing groups are links as well as groups. Reading order is depth-first, with each linked parent before its children. Omit a title to display the path or `Untitled`. `collapsed` starts a group closed unless it contains the current page. |
| `glossaryPage` | Path or `{path, title?}`. Defaults to `Glossary` and appends a navigation entry unless an existing page has the same resolved URL ignoring its fragment. |
| `options.roles.colors` (`roles`) | Map of role names to named colours. Trimmed, lowercased keys must match `^[a-z0-9][a-z0-9_-]*$`. Invalid entries warn and are ignored. [Roles](../layout/roles.md) |
| `options.tooltips.terms` (`glossary`) | Map of terms to definition strings or `{text, title?, more?}`. `more` is author HTML and `text` is plain text with optional inline TeX. [Tooltips](../reading/tooltips.md) |
| `options.tooltips` (`terms`) | `{autoLink?: boolean, hold?: number}`. Auto-link is off unless `true`. Hold defaults to 600 ms. [Tooltips](../reading/tooltips.md) |
| `options.math.macros` (`macros`) | KaTeX macro map. Use doubled backslashes in JS string literals, for example `'\\R': '\\mathbb{R}'`. [Math](../reading/math.md) |
| `options.citations.entries` (`bibliography`) | Map of citation keys to strings or structured entries. [Citations](../reading/citations.md) |
| `options.references` (`refs`) | `{equations?: 'all' \| 'labeled'}`. `all` makes every eligible display equation count. The default counts labeled or explicitly opted-in display equations. [References](../reading/references.md) |
| `selectionGroups` | Named group options `{initial?: string \| null, persist?: boolean}`. Site and page definitions merge by group and field. [Linked selection](../interact/linked-highlighting.md) |
| `parameterScopes` | Named maps of parameter definitions. Site and page entries merge by scope, parameter, and field. [Parameters](../interact/parameters.md) |
| `assets.search.output` (`search`) | Manifest-relative classic search index. Page `options.search.index` can override with a page-relative path or clear with `null`. [Search index builder](../reading/search-index.md) |
| `assets.data` | Map of source names to `{output, source?, type?}`. Paths are manifest-relative. Wrapped output scripts load before setup if `data` is enabled. |

- `pages[].path`, `glossaryPage`, and `search` resolve via `new URL(path, base)`. The base is the `src` URL of the first `script[data-df-site]`, or the page URL if that script or its `src` is missing. Index entries use the base of the configuration that supplies the index path. Ordinary HTML asset URLs still resolve from the page.
- `DocForm.site` contains `provided`, `base`, normalized `pages`, flattened navigable `order`, and the resolved `glossaryPage` and `search` URLs (or `null`). The offline entry adds merged `options`, `selectionGroups`, and `parameterScopes` and resolved `assets`. Parenthesized field names are the original manifest keys. A normalized page node has `{title, path, href, collapsed, pages}`. Arrays and objects are optional and default to empty. Unknown fields are omitted.
- Assign explicit IDs to headings linked across pages if their text may change. Build the search index again after page or manifest changes that affect indexed content or paths.

[Navigation](../layout/navigation.md) · [Core source](../../js/core.js)
