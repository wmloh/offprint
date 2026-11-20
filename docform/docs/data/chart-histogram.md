# Histograms

Enable `"chart-histogram": true` in site or page features. Use `data-df-chart="histogram"` with a direct JSON spec, or `DocForm.chart(host, {type: "histogram", ...})`. A sibling HTML table inside the chart host provides a static fallback. The chart generates its interactive Table view from the current bins.

- Raw input uses `data: [1, 2, 2, 6]` or `series: [{key, name, data, role?, color?}]`. Observations must be finite numbers. All series share edges derived from pooled observations.
- Pre-binned input uses `edges: [1, 3, 10], counts: [3, 1]` or shared `edges` and `series: [{key, name, counts}]`. Require one nonnegative safe integer count per bin. A named source may supply either shape via a [full-spec transform](charts.md#named-source).
- For raw input, `bins: "fd"` (default) uses Freedman–Diaconis width `2 × IQR / n^(1/3)` to choose the bin count. Quartiles use linear interpolation. Zero IQR falls back to `"sturges"` (ceil(log₂(n)) + 1). Either rule uses one padded bin for constant input. Both rules cap at 500 bins.
- Set `bins` to an integer from 1 to 500, `{width: number}`, or `{edges: [...]}`. Count and rule modes spread bins evenly over the sample range. Width mode starts at the minimum and extends to cover the maximum. Supplied edges must be finite, strictly increasing, cover all observations, and define at most 500 bins. Bins include their lower edge and exclude their upper edge. The final bin includes both.
- `x: {type: "log"}` requires positive observations, supplied edges, axis bounds, and reference values. Generated edges are evenly spaced in base-10 log units, so `bins: {width: 1}` spans a tenfold ratio per bin. Supplied edges stay in their original units.
- `y: {type: "log"}` draws zero-valued bars empty and retains zero in inspection and Table. The automatic floor is below the least positive height. With only zeros it uses a positive default domain. Explicit positive axis bounds override the automatic bounds. Invalid updates leave the last valid chart in place.
- `measure: "count"` (default) shows counts. `"percent"` shows percent of observations. `"density"` divides a fraction by the bin width in the original x units, including on log x. The default overlay (`stack: "none"`) normalizes each series independently. `stack: "stacked"` uses the pooled total, so all stacked bins together sum to 100% or integrate to 1 when any observations exist.
- `toggles: true` enables legend filtering. Hiding a series keeps edges and normalization denominators and restacks the visible contributions. `rescale: true` fits y to the visible contributions. Brush, reference lines, fixed axis bounds, and [motion options](charts.md#motion) use the shared chart API.
- `model().histogramEdges` lists actual boundaries. With a selection group, bars and table cells share the generated `bin:<lower>:<upper>` key across series. Selection survives exact-edge matches. Motion matches bar slots from left to right by series and bin index, including when their edges move.

## Live bin count

Enable [parameters](../interact/parameters.md), define an integer range (for example min 1, max 20, step 1), and set its default to the chart's initial bin count. Use raw observations so the chart can re-bin them.

```html
<div data-df-parameter="bins" data-df-scope="histogram"></div>
<script>
  DocForm.ready(function () {
    var chart = DocForm.chart.get('distribution');
    var scope = DocForm.parameters.scope('histogram');
    if (!chart || !scope) return;
    scope.subscribe(function (values) {
      chart.update(Object.assign(chart.spec(), { bins: values.bins }));
    }, { keys: ['bins'] });
  });
</script>
```

The chart host has ID `distribution` and the range parameter is `bins` in scope `histogram`. The [charts guide](../../../docs/pages/data/charts.html#histograms) shows the complete example.
