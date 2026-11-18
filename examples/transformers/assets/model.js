window.TinyDecoder = (function () {
  'use strict';

  var vocab = ['the', 'train', 'is', 'late', 'here', '.'];
  var inputs = [[1, 0], [0, 1.5], [1.5, 1]];
  var readout = [[-0.25, 0.05], [-0.32, 0.10], [-0.10, -0.10], [0.65, 0.05], [0.42, 0.22], [0.05, 0.20]];

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1];
  }

  function softmax(scores, temperature) {
    var peak = Math.max.apply(null, scores);
    var exp = scores.map(function (score) { return Math.exp((score - peak) / temperature); });
    var total = exp.reduce(function (sum, value) { return sum + value; }, 0);
    return exp.map(function (value) { return value / total; });
  }

  function attention(position, temperature) {
    var query = inputs[position];
    var keys = inputs.slice(0, position + 1);
    var scores = keys.map(function (key) { return dot(query, key) / Math.sqrt(2); });
    var weights = softmax(scores, temperature);
    var context = [0, 1].map(function (dim) {
      return weights.reduce(function (sum, weight, i) { return sum + weight * keys[i][dim]; }, 0);
    });
    return { weights: weights, context: context };
  }

  function hidden(position) {
    var context = attention(position, 1).context;
    var x = inputs[position][0] + context[0];
    var y = inputs[position][1] + context[1];
    var first = Math.max(0, 0.5 * x - 0.25 * y);
    var second = Math.max(0, -0.5 * x + 0.5 * y);
    return [x + 0.4 * first, y - 0.3 * second];
  }

  function logits() {
    var last = hidden(inputs.length - 1);
    return readout.map(function (row) { return dot(row, last); });
  }

  return { vocab: vocab, attention: attention, softmax: softmax, hidden: hidden, logits: logits };
})();
