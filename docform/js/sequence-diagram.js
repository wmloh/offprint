// Participant lifelines and ordered, selectable messages.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm || !DocForm._diagram) return;

  var diagram = DocForm._diagram;
  var items = DocForm._items;
  var COLUMN = 164;
  var TOP = 58;
  var ROW = 66;

  function prepare(records, host) {
    if (!records.length) throw new Error('A sequence diagram needs at least one message.');
    var list = host.querySelector(':scope > .df-sequence-participants');
    var participants = new Map();
    if (list) Array.from(list.children).forEach(function (el) {
      var key = items.key(el.getAttribute('data-df-key') ?? el.id);
      if (!key || participants.has(key)) throw new Error('Participants need unique nonempty string keys.');
      participants.set(key, items.key(el.textContent) || key);
    });

    var keys = new Set();
    var messages = records.map(function (record) {
      var key = items.key(record.key);
      var from = items.key(record.from);
      var to = items.key(record.to);
      if (!key || keys.has(key)) throw new Error('Messages need unique nonempty string keys.');
      if (!from || !to || (list && (!participants.has(from) || !participants.has(to)))) {
        throw new Error('Message "' + key + '" needs valid sender and receiver keys.');
      }
      keys.add(key);
      [from, to].forEach(function (participant) {
        if (!participants.has(participant)) participants.set(participant, participant);
      });
      return { key: key, from: from, to: to, label: items.key(record.label) || key, initial: record.initial };
    });
    messages.participants = participants;
    return messages;
  }

  function markup(host) {
    var list = host.querySelector(':scope > .df-sequence-messages');
    return prepare(list ? Array.from(list.children, function (el) {
      return {
        key: el.getAttribute('data-df-key') ?? el.id,
        from: el.getAttribute('data-df-from'), to: el.getAttribute('data-df-to'),
        label: DocForm._data(el, 'label', el.textContent), initial: items.flag(el, 'initial', 'sequence')
      };
    }) : [], host);
  }

  function draw(messages, scroll) {
    var stage = diagram.element('div', 'df-sequence-stage');
    var width = messages.participants.size * COLUMN;
    var height = TOP + messages.length * ROW;
    stage.style.width = width + 'px';
    stage.style.height = height + 'px';
    var svg = diagram.svg('svg', { width: width, height: height, 'aria-hidden': 'true', focusable: 'false' }, stage);
    var columns = new Map();
    messages.participants.forEach(function (label, key) {
      var x = (columns.size + 0.5) * COLUMN;
      columns.set(key, x);
      diagram.svg('line', { x1: x, x2: x, y1: TOP - 12, y2: height - 6, class: 'df-sequence-lifeline' }, svg);
      var heading = diagram.element('span', 'df-sequence-participant', stage);
      diagram.position(heading, x - (COLUMN - 16) / 2, 8);
      heading.textContent = label;
      heading.title = label;
      heading.setAttribute('aria-hidden', 'true');
    });
    var nodes = messages.map(function (message, index) {
      var from = columns.get(message.from);
      var to = columns.get(message.to);
      var y = TOP + index * ROW + 34;
      var self = from === to;
      var route = self ? 'M' + from + ' ' + y + 'h54v17H' + from : 'M' + from + ' ' + y + 'H' + to;
      diagram.svg('path', { d: route }, svg);
      var tip = y + (self ? 17 : 0);
      var tail = to + (from < to ? -8 : 8);
      diagram.svg('path', { d: 'M' + tail + ' ' + (tip - 4) + 'L' + to + ' ' + tip +
        'L' + tail + ' ' + (tip + 4) }, svg);

      var button = diagram.element('button', 'df-sequence-message', stage);
      var label = messages.participants.get(message.from) + ' to ' + messages.participants.get(message.to) + ': ' + message.label;
      var size = self ? COLUMN - 24 : Math.abs(from - to) - 8;
      button.type = 'button';
      button.textContent = message.label;
      button.title = label;
      button.setAttribute('aria-label', (index + 1) + '. ' + label);
      button.setAttribute('data-df-key', message.key);
      button.style.width = size + 'px';
      diagram.position(button, self ? from - size / 2 : Math.min(from, to) + 4, y - 32);
      return button;
    });
    scroll.replaceChildren(stage);
    return {
      nodes: nodes,
      navigate: function (index, key) {
        if (key === 'ArrowUp') return Math.max(0, index - 1);
        if (key === 'ArrowDown') return Math.min(nodes.length - 1, index + 1);
        if (key === 'Home') return 0;
        if (key === 'End') return nodes.length - 1;
      },
      snapshot: function (message, index, key) {
        return { key: key, index: index, label: message.label, from: message.from, to: message.to };
      }
    };
  }

  DocForm._sequenceDiagram = diagram.recordDiagram('sequence', markup,
    { key: 'key', from: 'from', to: 'to', label: 'label' }, prepare, draw);
})(typeof window !== 'undefined' ? window : globalThis);
