# Offline setup and initialization

Copy `offprint/` with its CSS, scripts, and vendor assets. Open the HTML directly in a modern browser.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Field notes</title>
  <link rel="stylesheet" href="offprint/offprint.css">
  <script type="application/json" data-op-page>
    { "features": { "chart": true } }
  </script>
  <script src="offprint/offprint.js"></script>
  <script defer src="page.js"></script>
</head>
<body>
  <main class="op-page">
    <h1>Field notes</h1>
    <p>Start here.</p>
  </main>
</body>
</html>
```

- Optional `<script src="site.js" data-op-site></script>` before the synchronous entry in the head. Use ordinary page-relative URLs for the includes. Entry locates feature assets relative to its own script URL.
- Multi-page sites: follow [site structure](site-structure.md) so export can read every resource.
- Load author scripts after the entry. See the [extension API](../extend/api.md) for setup, ready, and feature registration.

[Include order](include-order.md) · [Manifest](manifest.md) · [Entry source](../../offprint.js)
