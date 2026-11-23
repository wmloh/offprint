# OffPrint

OffPrint is a reusable HTML, CSS, and JavaScript library for documentation, reports, and experimental results. Build pages with interactive charts, filterable tables, animated diagrams, and worked examples. Pages open directly in a browser from disk, with no server, build step, or package install.

## Try it

Open [`docs/index.html`](docs/index.html) from your local copy in a browser. Keep the `docs/` and `offprint/` folders together so the live examples can load the library. The [experiment results recipe](docs/pages/recipes/share-experiment-results.html) shows how to combine charts, tables, and scenario comparisons in one report.

## Start a page

Copy the entire `offprint/` folder into your project. Save this as `index.html` beside that folder and open it in a browser.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Field notes</title>
  <link rel="stylesheet" href="offprint/offprint.css">
  <script src="offprint/offprint.js"></script>
</head>
<body>
  <main class="op-page">
    <h1>Field notes</h1>
    <p>Record your first observation here.</p>
  </main>
</body>
</html>
```

Add components from the [feature guide](docs/pages/reference/features.html). For a multipage site, start with the [site manifest template](offprint/site.template.js) and follow the [site structure guide](offprint/docs/setup/site-structure.md).

## Share a standalone copy

In desktop Chrome, use **Export** to save selected pages as a single HTML file. **Reader** captures the page view and keeps supported figure steps. **Interactive** also runs supported charts, diagrams, animations, and linked controls. See the [export walkthrough](docs/pages/start/open-a-site.html#export-a-copy).
