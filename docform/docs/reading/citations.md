# Citations and reference lists

Enable `citations`. Put sources in the site or page `options.citations.entries` map and cite their exact keys.

```html
<p>See <cite data-df-cite="manual, report">the manual and report</cite>.</p>
<h2>References</h2>
<div data-df-bibliography></div>
```

- Values are strings or structured entries. Fields include `author` or `authors` (array or a string joined with ` and `), `title`, `year`, `venue` / `journal` / `booktitle` / `publisher` (in that precedence), `volume`, `pages`, `note`, `url`, and `doi`. `url` takes precedence over the DOI link. More than six authors yields the first six plus `et al.`.
- Separate keys with whitespace, commas, or semicolons. Sources get per-page numbers in first-citation order. Each citation replaces its contents with deduplicated numbers in ascending order and `?` for unknown keys. Use readable authored text for the static fallback.
- `data-df-bibliography` receives cited sources only. The first slot gets `ref-<slug>` link targets and backlinks to first uses. Without a slot, the module appends a References section when at least one key is recognized. The generated section enters the navigation outline when enabled. Choose keys with distinct slugs.
- The feature includes tooltip-backed full-entry hover cards. `DocForm.citations.citeKeys(value)`, `formatEntry(entry)`, and `citationText(entry)` expose parsing and formatting helpers.

[Cross-references](references.md) · [Citation source](../../js/refs.js)
