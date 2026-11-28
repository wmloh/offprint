const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, GROUP, KEY } = require('../support/mounted-chart');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../../offprint/js', file), 'utf8');
const context = vm.createContext({ console });
context.window = context;
['core.js', 'detail.js', 'diagram.js', 'pipeline.js'].forEach((file) => vm.runInContext(read(file), context));
const P = context.OffPrint._pipeline;
const D = context.OffPrint._diagram;
const edges = (pairs) => pairs.map(([from, to]) => ({ from, to }));
const none = (n) => Array(n).fill(null);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('ranks follow the longest path, break cycles at back edges, and honour pinned columns', () => {
  const chain = P.ranks(4, edges([[0, 1], [1, 2], [2, 0], [0, 3]]), none(4));
  assert.deepEqual(plain(chain.rank), [0, 1, 2, 1]);
  assert.deepEqual([...chain.back], [2]);

  // A late source moves next to its successor instead of waiting in the first column.
  const merge = P.ranks(4, edges([[0, 1], [1, 2], [3, 2]]), none(4));
  assert.deepEqual(plain(merge.rank), [0, 1, 2, 1]);

  const pinned = P.ranks(3, edges([[0, 1], [1, 2]]), [null, 3, null]);
  assert.deepEqual(plain(pinned.rank), [2, 3, 4]);
});

test('rows centre forks and merges on half rows and keep pinned rows clear', () => {
  const fork = edges([[0, 1], [0, 2]]);
  assert.deepEqual(plain(P.rows(3, fork, [0, 1, 1], none(3))), [1, 0, 2]);

  const merge = edges([[0, 2], [1, 2]]);
  assert.deepEqual(plain(P.rows(3, merge, [0, 0, 1], none(3))), [0, 2, 1]);

  // A chain into a fork stays straight while both ends of the fork split around it.
  const chain = edges([[0, 1], [1, 2], [1, 3]]);
  assert.deepEqual(plain(P.rows(4, chain, [0, 1, 2, 2], none(4))), [1, 1, 0, 2]);

  const pinned = P.rows(3, edges([[0, 1], [0, 2]]), [0, 1, 1], [null, 0, null]);
  assert.equal(pinned[1], 0);
  assert.ok(Math.abs(pinned[2] - pinned[1]) >= 2);
});

test('centres give neighbours their gap, share the space across half rows, and start at the edge', () => {
  const c = D.centers([0, 2, 1], [0, 0, 1], [40, 60, 30], 20);
  assert.equal(c[2] - c[0], 40 / 2 + 20 + 60 / 2);
  assert.equal(c[1], (c[0] + c[2]) / 2);
  assert.equal(c[0], 20);

  const b = D.bands([0, 1, 1, 3], [100, 80, 120, 10], 50);
  assert.deepEqual(plain(b.center), [50, 210, 320, 375]);
  assert.equal(b.total, 380);
  assert.equal(D.interpolate([0, 10, 30], 1.5), 20);
  assert.equal(D.interpolate([0, 10, 30], 3), 50);
});

test('curves run straight between aligned ports and gaps are found only where lines cross', () => {
  const straight = D.curve([[0, 0], [100, 0]], [1, 0], [1, 0]);
  assert.ok(D.sample(straight, 10).every(([, y]) => y === 0));
  assert.match(D.pathData(straight), /^M0 0C/);

  const a = D.sample(D.curve([[0, 0], [100, 100]], [1, 0], [1, 0]), 20);
  const b = D.sample(D.curve([[0, 100], [100, 0]], [1, 0], [1, 0]), 20);
  const c = D.sample(D.curve([[0, 200], [100, 200]], [1, 0], [1, 0]), 20);
  const hits = D.crossings(a, b, 5);
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(hits[0][0] - 50) < 1 && Math.abs(hits[0][1] - 50) < 1);
  assert.equal(D.crossings(a, c, 5).length, 0);

  const via = D.curve([[0, 0], [50, 40], [100, 0]], [1, 0], [1, 0]);
  assert.equal(via.length, 2);
  assert.deepEqual(plain(via[0][3]), [50, 40]);
});

test('via points and empty fields are parsed strictly', () => {
  assert.deepEqual(plain(P.parseVia('2.5 1; 3 1.5')), [[1.5, 0], [2, 1]]);
  assert.deepEqual(plain(P.parseVia('')), []);
  assert.equal(P.parseVia('2'), null);
  assert.equal(P.parseVia('a b'), null);

  const field = (text, media = false) => ({ textContent: text, querySelector: () => media || null });
  assert.equal(P.isEmpty(field('  \n ')), true);
  assert.equal(P.isEmpty(field('Clean')), false);
  assert.equal(P.isEmpty(field('', {})), false);
});

