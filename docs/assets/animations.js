DocForm.setup(({ animation }) => {
  animation.mount('see-it-demo', {
    caption: 'Start at Search.',
    steps: [
      {
        key: 'draw',
        caption: 'The line shows the route from Search to the result.',
        actions: [{ draw: '#search-route' }]
      },
      {
        key: 'fade',
        caption: 'The matching heading appears.',
        actions: [{ fade: '#matching-heading', to: 1 }]
      },
      {
        key: 'move',
        caption: 'The dot follows the route to the heading.',
        actions: [{ move: '#search-marker', to: [262, 0] }]
      },
      {
        key: 'grow',
        caption: 'The growing ring calls attention to the destination.',
        actions: [{ attr: '#heading-ring', name: 'r', from: 6, to: 15 }]
      }
    ]
  });

  animation.mount('autoplay-outline', {
    caption: 'An outline lists the sections of this page.',
    steps: [
      {
        key: 'link',
        caption: 'A heading in the outline takes you to its section.',
        actions: [{ draw: '#outline-route' }]
      }
    ]
  });
});
