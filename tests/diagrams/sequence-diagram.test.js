const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, GROUP, KEY, hover } = require('../support/mounted-chart');

test('sequence diagrams keep message and participant order while linking selection and mapped records', () => {
  const add = (parent, tag, attrs, label) => {
    const el = parent.appendChild(new Node(tag));
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (label) el.textContent = label;
    return el;
  };
  const input = (rows) => ({ type: 'csv', text: 'id,sender,recipient,caption\n' + rows.join('\n') });
  let diagram, named, pane, data;
  const { OffPrint: OP, document, warnings } = setup({
    modules: ['data', 'detail', 'diagram', 'sequence-diagram'],
    enhance(OP, document, boot) {
      document.createElement = (tag) => {
        const el = new Node(tag);
        el.focus = () => { document.activeElement = el; el.dispatchEvent(new Event('focus')); };
        return el;
      };
      boot.optionLayers = (feature) => feature === 'sequence' ? [{
        mapping: { key: 'id', from: 'sender', to: 'recipient', label: 'caption' }
      }] : [];
      diagram = add(document.body, 'figure', { class: 'op-sequence', id: 'messages', [GROUP]: 'order' });
      const participants = add(diagram, 'ul', { class: 'op-sequence-participants' });
      add(participants, 'li', { [KEY]: 'shop' }, 'Shop');
      add(participants, 'li', { [KEY]: 'buyer' }, 'Buyer');
      const messages = add(diagram, 'ol', { class: 'op-sequence-messages' });
      add(messages, 'li', { [KEY]: 'request', 'data-op-from': 'buyer', 'data-op-to': 'shop' }, 'Request');
      add(messages, 'li', { [KEY]: 'check', 'data-op-from': 'shop', 'data-op-to': 'shop' }, 'Check');
      add(messages, 'li', { [KEY]: 'reply', 'data-op-from': 'shop', 'data-op-to': 'buyer' }, 'Reply');
      pane = add(diagram, 'div', { class: 'op-detail-pane' });
      for (const key of ['request', 'check', 'reply']) add(pane, 'p', { [KEY]: key }, key);
      named = add(document.body, 'figure', { class: 'op-sequence', [GROUP]: 'order', 'data-op-source': 'messages' });
      data = OP.data.define('messages', input(['request,buyer,shop,Request', 'reply,shop,buyer,Reply']));
    }
  });
  const authored = OP._sequenceDiagram.get('messages');
  const mapped = OP._sequenceDiagram.get(named);
  const buttons = diagram.querySelectorAll('.op-sequence-message');
  assert.deepEqual(warnings, []);
  assert.deepEqual(diagram.querySelectorAll('.op-sequence-participant').map((el) => el.textContent), ['Shop', 'Buyer']);
  assert.deepEqual(buttons.map((el) => el.getAttribute(KEY)), ['request', 'check', 'reply']);
  assert.equal(diagram.querySelectorAll('path')[2].getAttribute('d'), 'M82 158h54v17H82');
  assert.equal(authored.snapshot().key, 'request');
  hover(buttons[2], 'touch');
  assert.equal(authored.snapshot().key, 'request');
  hover(buttons[2], 'pen');
  assert.equal(mapped.snapshot().key, 'reply');
  assert.equal(OP._detailPane.get(pane).snapshot().key, 'reply');
  hover(buttons[0]);
  const end = Object.assign(new Event('keydown', { cancelable: true }), { key: 'End' });
  buttons[0].dispatchEvent(end);
  assert.equal(end.defaultPrevented, true);
  assert.equal(document.activeElement, buttons[2]);
  assert.equal(mapped.snapshot().key, 'reply');
  assert.equal(OP._detailPane.get(pane).snapshot().key, 'reply');
  assert.equal(data.update(input(['reply,shop,buyer,Done', 'request,buyer,shop,Go'])), true);
  assert.equal(mapped.snapshot().index, 0);
  assert.equal(mapped.snapshot().label, 'Done');
  assert.equal(data.update(input(['reply,shop,,Invalid'])), false);
  assert.equal(mapped.snapshot().key, 'reply');
});
