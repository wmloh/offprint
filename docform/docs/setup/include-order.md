# Stylesheet and script order

## Offline entry

Synchronous `docform.js` in the head after the optional marked manifest and early page JSON. An optional static `docform.css` covers reading styles. The entry resolves feature assets from its own directory, loads each URL once, and orders enhancements. Use ordered classic author scripts after the entry.

- Default `reading` roots: `base`, `blocks`, `theme`, `roles`, `navigation`, `controls`, `tooltips`, `references`, `citations`, `sidenotes`, `search`, `sections`.
- `blocks` is a selectable aggregate ID for [`tags`](../reading/tags.md) and [`callouts`](../reading/callouts.md). Use `features.blocks: true` with `profile: "none"` to enable both, or choose either ID individually. Disabling a required feature also blocks the aggregate.
- Other selectable features include `tokens`, `tags`, `callouts`, `concept-tables`, `math`, `selection`, `animation`, `parameters`, `code`, `tree`, `data`, `data-view`, `chart`, `chart-playback`, `dropzone`, `results`, `matrix`, `scenarios`, `tabs`, `cards`, `figure-steps`, `stepper`, `split-views`, `reveals`, `peek-bubbles`, `glossary`, `zoom`, and `zoom-tools`.
- `features` maps IDs to booleans. Explicitly disabling a requirement prevents its dependents from starting. Examples: `citations` needs `tooltips`, `scenarios` needs `chart`, `data-view` and `dropzone` need `data`, and `zoom-tools` needs `zoom`.
- `chart-playback` includes `chart`. `matrix` includes `base` and `data`. Enable `data` alongside named-source charts, results, or scenarios, and add `parameters` for scoped record filters. Fixed record filters only need `data` and the consuming feature.
- Optional integrations activate when both features are selected. Choose `animation` with `figure-steps` for animated steps. Opt into `code`, `results`, or `tree` for the corresponding enhanced raw data view. References and sidenotes use tooltip previews when available.


[Offline setup](setup.md) · [Manifest](manifest.md)
