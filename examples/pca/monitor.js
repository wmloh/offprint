(function () {
  'use strict';

  DocForm.anim('residual-story', [
    { caption: 'Project onto the retained directions.', actions: [
      { move: '#reconstruction-dot', to: [0, 81], easing: 'ease-out' }
    ] },
    { caption: 'Measure the leftover variation with the squared residual.', actions: [
      { draw: '#residual-line' },
      { fade: '#residual-label', delay: 260 }
    ] }
  ], { caption: 'Start with the standardized window.', duration: 700 });
})();
