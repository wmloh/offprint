DocForm.setup(({ animation }) => {
  animation.mount('page-parts', {
    steps: [
      {
        key: 'outline',
        actions: [{ fade: '#page-reading-border', from: 1, to: 0 }]
      },
      {
        key: 'reading',
        actions: [
          { fade: '#page-outline-border', from: 1, to: 0 },
          { fade: '#page-reading-border', to: 1 }
        ]
      }
    ]
  });

  animation.mount('reading-route', {
    steps: [{ key: 'jump', actions: [{ draw: '#reading-route-line' }] }]
  });
});
