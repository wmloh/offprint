DocForm.setup(function (df) {
  df.data.defineTransform('budget-margin', function (source) {
    return source.value.map(function (run) {
      if (typeof run.latency_ms !== 'number') throw new Error('Each run needs a numeric latency.');
      return Object.assign({}, run, { margin: 25 - run.latency_ms });
    });
  });
});
