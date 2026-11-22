# Terminal asset refresh

Same outputs as [tools/assets.html](../../tools/assets.html), byte for byte, without a browser. Two entry points.

## Python launcher

[refresh_assets.py](../../tools/refresh_assets.py), Python 3.9+. Projects call it from a root launcher ([AUTHORING](../AUTHORING.md#data); [docs site launcher](../../../docs/refresh-assets.py)).

- `main(manifest, site_root=None, argv=None)`: launcher entry; accepts no arguments or `--check`, else exit 2. `refresh(manifest, *, site_root=None, check=False, node=None)` for direct calls. `site_root` defaults to the manifest folder; pass it when the manifest sits in a subfolder.
- Data wrappers (`assets.data`) are built in Python; YAML needs PyYAML. The search index (`assets.search`) runs the Node CLI with `--search`.
- Node: `node` argument, else `DOCFORM_NODE`, else `node` on `PATH`. Missing: data still refreshes, search prints `Skipped`, exit 1.
- Order: validate every data entry, run search, then write data. An invalid entry, or a blocked index in write mode, writes nothing.
- Prints `Current`, `Updated`, or with `--check` `Missing`/`Stale`, per output. Exit 0 only when every output is current or refreshed.

## Node CLI

[refresh-assets.js](../../tools/refresh-assets.js), Node 18+, built-in modules only. Runs the shipped `asset-build.js`, `search.js`, `tooltip.js`, and `data.js` with the `data-df-*` flag semantics of `assets.html`.

```sh
node docform/tools/refresh-assets.js <site-folder> [--manifest=<path in folder>] [--check] [--search]
```

- Without `--manifest`, discovers the manifest like `assets.html`; several found → error. Folders starting with `.` are not read.
- Default: writes every missing or stale output; any blocked output → nothing written, exit 1. `--check`: writes nothing, exit 1 if anything is missing, stale, or blocked. `--search`: index only.
- Status lines on stdout, `Blocked:` reasons and notes on stderr.

## Strict page parser

Builds the browser's tree for well-formed HTML: optional end tags (`p`, `li`, `dt`/`dd`, `option`, table rows and cells), implied `tbody`/`tr`/`colgroup`, raw text (`script`, `style`, `title`, `textarea`), SVG and MathML, comments, and the full WHATWG named character reference table. Attribute typos are kept as a browser keeps them (`data-x"` stays a name with a quote).

Refused with page and line, because the browser would repair them into a different tree: an inline element still open where a block or cell ends, stray or mismatched end tags, nested `a`/`button`/`form`, text or elements directly in table structure, self-closing non-void HTML (`<div/>`), `&name` without `;` that a browser decodes, unknown or invalid references (`&bogus;`, `&#128;`), HTML inside `svg`/`math`, `iframe`/`xmp`/`frameset`/`plaintext`, `template` in `head`, `<!--` in `script`, and content after `</body>`. Fix the markup, or build in `assets.html`.

[Search index](search-index.md) · [Data wrappers](file-wrapper.md)
