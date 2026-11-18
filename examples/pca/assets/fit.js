DocForm.setup(function (df) {
  'use strict';

  df.animation.mount('fit-story', { steps: [
    { key: 'standardize', caption: 'The window is expressed in standardized coordinates.', actions: [
      { attr: '#window-dot', name: 'r', to: 10 }
    ] },
    { key: 'pc1', caption: 'PC1 is the direction of greatest baseline variance.', actions: [
      { draw: '#pc1-direction' }
    ] },
    { key: 'project', caption: 'The projected score keeps only the horizontal coordinate.', actions: [
      { fade: '#drop-to-pc1' },
      { fade: '#projected-window', delay: 240 },
      { move: '#projected-window', to: [0, 103], delay: 240, easing: 'ease-out' }
    ] }
  ], duration: 620 });

  var axis = document.getElementById('trial-axis');
  df.parameters.scope().subscribe(function (values) {
    axis.setAttribute('transform', 'rotate(' + -values.angle + ' 190 164)');
  }, { keys: ['angle'], immediate: true });
});
