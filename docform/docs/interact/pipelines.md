# Pipeline diagrams

Enable `pipeline` (loads `detail-pane`). Host `figure.df-pipeline` with a direct `ol.df-pipe-blocks` of `li.df-pipe-block` and optional `li.df-pipe-junction` items, an optional direct [`.df-detail-pane`](detail-panes.md), and an optional `figcaption`.

```html
<figure class="df-pipeline" id="flow" data-df-detail-layout="side">
  <ol class="df-pipe-blocks">
    <li class="df-pipe-block" id="ingest" data-df-to="clean check">
      <p class="df-pipe-eyebrow">Stage 1</p>
      <p class="df-pipe-headline">Ingest</p>
      <p class="df-pipe-description">Read raw files.</p>
    </li>
    <li class="df-pipe-block" id="clean" data-df-color="blue">
      <p class="df-pipe-eyebrow"></p>
      <p class="df-pipe-headline">Clean</p>
      <p class="df-pipe-links">Leads to <a class="df-pipe-link" href="#j" data-df-line="dashed">merge</a></p>
    </li>
    <li class="df-pipe-block" id="check" data-df-to="j"><p class="df-pipe-headline">Check</p></li>
    <li class="df-pipe-junction" id="j" data-df-to="report"></li>
    <li class="df-pipe-block" id="report"><p class="df-pipe-headline">Report</p></li>
  </ol>
  <div class="df-detail-pane">
    <div data-df-key="ingest">…</div><div data-df-key="clean">…</div>…
  </div>
</figure>
```

## Blocks and fields

- Structured fields: direct `.df-pipe-eyebrow`, `.df-pipe-headline`, `.df-pipe-description`. Missing, `:empty`, or whitespace-only fields (no media/inputs) get `data-df-pipe-empty` and `display: none`; spacing is a flex gap, so it closes up. Rechecked on DOM mutation.
- Field overrides: `data-df-color`/`data-df-role` tint a field; `hidden` hides it; inline `style` for anything else.
- Display override: direct `.df-pipe-display` replaces the visual template (fields become visually hidden, stay the accessible text and no-script/print content). Elements with `data-df-slot="eyebrow|headline|description"` inside it receive live copies of that field (IDs stripped); empty field → slot hidden. Display is `aria-hidden`.
- Block keys: `data-df-key`, else the ID. IDs are generated when missing (`<host id>-<n>`); give IDs to link targets. Block `data-df-color`/`data-df-role` tints border, background, and leading edge.
- Size: host `data-df-block-width` (CSS length) or `--df-pipe-block-width` (default 12rem). Blocks in one rank share the tallest height. Per block `data-df-width`, `data-df-height` (CSS length) opt out.
- Position: automatic ranks (longest path; cycles broken at DFS back edges; sources pulled next to their first successor) and half-row cross positions (barycentre ordering, forks/merges centred). Per block `data-df-col` (whole, 1-based rank) and `data-df-row` (1-based, steps of 0.5) pin. Gaps: `--df-pipe-gap-x` (4.5rem), `--df-pipe-gap-y` (1.25rem).
- Host `data-df-direction="right|down"` (default right).

## Lines

- Shorthand: `data-df-to="id id"` on a block or junction. Styled/fallback form: `.df-pipe-link` inside the source, target from `href="#id"` or `data-df-to`. A link replaces the shorthand edge for the same pair. Put links in `.df-pipe-links` for a visible no-script "Leads to" line; otherwise a visually hidden `.df-pipe-sr` sentence is generated (resolved through junctions).
- Link attributes: `data-df-label` (text at the curve midpoint), `data-df-line="solid|dashed|dotted"`, `data-df-arrow="end|start|both|none"` (default end; none into junctions), `data-df-color`/`data-df-role`, `data-df-flow` (moving dashes; host `data-df-flow` enables all), `data-df-exit`/`data-df-enter` = `top|right|bottom|left`, `data-df-via="col row; col row"` (1-based grid units, fractional allowed), `data-df-step`.
- Routing: cubic curves; default exit is the flow side and entry the opposite side. Same-rank edges use the facing cross sides; backward edges loop out of and into the cross-positive side (bottom for right, right for down).
- Fork/merge: two or more lines on one block side share a 12px straight stem, then fan. One arrowhead on a merge stem.
- Junctions: 10px dots; lines meet at the centre. Many-to-many relays (`A, B → • → C, D`). No selection or focus.
- Crossings: lines not sharing a block or junction are intersected numerically (20 samples per segment); the later line in document order gets a 5px masked gap.
- Colour: `--df-pipe-line` (default `--df-text-faint`); label surface `--df-pipe-surface` (default `--df-bg`).

## Interaction

- Mouse/pen hover, click, and focus select a block (sticky; touch swipes do not). Selection drives the linked pane, sets `aria-current="true"`, and joins `data-df-selection-group` with `data-df-selection-mode="both|publish|follow"` like [cards](card-panels.md).
- Hover/focus trace: `.df-pipe-tracing` on the host; upstream and downstream blocks, junctions, lines, and labels get `data-df-pipe-trace`; the rest dim to 30 %. Leaving the stage clears it unless a block keeps focus.
- Keyboard: one roving tab stop. Along the flow (Right/Left, or Down/Up for `down`) moves to the nearest successor/predecessor through junctions; across moves within the rank; Home/End go to the first/last visible block.
- Detail pane: a direct `.df-detail-pane` links automatically. `data-df-detail-layout="side"` puts it beside the canvas at a container width ≥ 46rem (sticky, `--df-detail-pane-max: min(30rem, 60svh)`); otherwise below. External panes use `data-df-detail-for="<pipeline id>"`.

## Steps

- Any `data-df-step` (positive integer, default 1) on blocks or junctions enables steps; lines show from the later of their two ends unless the link sets its own step. Hidden items get `data-df-pipe-hidden` (fade, no layout shift); current-step blocks get `data-df-pipe-current`.
- A [step pill](buttons.md#step-pill) (Reset, Previous, `Step n of m`, Next, Play/Pause at 1.4 s) precedes the canvas. User steps select the first block of the new step.
- `data-df-steps-follow="<stepper id>"` replaces the pill: step = [stepper](worked-examples.md) index + 1 (clamped). Enable `stepper`.

## Fallback and API

- No script or print: numbered list of blocks with fields and authored links; the pane shows every detail; lines, labels, and the pill are omitted. Empty junctions are hidden.
- Horizontal overflow scrolls inside `.df-pipe-scroll`; the host keeps the figure width cap. Relayout on block resize, field mutation, font load, and page load. Hidden hosts lay out when shown.
- `DocForm.pipeline.get(idOrHost)` returns the [item controller](linked-highlighting.md) plus `layout()`, `fields(blockId, {eyebrow?, headline?, description?})` (string or `null`; creates missing fields in order; returns boolean), and `steps` {`go(n)`, `next()`, `previous()`, `reset()`, `snapshot()` → `{step, total}` or `null`, `subscribe`}. Snapshot `{key, index, blockId}`. Events bubble from the host: `df:pipeline:change` and `df:pipeline:step`.
- Diagnostics: missing list or blocks, missing link targets, self links, duplicate keys, invalid col/row/sides/via/direction/layout, missing stepper.

[Detail panes](detail-panes.md) · [Card panels](card-panels.md) · [Source](../../js/pipeline.js)
