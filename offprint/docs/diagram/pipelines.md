# Pipeline diagrams

Enable `pipeline` (loads `detail-pane`). Host `figure.op-pipeline` with a direct `ol.op-pipe-blocks` of `li.op-pipe-block` and optional `li.op-pipe-junction` items, an optional direct [`.op-detail-pane`](../interact/detail-panes.md), and an optional `figcaption`.

```html
<figure class="op-pipeline" id="flow" data-op-detail-layout="side">
  <ol class="op-pipe-blocks">
    <li class="op-pipe-block" id="ingest" data-op-to="clean check">
      <p class="op-pipe-eyebrow">Stage 1</p>
      <p class="op-pipe-headline">Ingest</p>
      <p class="op-pipe-description">Read raw files.</p>
    </li>
    <li class="op-pipe-block" id="clean" data-op-color="blue">
      <p class="op-pipe-eyebrow"></p>
      <p class="op-pipe-headline">Clean</p>
      <p class="op-pipe-links">Leads to <a class="op-pipe-link" href="#j" data-op-line="dashed">merge</a></p>
    </li>
    <li class="op-pipe-block" id="check" data-op-to="j"><p class="op-pipe-headline">Check</p></li>
    <li class="op-pipe-junction" id="j" data-op-to="report"></li>
    <li class="op-pipe-block" id="report"><p class="op-pipe-headline">Report</p></li>
  </ol>
  <div class="op-detail-pane">
    <div data-op-key="ingest">…</div><div data-op-key="clean">…</div>…
  </div>
</figure>
```

## Blocks and fields

- Structured fields: direct `.op-pipe-eyebrow`, `.op-pipe-headline`, `.op-pipe-description`. Missing, `:empty`, or whitespace-only fields (no media/inputs) get `data-op-pipe-empty` and `display: none`; spacing is a flex gap, so it closes up. Rechecked on DOM mutation.
- Field overrides: `data-op-color`/`data-op-role` tint a field; `hidden` hides it; inline `style` for anything else.
- Display override: direct `.op-pipe-display` replaces the visual template (fields become visually hidden, stay the accessible text and no-script/print content). Elements with `data-op-slot="eyebrow|headline|description"` inside it receive live copies of that field (IDs stripped); empty field → slot hidden. Display is `aria-hidden`.
- Block keys: `data-op-key`, else the ID. IDs are generated when missing (`<host id>-<n>`); give IDs to link targets. Block `data-op-color`/`data-op-role` tints border, background, and leading edge.
- Size: host `data-op-block-width` (CSS length) or `--op-pipe-block-width` (default 12rem). Blocks in one rank share the tallest height. Per block `data-op-width`, `data-op-height` (CSS length) opt out.
- Position: automatic ranks (longest path; cycles broken at DFS back edges; sources pulled next to their first successor) and half-row cross positions (barycentre ordering, forks/merges centred). Per block `data-op-col` (whole, 1-based rank) and `data-op-row` (1-based, steps of 0.5) pin. Gaps: `--op-pipe-gap-x` (4.5rem), `--op-pipe-gap-y` (1.25rem).
- Host `data-op-direction="right|down"` (default right).

## Lines

- Shorthand: `data-op-to="id id"` on a block or junction. Styled/fallback form: `.op-pipe-link` inside the source, target from `href="#id"` or `data-op-to`. A link replaces the shorthand edge for the same pair. Put links in `.op-pipe-links` for a visible no-script "Leads to" line; otherwise a visually hidden `.op-pipe-sr` sentence is generated (resolved through junctions).
- Link attributes: `data-op-label` (text at the curve midpoint), `data-op-line="solid|dashed|dotted"`, `data-op-arrow="end|start|both|none"` (default end; none into junctions), `data-op-color`/`data-op-role`, `data-op-flow` (moving dashes; host `data-op-flow` enables all), `data-op-exit`/`data-op-enter` = `top|right|bottom|left`, `data-op-via="col row; col row"` (1-based grid units, fractional allowed), `data-op-reveal-step`.
- Routing: cubic curves; default exit is the flow side and entry the opposite side. Same-rank edges use the facing cross sides; backward edges loop out of and into the cross-positive side (bottom for right, right for down).
- Fork/merge: two or more lines on one block side share a 12px straight stem, then fan. One arrowhead on a merge stem.
- Junctions: 10px dots; lines meet at the centre. Many-to-many relays (`A, B → • → C, D`). No selection or focus.
- Crossings: lines not sharing a block or junction are intersected numerically (20 samples per segment); the later line in document order gets a 5px masked gap.
- Colour: `--op-pipe-line` (default `--op-text-faint`); label surface `--op-pipe-surface` (default `--op-bg`).

## Interaction

- Mouse/pen hover, click, and focus select a block (sticky; touch swipes do not). Selection drives the linked pane, sets `aria-current="true"`, and joins `data-op-selection-group` on unstepped pipelines, or `data-op-block-selection-group` on stepped pipelines, with `data-op-selection-mode="both|publish|follow"` like [cards](../interact/card-panels.md).
- Hover/focus trace: `.op-pipe-tracing` on the host; upstream and downstream blocks, junctions, lines, and labels get `data-op-pipe-trace`; the rest dim to 30 %. Leaving the stage clears it unless a block keeps focus.
- Keyboard: one roving tab stop. Along the flow (Right/Left, or Down/Up for `down`) moves to the nearest successor/predecessor through junctions; across moves within the rank; Home/End go to the first/last visible block.
- Detail pane: a direct `.op-detail-pane` links automatically. `data-op-detail-layout="side"` puts it beside the canvas at a container width ≥ 46rem (sticky, `--op-detail-pane-max: min(30rem, 60svh)`); otherwise below. External panes use `data-op-detail-for="<pipeline id>"`.

## Steps

- Add a direct `ol[data-op-pipeline-steps]` with keyed `li` items. Each can supply a `[data-op-step-label]` child, `data-op-detail` note ID, or `data-op-initial`.
- Set `data-op-reveal-step="key"` on blocks and junctions to reveal them at that step. Unassigned blocks appear on the first step. Lines appear at the later of their two ends unless their link specifies a reveal key. Reveals fade without layout shift.
- A [step pill](../layout/buttons.md#step-pill) with Play/Pause precedes the canvas. Playback advances every 1.4 s. Reader navigation selects the first block of the new step. To follow a worked example, set the same `data-op-selection-group` on both hosts and match their step keys. Use `data-op-selection-mode="follow"` on the pipeline if only the stepper should publish.

## Fallback and events

- No script or print: numbered list of blocks with fields and authored links; the pane shows every detail; lines, labels, and the pill are omitted. Empty junctions are hidden.
- Horizontal overflow scrolls inside `.op-pipe-scroll`; the host keeps the figure width cap. Relayout on block resize, field mutation, font load, and page load. Hidden hosts lay out when shown.
- `op:pipeline:change` bubbles from the host with `{current, previous, origin}` and `{key, index, blockId}` states. For stepped diagrams, use `OffPrint.sequence.get(idOrHost)` for the [shared controller](../interact/step-contract.md).
- Diagnostics: missing list or blocks, missing link targets, self links, duplicate keys, invalid col/row/sides/via/direction/layout, unknown reveal keys.

[Detail panes](../interact/detail-panes.md) · [Card panels](../interact/card-panels.md) · [Source](../../js/pipeline.js)
