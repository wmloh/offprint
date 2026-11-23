# Local file dropzones

Enable `dropzone` and any target feature. A dropzone reads one local file using the browser's picker or drag and drop. Its authored prompt remains readable without scripts.

```html
<div id="runs-preview" data-op-source="runs" data-op-data-view="table"></div>
<div data-op-dropzone data-op-accept="csv" data-op-target="runs-preview">
  <p>Replace this preview.</p>
</div>
<div data-op-dropzone data-op-accept="csv" data-op-target-source="runs">
  <p>Replace the shared runs.</p>
</div>
```

- With no destination, display a separate local file view under the zone. Set `data-op-data-view`, `data-op-tree-depth`, and optional caps there. Reset removes the output.
- `data-op-target="id"` overrides one chart, data view, or results table until its Reset. A named view then shows the latest shared data. A static results table restores its original DOM, sort, and filters. For named chart uploads, the existing field mapping and transform apply. A standalone chart uses the first tabular column for x and subsequent columns for series, or accepts a JSON/YAML chart spec. Tabular chart uploads use `maxRows` and show a count when truncated.
- `data-op-target-source="name"` explicitly replaces the named source. Every bound view must accept the replacement. Reset restores the original source. Use only one destination attribute per zone.
- `data-op-accept` takes comma- or space-separated type names, default CSV, TSV, JSON, YAML, XML, and Markdown. Extensions take priority over MIME, including `.yaml`/`.yml` and `.md`/`.markdown`. `data-op-max-size` defaults to 1 MiB. `data-op-max-rows` defaults to 5000. Bound view caps still apply.
- A new choice or Reset invalidates older reads for the destination. A successful API update also supersedes pending reads. Rejected uploads preserve the last accepted data, and a zone can reset only a replacement it still owns.

[Named sources](data-blocks.md) · [Charts](charts.md) · [Results](results-tables.md)
