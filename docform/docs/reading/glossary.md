# Site glossary page

Enable `glossary` (requires `tooltips`). Enable `search` to read indexed tips and term uses and [math](math.md) for TeX in definitions.

```html
<main class="df-page">
  <h1>Glossary</h1>
  <div data-df-glossary></div>
</main>
```

- Optionally set `glossaryPage: 'glossary.html'` or `{path: 'glossary.html', title: 'Terms'}` in the manifest to list it in site navigation.
- Merges the normalized manifest glossary with indexed `data-df-tip` definitions keyed by visible term text. A manifest definition takes precedence. Otherwise the first indexed definition is primary. Distinct definitions are listed as variants with source links. Comparison collapses whitespace and ignores case.
- Tags: an entry's `tags` are the union of manifest and indexed tip tags, manifest first; each variant keeps its own `tags`. Rows show circle chips (or dashed `Untagged`) with the registry tip as tooltip. Unknown keys (index built with older settings) warn and hide.
- Filter: a `.df-glossary-filter` group of `aria-pressed` circle chips, in registry order with counts, plus `Untagged` when any entry lacks tags. Any selected tag matches (OR); empty selection shows all. Hides non-matching `dt`/`dd`, empty letter groups, and disables their letter jumps; `Show all` clears; a polite status reports `Showing n of m terms`. `matches(entry, selected)` and `filterTags(entries, registry)` are exported; the untagged key is `''`.
- Indexed manual and auto-linked terms add used-on links to the corresponding manifest entries. Each link targets the page or its indexed section. Groups are alphabetical, with nonletters under Other. Letter and term anchors have bases such as `glossary-a` and `term-vector`.
- A missing index or older index without glossary data yields a manifest-only view with a notice. An index whose tip records lack `tags` (built before glossary tags; it may hold tips on tags and controls) has its tip records skipped, keeps term uses, and shows a rebuild notice. Rebuild the index after changing tips, uses, or page anchors.
- `DocForm.glossary.merge(terms, pages)` takes normalized tooltip definitions and resolved indexed pages. `groups(entries)` groups the merged entries. `render(el, entries, message?, registry?)` replaces a holder's contents (registry defaults to `DocForm.site.tags`). Setup marks the generated holder outside navigation outlines and automatic term linking.

[Tooltip definitions](tooltips.md) · [Search index builder](../tools/search-index.md) · [Glossary source](../../js/glossary.js)
