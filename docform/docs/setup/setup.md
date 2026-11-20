# Offline setup and initialization

Copy `docform/` with its CSS, scripts, and vendor assets. Open the HTML directly in a modern browser.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Field notes</title>
  <link rel="stylesheet" href="docform/docform.css">
  <script type="application/json" data-df-page>
    { "features": { "chart": true } }
  </script>
  <script src="docform/docform.js"></script>
  <script defer src="page.js"></script>
</head>
<body>
  <main class="df-page">
    <h1>Field notes</h1>
    <p>Start here.</p>
  </main>
</body>
</html>
```

- Optional `<script src="site.js" data-df-site></script>` before the synchronous entry in the head. Use ordinary page-relative URLs for the includes. Entry locates feature assets relative to its own script URL.
- `DocForm.setup(fn)` runs synchronously after feature APIs and configured wrapped data are available, before automatic enhancement. Register from an ordered classic script after the entry. Pass a callback receiving `DocForm`. Returns `false` after setup closes.
- `DocForm.ready(fn)` runs after startup, including after recoverable failures. Late registrations run in a microtask. Both phases run callbacks in registration order. Callback exceptions produce diagnostics and subsequent callbacks still run.
- Access existing feature APIs inside either callback. For example, register a typed input with `DocForm.data.define(name, {type: "value", value})` or mount `DocForm.animation.mount(id, {steps})` in setup. In ready, use `DocForm.chart.get(id)` to look up an enhanced chart.
- `DocForm.diagnostics.list()` returns accumulated entries. `df:diagnostic` on `document` carries `{code, feature, target, message, correction}`.
- `DocForm.page` is the document URL. `DocForm.site` is the frozen normalized configuration available during setup. Shared helpers `slug`, `uniqueSlug`, and `copyText` are available under `DocForm.util`.

## Migrating a site with per-file includes

Migrate the site together. Replace individual module and vendor includes with the offline entry above and opt in to the [features](include-order.md) each page needs. Move manifest functions and computed values into author scripts. Keep `title`, `pages`, and `glossaryPage` in the [manifest](manifest.md), and move legacy fields as follows.

| Old field | Current field |
| --- | --- |
| `roles` | `options.roles.colors` |
| `glossary` | `options.tooltips.terms` |
| `terms.autoLink`, `terms.hold` | `options.tooltips.autoLink`, `options.tooltips.hold` |
| `macros` | `options.math.macros` |
| `bibliography` | `options.citations.entries` |
| `refs.equations` | `options.references.equations` |
| `search` | `assets.search.output` |

| Old markup | Current markup |
| --- | --- |
| `data-df-highlight-group`, `data-df-highlight-key` | `data-df-selection-group`, `data-df-key` |
| `data-df-tab-group` with label matching | `data-df-selection-group` on the set, `data-df-key` on each panel |
| `data-df-card="id"` on a card button | `data-df-key` for identity, `data-df-detail="id"` for the detail target |
| Numbered `data-df-step` on a figure step | `data-df-key`, `data-df-detail`, optional `data-df-animation-key` |
| `data-df-step-key`, `data-df-step-name` in a worked example | `data-df-key`, `data-df-step-label` |
| `data-df-param` with per-control limits | Definition in `parameterScopes`, `data-df-parameter` on the control |
| `data-df-more="#id"` | `data-df-more-id="id"` |
| `data-df-column` on a results header | `data-df-field` |
| `data-df-data`, `data-df-type`, `data-df-view` | `data-df-source`, `data-df-source-type`, `data-df-data-view` |
| `data-df-autoplay` on an animation | `data-df-animation-autoplay` |

- Replace `DocForm.register` in author scripts with `DocForm.setup` before enhancement or `DocForm.ready` after startup. Mount with `DocForm.animation.mount(figure, {steps})` and give each step a `key`. Use scoped `snapshot`, `update`, and `subscribe` for [parameters](../interact/parameters.md).
- Use feature controllers such as `DocForm.chart.get(id)` or `DocForm.stepper.get(id)` for `select(key)`, `snapshot()`, and `subscribe(fn)`. Use the feature's documented events, such as `df:stepper:change`.
- Configure `assets.search.output` and `assets.data`, regenerate with the [offline asset tool](../../tools/assets.html), and replace the old index and data wrappers. Open pages from disk, inspect `DocForm.diagnostics.list()`, and check the authored HTML with scripts disabled.

[Include order](include-order.md) · [Manifest](manifest.md) · [Entry source](../../docform.js)
