DocForm.setup(({ _animation: animation }) => {
  animation.mount('see-it-demo', {
    label: 'Start at Search.',
    steps: [
      {
        key: 'draw',
        label: 'The line shows the route from Search to the result.',
        actions: [{ draw: '#search-route' }]
      },
      {
        key: 'fade',
        label: 'The matching heading appears.',
        actions: [{ fade: '#matching-heading', to: 1 }]
      },
      {
        key: 'move',
        label: 'The dot follows the route to the heading.',
        actions: [{ move: '#search-marker', to: [262, 0] }]
      },
      {
        key: 'grow',
        label: 'The growing ring calls attention to the destination.',
        actions: [{ attr: '#heading-ring', name: 'r', from: 6, to: 15 }]
      }
    ]
  });

  animation.mount('autoplay-outline', {
    steps: [{ key: 'link', actions: [{ draw: '#outline-route' }] }]
  });
});
