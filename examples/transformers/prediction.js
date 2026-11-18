(function () {
  'use strict';

  var logits = TinyDecoder.logits();
  var late = TinyDecoder.vocab.indexOf('late');
  var output = document.getElementById('late-probability');
  DocForm.params.on('temperature', function (values) {
    var probability = TinyDecoder.softmax(logits, values.temperature)[late];
    output.textContent = (probability * 100).toFixed(2) + '%';
  });
})();
