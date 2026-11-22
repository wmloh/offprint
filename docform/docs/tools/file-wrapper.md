# Offline data file wrappers

Open [tools/assets.html](../../tools/assets.html) from disk and choose the site folder. Use a site manifest with named data descriptors. Paths resolve from the manifest. The tool detects CSV, TSV, JSON, YAML/YML, XML, and Markdown (MD) by extension. Set `type` explicitly to override detection.

```json
{
  "assets": {
    "data": {
      "runs": {"source": "../data/runs.csv", "output": "generated/runs.js"}
    }
  }
}
```

- Check the outputs to generate. Save selected scripts directly when folder save access is available, or download each script and move it to its listed destination. Expand an output to preview or copy it.
- Each wrapper registers an entry in `window.DocFormData` under the configured name with `format`, `version`, `metadata`, `type`, and raw `text`. The offline entry loads it through `assets.data[name].output` before setup when `data` is enabled.
- Missing or malformed sources block their own outputs. An invalid raw file can still be copied or downloaded as an explicit draft. Sources above the default 1 MiB or 5000 rows or lines are flagged and remain exportable. Each page controls its view caps.

## Python refresh

Python 3.9+. From a project launcher, load [refresh_data.py](../../tools/refresh_data.py) and call `refresh(manifest, site_root=...)`. The site root defaults to the manifest directory. Pass it when the manifest is in a site subfolder. The function validates and refreshes every entry under `assets.data`, rewrites only outputs whose content changed, prints each output's status, and returns a process exit code. Any invalid entry stops the whole run before writing. YAML entries need PyYAML; other types use the standard library. Rerun it after editing a data file, then reload the page. See the [documentation site's launcher](../../../docs/refresh-data.py).

[Data blocks and assets](../data/data-blocks.md) · [Search index](search-index.md) · [Reader dropzones](../data/dropzones.md)
