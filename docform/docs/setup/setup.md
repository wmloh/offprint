# Offline setup and initialization

Copy `docform/` beside the site's HTML. Keep `css/`, `js/`, and used `vendor/` assets together. Use asset URLs relative to each page and open the HTML directly in a modern browser.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Field notes</title>
  <link rel="stylesheet" href="docform/css/tokens.css">
  <link rel="stylesheet" href="docform/css/base.css">
</head>
<body>
  <main class="df-page">
    <h1>Field notes</h1>
    <p>Start here.</p>
  </main>
  <script src="docform/js/core.js"></script>
</body>
</html>
```

- `core.js` creates `window.DocForm`. It sets `DocForm.page` to the page URL and `DocForm.site` to the normalized manifest on `DOMContentLoaded`, or immediately if the document is already ready.
- `DocForm.register(name, init)` queues `init(site, DocForm)` in registration order, or runs it immediately after startup. Each name initializes once. An exception in one initializer produces a warning and the remaining initializers run.
- Load page scripts after their feature scripts. Use the registry for page code that needs synchronous feature setup, and feature-specific events or subscriptions for deferred setup.
- Core helpers include `data(el, key, fallback)` (fallback only for a missing attribute), `flag(el, key)` (present and value other than literal `false`), `num(el, key, fallback)` (finite `parseFloat`), and `all(selector, scope?)` (array of matching descendants).
- `slug(text)` produces a lowercase, dash-separated heading ID base with diacritics removed and `section` as fallback. `uniqueSlug(base, usedSet)` reserves the ID and adds numeric suffixes on collision. `copyText(text)` returns a promise, trying the Clipboard API and then a temporary textarea and `execCommand('copy')`.
- With no manifest, the normalized site still has empty configuration objects and a page URL base. Static HTML and CSS work by themselves. Each enhancement has its own prerequisites.

[Include order](include-order.md) · [Manifest](manifest.md) · [Core source](../../js/core.js)
