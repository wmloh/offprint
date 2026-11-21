# Zoom presentation tools

Enable `zoom-tools`, which includes `zoom`. The add-on listens for the zoom lifecycle events and creates a fresh tool session on each open.

| Tool ID | Key | Behavior |
| --- | --- | --- |
| `cursor` | V | Default. Interact normally with the figure. |
| `magnifier` | M | Live circular lens, starting at 2.5×. Wheel or `[` / `]` adjusts 1.5×–6×. Clicks reach the figure. |
| `laser` | L | Glowing pointer with a fading trail. |
| `pen` | P | Thin ink. |
| `highlighter` | H | Wide translucent ink. |
| `measure` | C | Crosshair with a chart data readout or a timeline axis and lane readout. For other figures, drag a ruler in SVG units or image pixels. Hold Shift to constrain the ruler. |

- Ink modes remember their own swatch within the session and expose Undo (Ctrl or Cmd+Z) and Clear. Closing discards ink, measurement, and tool state. Tool shortcuts skip typing fields. The magnifier's cloned content is inert and has IDs removed.
- The crosshair uses the active chart's `coords(clientX, clientY)` and follows its current scales and range. Sequence and tree diagrams offer cursor, magnifier, laser, pen, and highlighter.
- `DocForm.zoomTools.active()` returns the current tool ID or `null`. `use(id)` selects a tool and returns `false` when the tool is unavailable in the current session or no session is open. `tools`, `colors`, and `limits` expose supported IDs, swatches, and lens bounds.

[Figure zoom](figure-zoom.md) · [Chart API](../data/charts.md) · [Source](../../js/zoomtools.js)
