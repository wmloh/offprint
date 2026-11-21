DocForm.setup(({ animation }) => {
  animation.mount('build-it-up-demo', {
    steps: [
      {
        key: 'sections',
        label: 'Two section headings make two entries.',
        actions: [{ fade: '#outline-subheading', from: 0, to: 0 }]
      },
      {
        key: 'all',
        label: 'The smaller heading adds a third entry under its parent.',
        actions: [{ fade: '#outline-subheading', from: 0, to: 1 }]
      }
    ]
  });
});
