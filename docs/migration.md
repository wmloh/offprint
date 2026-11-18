# Migration guide

Use this guide to move a site from per-file includes to the offline entry. Migrate the whole site at once; the old names are not kept.

## 1. Replace the includes

Remove the separate `docform/css/…` links, `docform/js/…` scripts, and vendor scripts. Put the manifest, optional page configuration, and entry in the head, and move page scripts after the entry.

```html
<link rel="stylesheet" href="docform/docform.css">
<script src="site.js" data-df-site></script>
<script type="application/json" data-df-page>
  { "features": { "chart": true, "math": true } }
</script>
<script src="docform/docform.js"></script>
<script defer src="page.js"></script>
```

The reading profile covers the common reading features. Turn on everything else by name, as listed in the [component reference](components.md). DocForm loads KaTeX, js-yaml, and other dependencies when a feature needs them.

## 2. Convert the manifest

The manifest must now be a single JSON object assigned to `window.DocFormSite`. Move any functions or computed values into a page script. Keep `title`, `pages`, and `glossaryPage`, and move the other fields:

| Old field | New field |
| --- | --- |
| `roles` | `options.roles.colors` |
| `glossary` | `options.tooltips.terms` |
| `terms.autoLink`, `terms.hold` | `options.tooltips.autoLink`, `options.tooltips.hold` |
| `macros` | `options.math.macros` |
| `bibliography` | `options.citations.entries` |
| `refs.equations` | `options.references.equations` |
| `search` | `assets.search.output` |

## 3. Update the markup

Most markup keeps its name. Interactive items now share `data-df-key` for identity and `data-df-selection-group` for linking.

| Old markup | New markup |
| --- | --- |
| `data-df-highlight-group`, `data-df-highlight-key` | `data-df-selection-group`, `data-df-key` |
| Tab sets matched by label with `data-df-tab-group` | `data-df-key` on each panel and `data-df-selection-group` on the set |
| `data-df-card="id"` on a card button | `data-df-key` and `data-df-detail="id"` |
| Numbered `data-df-step` on a figure step | `data-df-key`, `data-df-detail`, and optional `data-df-animation-key` |
| `data-df-step-key`, `data-df-step-name` in a worked example | `data-df-key`, `data-df-step-label` |
| `data-df-param` with its limits on each control | A definition in `parameterScopes` and `data-df-parameter` on the control |
| `data-df-more="#id"` | `data-df-more-id="id"` |
| `data-df-column` on a results header | `data-df-field` |
| `data-df-data`, `data-df-type`, `data-df-view` | `data-df-source`, `data-df-source-type`, `data-df-data-view` |
| `data-df-autoplay` on an animation | `data-df-animation-autoplay` |

## 4. Update page scripts

- Replace `DocForm.register` with `DocForm.setup` for work before the page is enhanced, or `DocForm.ready` for work that needs the enhanced page.
- Start animations with `DocForm.animation.mount(figure, { steps })`. Give each step a `key`.
- Read and change parameters through their scope with `snapshot`, `update`, and `subscribe`.
- Reach components through their feature, such as `DocForm.chart.get(id)` or `DocForm.stepper.get(id)`, and use `select(key)`, `snapshot()`, and `subscribe(fn)` instead of reading generated attributes.
- Event names now follow `df:<feature>:<change>`, for example `df:stepper:change`.

## 5. Regenerate assets

Set `assets.search.output` and each `assets.data` entry in the manifest. Open [the asset tool](../docform/tools/assets.html) from disk, choose the site folder, and save or download the selected outputs. Point the manifest at the new outputs and remove the files made by the old index builder and data converter. The tool reports each output as missing, stale, or current.

## 6. Check the result

Open each page from disk and call `DocForm.diagnostics.list()` in the browser console. Each entry names the feature and the correction. Also check the pages with scripts disabled to confirm that the authored HTML still reads well.

The [examples](../examples/pca/index.html) use the new interface throughout.
