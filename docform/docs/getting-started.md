# Getting started

DocForm turns plain HTML pages into Notion-style notes with math, tooltips, code blocks, animated and scroll-driven figures, split views, and sliders. It needs no server, no build step, and no internet: open the pages straight from disk.

## 1. Copy the folder

Copy the whole `docform/` folder into your project, next to your pages:

```
my-notes/
  docform/        ← copied as is
  index.html      ← your pages
  site.js         ← optional manifest (see manifest.md)
```

Pages in subfolders work too; just adjust the relative paths (for example `../docform/...`).

## 2. Include the files

Stylesheets go in `<head>`, scripts at the end of `<body>`:

1. `tokens.css`, then `base.css`, then the stylesheets of the modules you use.
2. `theme.js` in `<head>`, if you want the light and dark toggle.
3. Your manifest, `site.js`, marked with `data-df-site` (optional).
4. `core.js`.
5. Module scripts, in any order. Page scripts that use `DocForm.anim` or `DocForm.params` come last.

[include-order.md](include-order.md) has the full rules.

## 3. A minimal page

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My first page</title>
  <link rel="stylesheet" href="docform/css/tokens.css">
  <link rel="stylesheet" href="docform/css/base.css">
  <link rel="stylesheet" href="docform/css/nav.css">
  <link rel="stylesheet" href="docform/css/theme.css">
  <link rel="stylesheet" href="docform/css/controls.css">
  <link rel="stylesheet" href="docform/css/blocks.css">
  <link rel="stylesheet" href="docform/vendor/katex/katex.min.css">
  <link rel="stylesheet" href="docform/css/math.css">
  <script src="docform/js/theme.js"></script>
</head>
<body>
  <nav class="df-sidebar">
    <div data-df-nav></div>
  </nav>

  <main class="df-page">
    <h1>My first page</h1>
    <p>Euler's identity is <span class="df-math">e^{i\pi} + 1 = 0</span>.</p>

    <div class="df-callout" data-df-color="blue" data-df-icon="💡">
      Callouts highlight one idea.
    </div>

    <h2>Next section</h2>
    <p>Headings appear in the sidebar outline.</p>
  </main>

  <script src="docform/js/core.js"></script>
  <script src="docform/js/nav.js"></script>
  <script src="docform/js/controls.js"></script>
  <script src="docform/vendor/katex/katex.min.js"></script>
  <script src="docform/js/math.js"></script>
</body>
</html>
```

Open the file in Chrome. Without a manifest the sidebar shows the page outline; add one to list several pages. The pill in the top-left corner holds the theme, focus mode, and sidebar toggles.

## Where next

- [manifest.md](manifest.md): pages, roles, glossary, and math macros shared across a site.
- [components.md](components.md): markup for every feature.
- [style-guide.md](style-guide.md): how to keep pages calm and colours meaningful.

The `examples/` folder in the DocForm repository has a one-page and a multi-page example to copy from.
