# Offline data file wrapper

Open [tools/data-file.html](../../tools/data-file.html) from disk. Select local `.csv`, `.json`, `.yaml`, or `.yml` files. Download or copy the generated script for each file. The converter reads and checks files locally and still provides a wrapper when it reports a parse or size issue.

- `runs.csv` becomes `runs.csv.js`, registering the name `runs` (basename without last extension). The script stores raw text and detected type in `window.DocFormData[name] = {type, text}`. Use distinct names because wrappers assign directly by key.
- Save the wrapper beside the page or in its asset folder and load it as a classic script before data-block setup. Keep the core, data, and view assets local, plus the YAML vendor when needed. Reconvert after editing the source file.

```html
<div data-df-data="runs"></div>
<script src="assets/runs.csv.js"></script>
<script src="docform/js/core.js"></script>
<script src="docform/js/data.js"></script>
```

- The converter reports parse problems, table shape or nested data, and default-cap warnings at 1 MiB and 5000 rows or lines. The page decides its own cap and presentation. Copy falls back to selecting the generated script text if clipboard access is blocked.

[Data blocks and assets](data-blocks.md) · [Include order](../setup/include-order.md) · [Reader dropzones](dropzones.md)
