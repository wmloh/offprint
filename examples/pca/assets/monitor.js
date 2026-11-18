DocForm.setup(function (df) {
  'use strict';

  df.animation.mount('residual-story', { steps: [
    { key: 'project', caption: 'Project onto the retained directions.', actions: [
      { move: '#reconstruction-dot', to: [0, 81], easing: 'ease-out' }
    ] },
    { key: 'residual', caption: 'Measure the leftover variation with the squared residual.', actions: [
      { draw: '#residual-line' },
      { fade: '#residual-label', delay: 260 }
    ] }
  ], caption: 'Start with the standardized window.', duration: 700 });
});
