# Zoom presentation tools

Enable `zoom-tools`, which includes `zoom`. The add-on listens for the zoom lifecycle events and creates a fresh tool session on each open.

| Tool ID | Key | Behavior |
| --- | --- | --- |
| `cursor` | 1 | Default. Interact normally with the figure. |
| `magnifier` | 2 | Live circular lens centred on the hidden cursor, starting at 2.5×. Wheel or `[` / `]` adjusts 1.5×–6×. Clicks reach the figure. |
| `laser` | 3 | Gray ring while hovering. Hold the primary button to draw a smooth red trace behind a glowing dot; it fades over about 2.5 s after release. Presses do not reach the figure. |
| `pen` | 4 | Thin ink. |
| `highlighter` | 5 | Wide translucent ink. |
| `eraser` | 7 | Shown first in the ink group, left of the swatches, only while pen, highlighter, or eraser is chosen. Drag a gray ring; any pen or highlighter stroke it touches is removed whole. 7 or the button returns to the last ink tool. |
| `measure` | 6 | Crosshair with a chart data readout or a timeline axis and lane readout. For other figures, drag a ruler in SVG units or image pixels. Hold Shift to constrain the ruler. |

- Ink modes remember their own swatch within the session and expose Undo (Ctrl or Cmd+Z), which reverses the last stroke or erase, and Clear, which cannot be undone. Closing discards ink, measurement, and tool state. Tool keys follow toolbar order; on sequence and tree diagrams, which have no measure tool, 6 does nothing. Tool shortcuts skip typing fields. The magnifier's cloned content is inert and has IDs removed.
- The crosshair follows the current chart or timeline scale. Sequence and tree diagrams offer cursor, magnifier, laser, pen, and highlighter.

[Figure zoom](figure-zoom.md) · [Charts](../data/charts.md) · [Source](../../js/zoomtools.js)
