# Getting started

DocForm turns plain HTML pages into Notion-style notes with math, tooltips, code blocks, animated figures, interactive figure steps, split views, and sliders. It runs straight from disk without a server or build step.

## 1. Copy the folder

Copy the whole `docform/` folder into your project, next to your pages:

```
my-notes/
  docform/        ← copied as is
  index.html      ← your pages
  site.js         ← optional manifest (see manifest.md)
```

Pages in subfolders work too; just adjust the relative paths (for example `../docform/...`).

## 2. Add DocForm to a page

The entry script starts the reading features. Link the optional stylesheet to style the page while scripts load or when JavaScript is disabled. Opt into extras such as math in the page configuration.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My first page</title>
  <link rel="stylesheet" href="docform/docform.css">
  <script type="application/json" data-df-page>
    { "features": { "math": true } }
  </script>
  <script src="docform/docform.js"></script>
</head>
<body>
  <main class="df-page">
    <h1>My first page</h1>
    <p>Euler's identity is <span class="df-math">e^{i\pi} + 1 = 0</span>.</p>
    <h2>Next section</h2>
    <p>Headings appear in the sidebar outline.</p>
  </main>
</body>
</html>
```

Open the HTML file directly in a modern browser. Add a site manifest before the entry script to share navigation and feature choices across pages. For a page in a subfolder, adjust the paths to the entry script, stylesheet, and manifest.

## Where next

- [manifest.md](manifest.md): pages, roles, glossary, term options, and math macros shared across a site.
- [components.md](components.md): markup for every feature, including how to build the search index.
- [style-guide.md](style-guide.md): how to keep pages calm and colours meaningful.

The repository has two offline examples to copy from. Open [Pump Monitoring with PCA](../examples/pca/index.html)
for animated projections, an incident timeline, and a glossary. Open [A Decoder-Only Transformer](../examples/transformers/index.html)
for an interactive attention trace, decoding presets, and a run log with file dropzones.