test('a mounted pipeline preserves fork geometry, tracing, keyboard navigation, and keyed details', () => {
  let host, document, inline, external;
  const graph = [];
  const { OffPrint, warnings } = setup({
    modules: ['detail', 'diagram', 'pipeline'],
    groups: { flow: { initial: 'write' } },
    animation: { addEventListener() {}, getComputedStyle: () => ({ columnGap: '40px', rowGap: '20px', position: 'fixed' }) },
    enhance(_op, doc) {
      document = doc;
      document.readyState = 'complete';
      function add(parent, tag, attrs) {
        const el = parent.appendChild(new Node(tag));
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
        return el;
      }
      host = add(document.body, 'figure', { id: 'flow', class: 'op-pipeline', [GROUP]: 'flow', 'data-op-detail-layout': 'side' });
      // A connected stage allows the production measurement and SVG drawing to run.
      const create = doc.createElement;
      doc.createElement = (tag) => Object.assign(create(tag), { isConnected: true });
      const list = add(host, 'ol', { class: 'op-pipe-blocks' });
      [
        ['write', 'links terms', 100, 40],
        ['links', 'merge', 80, 30],
        ['terms', 'merge', 120, 50],
        ['merge', 'share', 12, 12],
        ['share', '', 90, 40]
      ].forEach(([id, to, width, height]) => {
        const el = add(list, 'li', { id, class: id === 'merge' ? 'op-pipe-junction' : 'op-pipe-block', 'data-op-to': to });
        el.offsetWidth = width;
        el.offsetHeight = height;
        el.focus = () => {
          document.activeElement = el;
          el.dispatchEvent(new Event('focus'));
        };
        graph.push(el);
      });
      const route = add(graph[2], 'a', { class: 'op-pipe-link', href: '#merge', 'data-op-line': 'dashed', 'data-op-label': 'Review' });
      route.textContent = 'Review';
      inline = add(host, 'div', { class: 'op-detail-pane' });
      external = add(doc.body, 'div', { class: 'op-detail-pane', 'data-op-detail-for': 'flow' });
      [inline, external].forEach(pane => {
        ['write', 'links', 'terms', 'share'].forEach(key => add(pane, 'div', { [KEY]: key }));
      });
    }
  });
  const stage = host.querySelector('.op-pipe-stage');
  const lines = host.querySelector('.op-pipe-lines');
  const controller = OffPrint._pipeline.get('flow');
  const [write, links, terms, merge, share] = graph;
  const geometry = () => ({
    blocks: graph.map(({ style }) => [style.left, style.top, style.minHeight]),
    viewBox: lines.getAttribute('viewBox'),
    paths: lines.querySelectorAll('.op-pipe-path').map(path => path.getAttribute('d')),
    label: host.querySelector('.op-pipe-label').textContent
  });
  const original = geometry();
  assert.deepEqual(original, {
    blocks: [
      ['32px', '72px', ''],
      ['192px', '32px', '50px'],
      ['172px', '102px', ''],
      ['332px', '86px', undefined],
      ['384px', '72px', '']
    ],
    viewBox: '0 0 506 184',
    paths: [
      'M144 92C168 92 162 57 186 57',
      'M144 92C168 92 142 127 166 127',
      'M272 57C303.4 57 310.3 77.3 338 92',
      'M292 127C316.3 127 318.7 106.7 338 92',
      'M338 92C362 92 354 92 378 92',
      'M144 92L132 92'
    ],
    label: 'Review'
  });
  assert.equal(controller.layout(), true);
  assert.deepEqual(geometry(), original);
  assert.equal(terms.querySelector('.op-pipe-link').tabIndex, -1);
  assert.ok(lines.querySelector('.op-pipe-line-dashed'));
  assert.deepEqual(warnings, []);

  function current(key) {
    assert.equal(controller.snapshot().key, key);
    assert.equal(controller.snapshot().blockId, key);
    assert.equal(OffPrint.selection.group('flow').get(), key);
    [inline, external].forEach(pane => {
      assert.equal(OffPrint._detailPane.get(pane).snapshot().key, key);
      assert.deepEqual(pane.children.filter(child => !child.inert).map(child => child.getAttribute(KEY)), [key]);
    });
    assert.deepEqual(graph.filter(el => el.hasAttribute('aria-current')).map(el => el.id), [key]);
  }

  function fire(el, type, props) {
    const event = Object.assign(new Event(type, { cancelable: true }), props);
    el.dispatchEvent(event);
    return event;
  }

  current('write');
  assert.equal(write.tabIndex, 0);
  fire(terms, 'pointermove', { pointerType: 'touch' });
  current('write');
  fire(terms, 'pointermove', { pointerType: 'mouse' });
  current('terms');
  assert.deepEqual(graph.filter(el => el.hasAttribute('data-op-pipe-trace')), [write, terms, merge, share]);
  fire(stage, 'pointerleave');
  assert.equal(host.classList.contains('op-pipe-tracing'), false);

  write.focus();
  assert.equal(fire(write, 'keydown', { key: 'ArrowRight' }).defaultPrevented, true);
  current('terms');
  fire(terms, 'keydown', { key: 'ArrowUp' });
  current('links');
  assert.equal(links.tabIndex, 0);
  fire(links, 'keydown', { key: 'ArrowDown' });
  current('terms');
  fire(terms, 'keydown', { key: 'ArrowRight' });
  current('share');
  assert.equal(document.activeElement, share);
  fire(host, 'focusout', { relatedTarget: document.body });
  assert.equal(host.classList.contains('op-pipe-tracing'), false);
  OffPrint.selection.group('flow').select('write');
  current('write');
  assert.equal(share.tabIndex, 0);
  fire(terms, 'click');
  current('terms');
});
