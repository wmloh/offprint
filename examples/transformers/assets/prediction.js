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

(function () {
  'use strict';

  var vocab = TinyDecoder.vocab;
  var logits = TinyDecoder.logits();
  var period = vocab.indexOf('.');
  var output = document.getElementById('decode-result');
  var rules = { greedy: 1, top2: 2, sample: vocab.length };

  DocForm.params.on(['temperature', 'rule', 'block_period'], function (values) {
    var scores = logits.map(function (score, i) { return values.block_period && i === period ? -Infinity : score; });
    var ranked = TinyDecoder.softmax(scores, values.temperature)
      .map(function (p, i) { return { token: vocab[i], p: p }; })
      .filter(function (c) { return c.p > 0; })
      .sort(function (a, b) { return b.p - a.p; })
      .slice(0, rules[values.rule]);
    if (ranked.length === 1) {
      output.textContent = 'greedy decoding always appends ' + ranked[0].token;
      return;
    }
    var total = ranked.reduce(function (sum, c) { return sum + c.p; }, 0);
    output.textContent = 'sampling chooses ' + ranked.map(function (c) {
      return c.token + ' ' + (c.p / total * 100).toFixed(1) + '%';
    }).join(', ');
  });
})();
