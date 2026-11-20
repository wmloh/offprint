DocForm.setup(({ animation }) => {
  animation.mount('build-it-up-demo', {
    steps: [
      {
        key: 'sections',
        caption: 'Two section headings make two entries.',
        actions: [{ fade: '#outline-subheading', from: 0, to: 0 }]
      },
      {
        key: 'all',
        caption: 'The smaller heading adds a third entry under its parent.',
        actions: [{ fade: '#outline-subheading', from: 0, to: 1 }]
      }
    ]
  });
});
