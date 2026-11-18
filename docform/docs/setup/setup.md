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

- Optional marked manifest before the synchronous entry in the head. Use ordinary page-relative URLs for the includes. Entry locates feature assets relative to its own script URL.
- `DocForm.setup(fn)` runs synchronously after feature APIs and configured wrapped data are available, before automatic enhancement. Register from an ordered classic script after the entry. Pass a callback receiving `DocForm`. Returns `false` after setup closes.
- `DocForm.ready(fn)` runs after startup, including after recoverable failures. Late registrations run in a microtask. Both phases run callbacks in registration order. Callback exceptions produce diagnostics and subsequent callbacks still run.
- Access existing feature APIs inside either callback. For example, use `DocForm.dataset.add(name, text, type)` or `DocForm.anim(id, steps, options)` in setup, and `DocForm.chart.get(element)` to read a chart after startup.
- `DocForm.diagnostics.list()` returns accumulated entries. `df:diagnostic` on `document` carries `{code, feature, target, message, correction}`.
- `DocForm.page` is the document URL. `DocForm.site` is the frozen normalized configuration available during setup. Shared helpers `slug`, `uniqueSlug`, and `copyText` are available under `DocForm.util`.

[Include order](include-order.md) · [Manifest](manifest.md) · [Entry source](../../docform.js)
