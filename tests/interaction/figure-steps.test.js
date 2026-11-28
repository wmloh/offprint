const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, draw, KEY } = require('../support/mounted-chart');

test('figure step controls paint keyed SVG frames and restore the opening drawing', () => {
  let box, figure, route, marker, jump;
  const { OffPrint } = setup({
    modules: ['detail', 'steps', 'anim'],
    animation: { cancelAnimationFrame() {}, clearTimeout() {} },
    enhance(op, document) {
      document.readyState = 'complete';
      box = document.body.appendChild(new Node('div'));
      box.className = 'op-figure-steps';
      box.setAttribute('data-op-step-layout', 'side');
      figure = box.appendChild(new Node('figure'));
      const svg = figure.appendChild(new Node('svg'));
      route = svg.appendChild(new Node('path'));
      marker = svg.appendChild(new Node('circle'));
      marker.setAttribute('r', '5');
      const panel = box.appendChild(new Node('div'));
      panel.className = 'op-step-panel';
      const start = panel.appendChild(new Node('button'));
      start.setAttribute(KEY, 'start');
      jump = panel.appendChild(new Node('button'));
      jump.setAttribute(KEY, 'jump');

      op._animation.mount(figure, {
        duration: 800, easing: 'linear', steps: [{
          key: 'jump', actions: [
            { draw: 'path' }, { fade: 'circle' },
            { move: 'circle', to: [40, 0] }, { attr: 'circle', name: 'r', to: 9 }
          ]
        }]
      });
    }
  });

  const frame = () => [route.style.strokeDashoffset, marker.style.opacity, marker.style.translate, marker.getAttribute('r')];
  assert.deepEqual(frame(), ['1', '0', '0px 0px', '5']);
  OffPrint.sequence.get(figure).seek(400);
  assert.deepEqual(frame(), ['0.5', '0.5', '20px 0px', '7']);

  jump.dispatchEvent(new Event('focus'));
  assert.deepEqual(frame(), ['', '1', '40px 0px', '9']);
  assert.equal(jump.getAttribute('aria-current'), 'step');

  const controls = figure.querySelector('.op-figure-step-controls');
  controls.querySelector('.op-pill-previous').dispatchEvent(new Event('click'));
  assert.deepEqual(frame(), ['1', '0', '0px 0px', '5']);
  assert.equal(OffPrint.sequence.get(box).key, 'start');
  assert.equal(OffPrint.sequence.get(figure).key, 'start');
});
