// Pinned scrolling figures: a .df-scrolly figure stays in view while its data-df-step prose scrolls past,
// and the step in view drives the figure's DocForm.anim timeline.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] scrolly.js needs core.js loaded before it.');
    return;
  }

  // Index of the last step whose top has passed the trigger line, or -1 before the first step.
  function activeStep(tops, line) {
    var index = -1;
    for (var i = 0; i < tops.length; i++) if (tops[i] <= line) index = i;
    return index;
  }

  // Animation step for a prose step: its data-df-step number, else its position (1-based); 0 before any step.
  function stepNumber(values, index) {
    if (index < 0 || index >= values.length) return 0;
    var raw = values[index];
    var n = raw === null || raw === undefined || String(raw).trim() === '' ? NaN : Number(raw);
    return isFinite(n) && n >= 0 ? Math.floor(n) : index + 1;
  }

  // Steps take over a little below the pinned figure, kept between half and most of the viewport height.
  function triggerLine(viewport, figureBottom) {
    return Math.min(viewport * 0.85, Math.max(viewport * 0.5, figureBottom + viewport * 0.1));
  }

  function setup(box) {
    var figure = box.querySelector(':scope > figure, :scope > .df-scrolly-figure') || box.querySelector('figure');
    if (!figure) {
      DocForm.warnOnce('scrolly:figure', 'A .df-scrolly block needs a figure to pin.');
      return null;
    }
    var steps = DocForm.all('[data-df-step]', box).filter(function (el) { return !figure.contains(el); });
    if (!steps.length) DocForm.warnOnce('scrolly:steps', 'A .df-scrolly block has no data-df-step elements.');
    var values = steps.map(function (el) { return el.getAttribute('data-df-step'); });
    var shown = null;
    var synced = null;
    figure.classList.add('df-scrolly-figure');
    box.classList.add('df-scrolly-ready');

    return function update() {
      var view = root.innerHeight;
      var line = triggerLine(view, figure.getBoundingClientRect().bottom);
      var index = activeStep(steps.map(function (el) { return el.getBoundingClientRect().top; }), line);
      var ctl = DocForm.anim && DocForm.anim.get ? DocForm.anim.get(figure) : null;
      if (index === shown && ctl === synced) return;
      var step = stepNumber(values, index);
      if (ctl) {
        // The first sync after load jumps straight to the step in view; later changes animate.
        if (ctl !== synced) ctl.go(step);
        else ctl.to(step);
        synced = ctl;
      }
      if (index === shown) return;
      shown = index;
      steps.forEach(function (el, i) { el.classList.toggle('is-active', i === index); });
      figure.setAttribute('data-df-active-step', String(step));
      if (typeof root.CustomEvent === 'function') {
        figure.dispatchEvent(new root.CustomEvent('df:scrollystep', { detail: { index: index, step: step } }));
      }
    };
  }

  DocForm.register('scrolly', function () {
    var updates = DocForm.all('.df-scrolly').map(setup).filter(Boolean);
    if (!updates.length) return;
    var pending = false;
    function run() {
      pending = false;
      updates.forEach(function (fn) { fn(); });
    }
    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(run);
    }
    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('resize', schedule);
    // Page scripts may build the figure's animation later; check again once the page has loaded.
    root.addEventListener('load', schedule);
    run();
  });

  DocForm.scrolly = {
    activeStep: activeStep,
    stepNumber: stepNumber,
    triggerLine: triggerLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
