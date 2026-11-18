# Stylesheet and script order

## Offline entry

Synchronous `docform.js` in the head after the optional marked manifest and early page JSON. An optional static `docform.css` covers reading styles. The entry resolves feature assets from its own directory, loads each URL once, and orders enhancements. Use ordered classic author scripts after the entry.

- Default `reading` roots: `base`, `blocks`, `theme`, `roles`, `navigation`, `controls`, `tooltips`, `references`, `citations`, `sidenotes`, `search`.
- Other selectable features: `tokens`, `tags`, `callouts`, `concept-tables`, `math`, `selection`, `animation`, `parameters`, `code`, `tree`, `data`, `data-view`, `chart`, `dropzone`, `results`, `scenarios`, `tabs`, `cards`, `figure-steps`, `stepper`, `split-views`, `reveals`, `peek-bubbles`, `glossary`, `wide`, `zoom`, `zoom-tools`.
- `features` maps IDs to booleans. Explicitly disabling a requirement prevents its dependents from starting. Examples: `citations` needs `tooltips`, `scenarios` needs `chart`, `data-view` and `dropzone` need `data`, and `zoom-tools` needs `zoom`.
- Optional integrations activate when both features are selected. Choose `animation` with `figure-steps` for animated steps. Enable `data` alongside named-source charts, results, or scenarios. Opt into `code`, `results`, or `tree` for the corresponding enhanced raw data view. References and sidenotes use tooltip previews when available.


[Offline setup](setup.md) · [Manifest](manifest.md)
