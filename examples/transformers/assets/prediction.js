DocForm.ready(function (DF) {
  'use strict';

  var decoder = DF.parameters && DF.parameters.scope('decoder');
  var comparison = DF.parameters && DF.parameters.scope('comparison');
  if (!decoder || !comparison) return;
  var logits = TinyDecoder.logits();
  var late = TinyDecoder.vocab.indexOf('late');
  var output = document.getElementById('late-probability');
  var comparisonOutput = document.getElementById('comparison-probability');
  var chart = DF.chart && DF.chart.get(document.getElementById('temperature-chart'));
  var baseSpec = chart && chart.spec();
  var watchTemperature = { keys: ['temperature'], immediate: true };

  function probability(temperature) {
    return (TinyDecoder.softmax(logits, temperature)[late] * 100).toFixed(2) + '%';
  }

  decoder.subscribe(function (values) {
    output.textContent = probability(values.temperature);
    if (chart) chart.update(Object.assign({}, baseSpec, {
      referenceLines: [{ axis: 'x', value: values.temperature, label: 'Decoder temperature' }]
    }));
  }, watchTemperature);
  comparison.subscribe(function (values) {
    comparisonOutput.textContent = probability(values.temperature);
  }, watchTemperature);

  function connectReset(id, scope) {
    var button = document.getElementById(id);
    button.addEventListener('click', function () { scope.reset(); });
    button.hidden = false;
  }
  connectReset('reset-decoder', decoder);
  connectReset('reset-comparison', comparison);

  var vocab = TinyDecoder.vocab;
  var period = vocab.indexOf('.');
  var result = document.getElementById('decode-result');
  var rules = { greedy: 1, top2: 2, sample: vocab.length };

  decoder.subscribe(function (values) {
    var scores = logits.map(function (score, i) { return values.block_period && i === period ? -Infinity : score; });
    var ranked = TinyDecoder.softmax(scores, values.temperature)
      .map(function (p, i) { return { token: vocab[i], p: p }; })
      .filter(function (c) { return c.p > 0; })
      .sort(function (a, b) { return b.p - a.p; })
      .slice(0, rules[values.rule]);
    if (ranked.length === 1) {
      result.textContent = 'greedy decoding always appends ' + ranked[0].token;
      return;
    }
    var total = ranked.reduce(function (sum, c) { return sum + c.p; }, 0);
    result.textContent = 'sampling chooses ' + ranked.map(function (c) {
      return c.token + ' ' + (c.p / total * 100).toFixed(1) + '%';
    }).join(', ');
  }, { immediate: true });
});
