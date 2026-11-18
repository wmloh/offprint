# Site glossary page

Load `css/glossary.css` and `js/glossary.js` with `tooltip.js`. Load `search.js` first to read indexed tips and term uses. Add [math assets](math.md) for TeX in definitions.

```html
<main class="df-page">
  <h1>Glossary</h1>
  <div data-df-glossary></div>
</main>
```

- Optionally set `glossaryPage: 'glossary.html'` or `{path: 'glossary.html', title: 'Terms'}` in the manifest to list it in site navigation.
- Merges the normalized manifest glossary with indexed `data-df-tip` definitions keyed by visible term text. A manifest definition takes precedence. Otherwise the first indexed definition is primary. Distinct definitions are listed as variants with source links. Comparison collapses whitespace and ignores case.
- Indexed manual and auto-linked terms add used-on links to the corresponding manifest entries. Each link targets the page or its indexed section. Groups are alphabetical, with nonletters under Other. Letter and term anchors have bases such as `glossary-a` and `term-vector`.
- A missing index or older index without glossary data yields a manifest-only view with a notice. Rebuild the index after changing tips, uses, or page anchors.
- `DocForm.glossary.merge(terms, pages)` takes normalized tooltip definitions and resolved indexed pages. `groups(entries)` groups the merged entries. `render(el, entries, message?)` replaces a holder's contents. Setup marks the generated holder outside navigation outlines and automatic term linking.

[Tooltip definitions](tooltips.md) · [Search index builder](search-index.md) · [Glossary source](../../js/glossary.js)
