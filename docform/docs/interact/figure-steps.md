# Figure steps

Enable `figure-steps`. Direct children of `.df-figure-steps` are a `figure`, a `.df-step-panel`, and optional `.df-step-details`. Use a visible selector heading before `.df-step-list` and label the panel group with it.

```html
<div class="df-figure-steps">
  <figure id="trace"><img src="trace.png" alt="Signal trace"></figure>
  <div class="df-step-panel" role="group" aria-labelledby="trace-title">
    <p id="trace-title" class="df-step-heading">Trace steps</p>
    <div class="df-step-list">
      <button type="button" data-df-key="start"><span data-df-step-label>Start</span></button>
      <button type="button" data-df-key="peak" data-df-detail="trace-peak"><span data-df-step-label>Peak</span></button>
    </div>
  </div>
  <div class="df-step-details"><div id="trace-peak">The signal peaks here.</div></div>
</div>
```

- Use direct buttons or an `ol`/`ul` with `.df-step-list` and one button per `li`. Without `.df-step-list`, the panel itself can hold the buttons. Use a unique `data-df-key` per button. Optional `data-df-detail` names a direct child of `.df-step-details` by ID. The local start is the first `data-df-initial` item or the first button.
- Mouse or pen movement over an entry, button focus, or activation selects it. The active button gets `aria-current="step"`. At 33rem container width, selector and details sit side by side under the [shared pane cap](card-panels.md). Details remain readable without JS and in print. Without details, `data-df-step-layout="side"` lets a small figure sit beside title-only cards.
- `data-df-numbered`, button `.df-tag` children, and `data-df-search` work as in [card panels](card-panels.md), set on `.df-figure-steps`. Search filters rows only (the `li` for list items) and needs `.df-step-list`. With an `ol` list, numbering duplicates the list markers.
- Figure steps can drive an existing [SVG animation](animations.md). Match each button’s `data-df-key` to the corresponding animation step, including `start` for the opening state.
- A separate [detail pane](detail-panes.md) can follow the steps with `data-df-detail-for="<wrapper id>"` and keys matching the step keys.
- Use `DocForm.sequence.get(idOrWrapper)` for the [shared controller and event](step-contract.md). The step pill under the figure lets readers navigate in order.

[Animations](animations.md) · [Card panels](card-panels.md) · [Worked-example steppers](worked-examples.md) · [PCA projection example](../../../examples/pca/pages/fit.html#fit-story) · [Source](../../js/steps.js)
