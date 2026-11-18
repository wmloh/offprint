# Stylesheet and script order

Paths below are relative to `docform/`. In HTML, prefix them with the path from the page to that folder.

1. In `<head>`, load `css/tokens.css`, `css/base.css`, then styles for the features used. Load `vendor/katex/katex.min.css` before `css/math.css`.
2. For the theme, load `css/theme.css` and a synchronous `js/theme.js` after the stylesheets in `<head>` so its initial theme applies before paint.
3. At the end of `<body>`, load the optional manifest as `<script src="site.js" data-df-site></script>`, then `js/core.js`, feature scripts, and page scripts. Ordered deferred classic scripts also work in `<head>`. Keep dependencies in sequence and omit `async` and `type="module"` on executable DocForm scripts.
4. Most feature scripts pair with a same-named stylesheet in `css/`. `blocks.css` is CSS-only and also supplies the unenhanced `details` styling. `core.js` uses the shared base styles.

| Integration | Sequence or additional assets |
| --- | --- |
| Math | `vendor/katex/katex.min.js` before `math.js`. `math.js` before modules that render math during setup, such as `tooltip.js` and `params.js`. |
| References, navigation | `refs.js` before `nav.js` to outline the generated References heading. For citation cards, hover sidenotes, and code annotation previews, load `tooltip.js` before `refs.js`, `notes.js`, and `code.js` respectively, with `tooltip.css`. Cross-reference previews attach after synchronous setup and also use those tooltip assets. |
| Site glossary | `tooltip.css` and `tooltip.js` with `glossary.css` and `glossary.js`. Load `search.js` before `glossary.js` for indexed tips and used-on links. |
| Peek bubbles | `blocks.css` and `bubble.css` with `bubble.js`. Load `bubble.js` before `notes.js` and `wide.js` for initial measurements. |
| Wide blocks | Load `wide.js` after `bubble.js` and `notes.js` when used together. |
| Figure steps and zoom | `anim.css` and `anim.js` for an animated figure. `zoom.js` before `zoomtools.js`, with both stylesheets for presentation tools. |
| Scenario comparisons | `chart.css` and `scenarios.css`. Load `chart.js` before `scenarios.js`. |
| Data views | Load wrapped data and, for YAML, `vendor/js-yaml/js-yaml.min.js` before data-block initialization. Putting them before core works with either script placement above. Put `data.js` after core. Add CSS and JS for the enhanced views (`code`, `results`, `tree`). Their APIs must be available when the data block first draws. |
| Dropzones | Load `data.js` before `dropzone.js`. For static results-table targets load `dropzone.js` before `results.js` to capture the author-supplied table header. |
| Page scripts | Place scripts that call `DocForm.anim`, `DocForm.params`, or other feature APIs after the feature scripts. |

[Offline setup](setup.md) · [Manifest](manifest.md)
