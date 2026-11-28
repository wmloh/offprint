# Stylesheet and script order

## Offline entry

Synchronous `offprint.js` in the head after the optional marked manifest and early page JSON. An optional static `offprint.css` covers reading styles. The entry resolves feature assets from its own directory, loads each URL once, and orders enhancements. Use ordered classic author scripts after the entry.

- Default `reading` roots: `base`, `blocks`, `theme`, `roles`, `navigation`, `controls`, `tooltips`, `references`, `citations`, `sidenotes`, `search`, `sections`.
- `blocks` is a selectable aggregate ID for [`tags`](../reading/tags.md) and [`callouts`](../reading/callouts.md). Use `features.blocks: true` with `profile: "none"` to enable both, or choose either ID individually. Disabling a required feature also blocks the aggregate.
- Other selectable features include `tokens`, `tags`, `callouts`, `concept-tables`, `math`, `selection`, `animation`, `choices`, `parameters`, `code`, `editable-text`, `dropdowns`, `tree`, `markdown`, `data`, `data-view`, `chart`, `chart-playback`, `dropzone`, `results`, `matrix`, `scenarios`, `quiz`, `tabs`, `detail-pane`, `cards`, `figure-steps`, `stepper`, `pipeline`, `timeline`, `gantt`, `sequence`, `tree-diagram`, `split-views`, `reveals`, `peek-bubbles`, `glossary`, `zoom`, and `zoom-tools`.
- `features` maps IDs to booleans. Explicitly disabling a requirement prevents its dependents from starting. Examples: `citations` needs `tooltips`, `scenarios` needs `chart`, `quiz` needs `choices`, `dropdowns`, `chart`, and `cards`, `data-view` and `dropzone` need `data`, `zoom-tools` needs `zoom`, `parameters` needs `choices` and `dropdowns`, `chart`, `results`, and `matrix` need `choices`, and `cards`, `figure-steps`, `pipeline`, `timeline`, `gantt`, `sequence`, and `tree-diagram` need `detail-pane`; `gantt` also needs `choices`.
- `chart-playback` includes `chart`. Chart add-on IDs (`chart-intervals`, `chart-histogram`, `chart-heatmap`, `chart-grid`, `chart-combo`, `chart-fits`, `chart-annotations`, `chart-facets`) also include `chart`; see [chart add-ons](../data/charts.md#add-ons). `matrix` includes `base` and `data`. Enable `data` alongside named-source charts, results, scenarios, timelines, Gantt charts, sequence diagrams, or tree diagrams, and add `parameters` for scoped record filters. Fixed record filters only need `data` and the consuming feature.
- Optional integrations activate when both features are selected. Choose `animation` with `figure-steps` for animated steps. Choose `code` with `editable-text` for live syntax highlighting. Choose `stepper` with `pipeline` for stepper-driven pipeline steps, and `selection` for diagram and detail-pane selection groups. Opt into `code`, `results`, `tree`, or `markdown` for the corresponding enhanced raw data view. References and sidenotes use tooltip previews when available.


[Offline setup](setup.md) · [Manifest](manifest.md)
