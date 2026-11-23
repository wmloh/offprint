# Figure steps

Enable `figure-steps`. Direct children of `.op-figure-steps` are a `figure`, a `.op-step-panel`, and optional `.op-step-details`. Use a visible selector heading before `.op-step-list` and label the panel group with it.

```html
<div class="op-figure-steps">
  <figure id="trace"><img src="trace.png" alt="Signal trace"></figure>
  <div class="op-step-panel" role="group" aria-labelledby="trace-title">
    <p id="trace-title" class="op-step-heading">Trace steps</p>
    <div class="op-step-list">
      <button type="button" data-op-key="start"><span data-op-step-label>Start</span></button>
      <button type="button" data-op-key="peak" data-op-detail="trace-peak"><span data-op-step-label>Peak</span></button>
    </div>
  </div>
  <div class="op-step-details"><div id="trace-peak">The signal peaks here.</div></div>
</div>
```

- Use direct buttons or an `ol`/`ul` with `.op-step-list` and one button per `li`. Without `.op-step-list`, the panel itself can hold the buttons. Use a unique `data-op-key` per button. Optional `data-op-detail` names a direct child of `.op-step-details` by ID. The local start is the first `data-op-initial` item or the first button.
- Mouse or pen movement over an entry, button focus, or activation selects it. The active button gets `aria-current="step"`. At 33rem container width, selector and details sit side by side under the [shared pane cap](card-panels.md). Details remain readable without JS and in print. Without details, `data-op-step-layout="side"` lets a small figure sit beside title-only cards.
- `data-op-numbered`, button `.op-tag` children, and `data-op-search` work as in [card panels](card-panels.md), set on `.op-figure-steps`. Search filters rows only (the `li` for list items) and needs `.op-step-list`. With an `ol` list, numbering duplicates the list markers.
- Figure steps can drive an existing [SVG animation](animations.md). Match each button’s `data-op-key` to the corresponding animation step, including `start` for the opening state.
- A separate [detail pane](detail-panes.md) can follow the steps with `data-op-detail-for="<wrapper id>"` and keys matching the step keys.
- Use `OffPrint.sequence.get(idOrWrapper)` for the [shared controller and event](step-contract.md). The step pill under the figure lets readers navigate in order.
- Standalone Reader exports keep Previous, Next, and a named step selector, including linked detail panes. Use a declarative definition for any SVG animation driven by the panel.

[Animations](animations.md) · [Card panels](card-panels.md) · [Worked-example steppers](worked-examples.md) · [Source](../../js/steps.js)
