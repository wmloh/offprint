# Include order

Put the optional stylesheet, site manifest, and page configuration before the synchronous entry script in the head.

```html
<link rel="stylesheet" href="docform/docform.css">
<script src="site.js" data-df-site></script>
<script type="application/json" data-df-page>
  { "features": { "chart": true } }
</script>
<script src="docform/docform.js"></script>
<script defer src="page.js"></script>
```

- The default `reading` profile adds typography, callouts, theme, colour roles, navigation, reading controls, tooltips, references, citations, sidenotes, and search. Set `"profile": "none"` in the page configuration to start with a clean feature list. Set a feature to `true` to add it or `false` to disable it. DocForm loads required dependencies for enabled features.
- For evaluation pages, `chart-playback` brings in charts and `matrix` brings in named data support. Enable `data` for named sources and `parameters` when chart and table filters share controls. [Evaluation walkthroughs](components.md#evaluation-walkthroughs)
- Put theme choices in the head so DocForm can apply them before the page paints. A saved reader choice takes precedence.
- Use `DocForm.setup(fn)` from a classic author script after the entry to register data, start an animation, or attach listeners before the page is enhanced. Use `DocForm.ready(fn)` for code that needs the enhanced page. Both receive the `DocForm` object.
- When something fails, check the browser console or call `DocForm.diagnostics.list()` for the affected feature and correction.

See the [feature list](../docform/docs/setup/include-order.md) and [getting started example](getting-started.md).
