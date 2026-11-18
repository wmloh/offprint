DocForm.setup(function (df) {
  'use strict';

  df.animation.mount('token-story', { steps: [
    { key: 'pieces', caption: 'Find each piece in the vocabulary.', actions: [
      { draw: '#token-links' }
    ] },
    { key: 'ids', caption: 'Read the IDs in sequence: 0, 1, 2.', actions: [
      { fade: '#token-numbers' }
    ] }
  ], caption: 'The tokenizer has already split the prompt.', duration: 650 });
});
