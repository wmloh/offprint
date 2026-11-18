(function () {
  'use strict';

  DocForm.anim('token-story', [
    { caption: 'Find each piece in the vocabulary.', actions: [
      { draw: '#token-links' }
    ] },
    { caption: 'Read the IDs in sequence: 0, 1, 2.', actions: [
      { fade: '#token-numbers' }
    ] }
  ], { caption: 'The tokenizer has already split the prompt.', duration: 650 });
})();
