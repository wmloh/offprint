# Include order

Copy the `docform/` folder next to your pages and include its files in this order. Every path below assumes the page sits beside `docform/`; adjust the relative paths for pages in subfolders.

```html
<head>
  <!-- 1. Styles: tokens first, then base, then any module styles. -->
  <link rel="stylesheet" href="docform/css/tokens.css">
  <link rel="stylesheet" href="docform/css/base.css">
  <link rel="stylesheet" href="docform/css/MODULE.css">
  <!-- 2. Theme script (optional), in the head so the saved theme applies before first paint. -->
  <script src="docform/js/theme.js"></script>
</head>
<body>
  <!-- Page content -->

  <!-- 3. Site manifest (optional), marked with data-df-site. -->
  <script src="site.js" data-df-site></script>
  <!-- 4. Core, before every module. -->
  <script src="docform/js/core.js"></script>
  <!-- 5. Modules, in any order. -->
  <script src="docform/js/MODULE.js"></script>
</body>
```

Rules:

- Load `theme.js` in `<head>` without `defer` or `async`; it is the one script that does not wait for core. Include `theme.css` too. With `controls.js` the theme toggle sits in the control pill; to show one elsewhere, put `<span data-df-theme-toggle></span>` (or an empty `<button data-df-theme-toggle>`) where it should appear.
- Load the manifest before `core.js`, and `core.js` before any module.
- Keep `data-df-site` on the manifest script. Page paths in the manifest are read relative to that file, so pages in different folders can share one manifest.
- Use plain `<script src>` tags at the end of `<body>`, or `defer` on all of them in `<head>`. Do not use `async` or `type="module"`.
- For math, add `docform/vendor/katex/katex.min.css` and `docform/css/math.css` in the head, and load `docform/vendor/katex/katex.min.js` before `docform/js/math.js`. Write inline math as `<span class="df-math">a^2</span>` and display math as `<div class="df-math" data-df-display>…</div>`. Invalid TeX shows in red with the error on hover.
- Other modules pair a stylesheet with a script: `controls`, `tooltip`, `code`, `tabs`, `anim`, `params`, `reveal`, `scrolly`, `zoom`, and `bubble`. `bubble` also needs `blocks.css`. To drive an animated figure, `scrolly` also needs `anim.css` and `anim.js`. `blocks.css` (tags, callouts, and the no-script look of `details`) has no script.
- Put page scripts that call `DocForm.anim` or `DocForm.params.on` after the module scripts.
- Pages without a manifest still work. They get only the features that don't need one.

Start a manifest from `docform/site.template.js`.
