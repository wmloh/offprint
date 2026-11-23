# Chart add-on registration

Enable `chart`. In an author setup callback, call `OffPrint.chart.addon(id, {types?, scales?, legends?})` before automatic chart enhancement. It returns `true` on success or `false` with a warning on rejection. Use distinct lowercase-hyphenated IDs and type names. After registration, use the type name as `data-op-chart` or as the spec’s `type`.

- `types[name]` sets `base` to `line`, `bar`, `scatter`, or `pie`. Optional `prepare(spec, kit)` transforms input before base normalization. `normalize(model, spec, kit, prepared)` returns the adapted model. Throw from either hook to report invalid input.
- Inherit the base renderer or supply `draw(chart, width, kit)` returning `{frame, marks, spots, geom, layer?, overlay?, empty?}`. Bar types can use `categoryMarks(ctx, series, visibleIndex, group, model, kit)` and scatter types can use `continuousMarks(ctx, model, kit)` to share the base axes. Use `ctx.place` for point inspection and selection, and stable mark keys for motion.
- Optional hooks cover readouts, tables, descriptions, keyboard input, coordinate mapping, and markup or record adapters. The hook `kit` supplies helpers including `svg`, `html`, `paint`, `markId`, `addMark`, `scale`, and tick formatting.
- `scales[name](d0, d1, r0, r1)` returns a scale function with `invert`. Core scales are `linear`, `log`, and `time`. `legends[name](chart, legendEl, kit)` renders extra legend items when a type declares `legend: name`.
- `OffPrint.chart.addons()` lists registered IDs. `OffPrint.chart.scale(name)` and `OffPrint.chart.legend(name)` look up registered functions or return `null`.

Built-in implementations [interval plots](../../js/chart-intervals.js), [histograms](../../js/chart-histogram.js), and [heatmaps](../../js/chart-heatmap.js) show the renderer and adapter hooks.
