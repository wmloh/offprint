(function () {
  'use strict';

  document.getElementById('query-picker').hidden = false;

  DocForm.animation.mount('mask-story', { steps: [
    { key: 'scores', actions: [
      { fade: '#raw-scores' }
    ] },
    { key: 'mask', actions: [
      { fade: '#masked-cells' }
    ] },
    { key: 'normalize', actions: [
      { fade: '#raw-scores', to: 0, duration: 240 },
      { fade: '#weight-cells', delay: 240 }
    ] }
  ], duration: 600 });

  var output = document.getElementById('value-context');
  DocForm.params.on(['position', 'sharpness'], function (values) {
    var result = TinyDecoder.attention(values.position - 1, values.sharpness);
    var allowed = TinyDecoder.vocab.slice(0, 3).map(function (token, i) {
      return [token, result.weights[i] || 0, i < values.position ? 'Allowed' : 'Masked'];
    });
    DocForm.chart('weight-chart', {
      type: 'bar',
      y: { label: 'Attention weight', min: 0, max: 1, digits: 3 },
      series: [{ name: 'Key weight', role: 'context', data: allowed }]
    });
    output.textContent = '(' + result.context.map(function (value) { return value.toFixed(3); }).join(', ') + ')';
  });
})();
