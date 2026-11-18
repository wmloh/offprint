# Figure steps

Load `css/steps.css` and `js/steps.js` after core. Direct children of `.df-figure-steps` are a `figure`, a `.df-step-panel`, and optional `.df-step-details`. Use a visible selector heading before `.df-step-list` and label the panel group with it.

```html
<div class="df-figure-steps">
  <figure id="trace"><img src="trace.png" alt="Signal trace"></figure>
  <div class="df-step-panel" role="group" aria-labelledby="trace-title">
    <p id="trace-title" class="df-step-heading">Trace steps</p>
    <div class="df-step-list">
      <button type="button" data-df-step="0">Start</button>
      <button type="button" data-df-step data-df-step-detail="trace-peak">Peak</button>
    </div>
  </div>
  <div class="df-step-details"><div id="trace-peak">The signal peaks here.</div></div>
</div>
```

- Use direct buttons or an `ol`/`ul` with `.df-step-list` and one button per `li`. Without `.df-step-list`, the panel itself can hold the buttons. Empty or invalid `data-df-step` uses the button's one-based position. Explicit nonnegative integers select that state. `0` is the animation start. `data-df-step-detail` names a direct child of `.df-step-details` by ID. A step without a matched detail leaves the detail pane empty when enhanced.
- First entry starts selected. Mouse or pen movement over an entry, button focus, or activation selects it. The active button gets `aria-current="step"`. At 33rem container width, selector and details sit side by side under the [shared pane cap](card-panels.md). Details remain readable without JS and in print. Without a detail pane, `data-df-step-layout="side"` lets a small figure sit beside title-only cards when space permits.
- For animated figures load `anim.css` and `anim.js` and create the animation in a page script after the figure markup. The panel calls `controller.go(step)` and takes over the figure's controls. If the controller is missing at setup, the panel retries at page load. For custom figures listen on the figure for `df:figurestep` with `{index, step}` (zero-based button position and authored step). Selection sets `data-df-active-step`, including at startup.
- `DocForm.steps.select(figureIdOrElement, step)` selects an authored numeric step, with `false` for an unknown figure or step. Call after setup. To capture startup selection, attach the figure listener before setup or read its active-step attribute afterward.

[Animations](animations.md) · [Card panels](card-panels.md) · [Worked-example steppers](worked-examples.md) · [PCA projection example](../../../examples/pca/pages/fit.html#fit-story) · [Source](../../js/steps.js)
