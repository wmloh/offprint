(function () {
  'use strict';

  DocForm.anim('fit-story', [
    { caption: 'The window is expressed in standardized coordinates.', actions: [
      { attr: '#window-dot', name: 'r', to: 10 }
    ] },
    { caption: 'PC1 is the direction of greatest baseline variance.', actions: [
      { draw: '#pc1-direction' }
    ] },
    { caption: 'The projected score keeps only the horizontal coordinate.', actions: [
      { fade: '#drop-to-pc1' },
      { fade: '#projected-window', delay: 240 },
      { move: '#projected-window', to: [0, 103], delay: 240, easing: 'ease-out' }
    ] }
  ], { duration: 620 });

  var axis = document.getElementById('trial-axis');
  DocForm.params.on('angle', function (values) {
    axis.setAttribute('transform', 'rotate(' + -values.angle + ' 190 164)');
  });
})();
