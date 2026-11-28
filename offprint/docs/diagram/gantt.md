# Gantt charts

Enable `gantt` (loads `detail-pane`, `choices`). Use `figure.op-gantt` with a direct `ol.op-gantt-tasks`, an optional direct `.op-detail-pane`, and an optional `figcaption`. One task per row; fixed 744px stage that scrolls inside narrow figures.

```html
<figure class="op-gantt" id="launch" data-op-as-of="2026-06-10" data-op-weekends>
  <ol class="op-gantt-tasks">
    <li data-op-key="design" data-op-start="2026-06-01" data-op-end="2026-06-05" data-op-progress="100">1–5 June · Design</li>
    <li data-op-key="api" data-op-group="Build" data-op-start="2026-06-08" data-op-duration="5"
        data-op-depends="design" data-op-progress="60" data-op-planned-start="2026-06-06"
        data-op-planned-end="2026-06-10" data-op-label="Build API">8–12 June · Build API</li>
    <li data-op-key="ship" data-op-start="2026-06-15" data-op-milestone data-op-depends="api">15 June · Ship</li>
  </ol>
  <div class="op-detail-pane"><p data-op-key="api">Endpoints and tests.</p></div>
  <figcaption>Launch plan</figcaption>
</figure>
```

## Tasks

- `data-op-key` or ID (unique; must not equal a group name), `data-op-label` or text as label, required `data-op-start`, then exactly one of `data-op-end` or `data-op-duration`, unless `data-op-milestone`.
- Positions: finite numbers or ISO dates `YYYY-MM-DD` (UTC calendar days) throughout one chart. Date end is inclusive (`06-01` to `06-05` = 5 days); duration counts days (dates) or units (numbers). Numeric end is exact.
- Milestone: `data-op-milestone`, zero duration, or numeric end equal to start; diamond at the start (start of that day). An end equal to the start date or duration 0 is allowed with the flag.
- `data-op-progress` 0–100 (`%` optional) fills the bar. Ignored on milestones.
- `data-op-planned-start` + `data-op-planned-end` (or records' `plannedDuration`) draw a thin planned bar under the actual bar; same conventions.
- `data-op-group="<name>"`: group row named and keyed by the name, placed at its first task with every member gathered beneath it; one level. Span derived (earliest start to latest end). Collapsible: toggle, Left/Right keys, or host `data-op-collapsed="Build, Test"` (comma list) to start closed.
- `data-op-initial` picks the first selected row (else first row or matching group key).
- Cap 60 rows including group rows.

## Dependencies

- `data-op-depends`: space, comma, or semicolon list of `key`, `key:SS`, `key:FS+2`, `key:FF-1`. Types FS (default), SS, FF, SF; lag in days (dates) or units. Records may use `[{key, type, lag}]`. Only tasks, not groups.
- Constraint for predecessor P → successor S: FS `S.start ≥ P.end + lag`, SS `S.start ≥ P.start + lag`, FF `S.end ≥ P.end + lag`, SF `S.end ≥ P.start + lag` (date ends are exclusive internally, so FS lag 0 allows the next day).
- Arrows route at right angles from P's start or end to S's start or end; a stub-and-return route is used when there is no room. Arrows to tasks in a collapsed group attach to the group row.
- Unmet dependency: one console warning per link, dashed orange arrow and bar outline, and "not met" in the row's name. Unknown keys and cycles reject the chart; cycles name their path (`a → b → a`).

## Derived schedule

- Forward pass: earliest start = authored start, pushed later only by unmet dependencies. Backward pass from the latest earliest finish. Total float = latest start − earliest start, in days or units; critical = zero float (float is never negative because unmet links push earliest dates later). Critical links are tight links between critical tasks.
- Shown only when the chart has at least one dependency: red outline on critical bars and red critical arrows; row names add "on the critical path" or "N days of float".

## Layers and status line

- Chips above the chart toggle `Critical path` (with dependencies) and `Planned dates` (with planned dates). Host `data-op-layers-off="planned critical"` starts layers off.
- `data-op-as-of="<date|number>"` draws a labelled status line (end of that day for dates). No live clock.
- `data-op-weekends` shades Saturdays and Sundays on date charts when a day is at least 3px wide.

## Reveal steps

Set `data-op-reveal-sequence="<sequence id>"` on the host. Tasks take `data-op-reveal-step` (records `revealStep`); their rows and arrows fade in from that step. Layers take `data-op-reveal-planned`, `data-op-reveal-critical`, `data-op-reveal-as-of` on the host. Reader export captures each step.

## Interaction and fallbacks

- Hover, click, tap, Enter, or Space selects a row. Up/Down move between shown rows, Home/End jump, Left collapses a group or moves to it, Right expands a group or enters it. Selecting a task inside a collapsed group (e.g. from a linked view) opens the group. Arrows of the selected row darken.
- Direct detail panes link automatically; external panes use `data-op-detail-for="<id>"`; detail children use task or group keys.
- `data-op-selection-group` (enable `selection`) with `data-op-selection-mode` and `data-op-selection-seed` as on other diagrams.
- `data-op-zoom` (enable `zoom-tools`) gives background-click fullscreen and a crosshair reading the date or position and the row.
- Script disabled or invalid initial data: the authored list stays visible. Print shows a list of rows with dates, progress, dependencies, and float.
- Interactive export restores selection, collapsed groups, and layer chips; Reader export removes chips and toggles and keeps the current view.

## Named sources

Enable `data`; set `data-op-source="name"` (authored list as fallback). Flat records with `key`, `label`, `start`, `end`, `duration`, `group`, `progress`, `milestone`, `depends` (string tokens or array), `plannedStart`, `plannedEnd`, `revealStep`; or nested `planned: {start, end | duration}`. Map field names with `options.gantt.mapping`, e.g. `{"start":"from","end":"through","depends":"after"}`. Replacement keeps the selected key and collapsed groups that still exist. Quote dates in YAML.

## API and events

- `op:gantt:change` bubbles with `{current, previous, origin}`; states `{key, index, kind: 'task'|'group', label, start, end}` (ISO dates with inclusive end, or numbers), tasks add `group, milestone, progress, float, critical`, groups add `tasks`.
- `OffPrint._gantt.get(host)` keyed controller; `.view(host)` → `{setLayer(name, on), setCollapsed(group, closed), layers(), collapsed()}`; `.prepare(records, settings)` for checks.

[Timeline diagrams](timelines.md) · [Detail panes](../interact/detail-panes.md) · [Step sequences](../interact/step-contract.md) · [Named data sources](../data/data-blocks.md)
