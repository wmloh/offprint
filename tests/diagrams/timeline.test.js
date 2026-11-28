const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, GROUP, KEY, hover } = require('../support/mounted-chart');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const name of ['core', 'detail', 'diagram', 'timeline']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../offprint/js', name + '.js'), 'utf8'), context);
}
const { scale, ticks, layout } = context.OffPrint._timeline;

test('timeline scales numeric and UTC date domains, including a single point', () => {
  const numeric = scale(-10, 30, 100, 500);
  assert.deepEqual([-10, 0, 30].map(numeric), [100, 200, 500]);
  assert.equal(scale(9, 9, 100, 500)(9), 300);
  assert.equal(scale(-Number.MAX_VALUE, Number.MAX_VALUE, 100, 500)(0), 300);
  assert.deepEqual(Array.from(ticks(-10, 30, false), (tick) => tick.value), [-10, 0, 10, 20, 30]);
  assert.deepEqual(Array.from(ticks(9, 9, false), (tick) => tick.label), ['9']);

  const leap = ['2028-02-28', '2028-02-29', '2028-03-01'];
  const [start, middle, end] = leap.map(Date.parse);
  assert.equal(scale(start, end, 100, 500)(middle), 300);
  assert.deepEqual(Array.from(ticks(start, end, true), (tick) => tick.label), leap);
});

test('timeline lanes pack overlapping spans and point labels and reuse free rows', () => {
  const scene = layout([
    { key: 'during', lane: 'Build', start: 2, end: 2 },
    { key: 'span', lane: 'Build', start: 0, end: 5 },
    { key: 'near', lane: 'Build', start: 3, end: 3 },
    { key: 'later', lane: 'Build', start: 8, end: 8 },
    { key: 'review', lane: 'Review', start: 3, end: 4 }
  ], scale(0, 10, 100, 600));
  assert.deepEqual(Array.from(scene.lanes, (lane) => lane.label), ['Build', 'Review']);
  assert.deepEqual(Array.from(scene.events, (entry) => [entry.event.key, entry.row, entry.span]), [
    ['span', 0, 250], ['during', 1, 0], ['near', 2, 0], ['later', 0, 0], ['review', 0, 50]
  ]);
  assert.equal(scene.lanes[0].bottom, scene.lanes[1].top);
});

test('timelines link authored and mapped events, detail panes, and transactional source replacements', () => {
  const set = (node, attrs) => {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const figure = (id, attrs) => set(new Node('figure'), {
    class: 'op-timeline', id, [GROUP]: 'schedule', ...attrs
  });
  const pane = (attrs) => {
    const el = set(new Node('div'), { class: 'op-detail-pane', ...attrs });
    for (const key of ['draft', 'publish']) el.appendChild(set(new Node('p'), { [KEY]: key }));
    return el;
  };
  const calendar = figure('calendar', {});
  const sourceTimeline = figure('days', { 'data-op-source': 'releases' });
  const list = set(new Node('ol'), { class: 'op-timeline-events' });
  list.append(set(new Node('li'), {
    [KEY]: 'draft', 'data-op-start': '2028-02-28', 'data-op-end': '2028-03-01',
    'data-op-lane': 'Writing', 'data-op-label': 'Draft'
  }), set(new Node('li'), {
    id: 'publish', 'data-op-start': '2028-03-02', 'data-op-label': 'Publish', 'data-op-initial': ''
  }));
  const directPane = pane({});
  const externalPane = pane({ 'data-op-detail-for': 'days' });
  calendar.append(list, directPane);
  const input = (rows) => ({ type: 'csv', text: 'id,from,through,team,title\n' + rows.join('\n') });
  const original = input(['draft,0,2,Writing,Draft', 'publish,3,,Release,Publish']);
  const changes = [];
  sourceTimeline.addEventListener('op:timeline:change', ({ detail }) => changes.push(detail));
  let data;
  let resize;
  const env = setup({
    groups: { schedule: { initial: 'draft' } },
    modules: ['data', 'detail', 'diagram', 'timeline'],
    animation: { ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} } },
    enhance(OP, document, boot) {
      boot.optionLayers = (feature) => feature === 'timeline' ? [{
        mapping: { key: 'id', start: 'from', end: 'through', lane: 'team', label: 'title' }
      }] : [];
      document.body.append(calendar, sourceTimeline, externalPane);
      data = OP.data.define('releases', original);
      document.createElement = (tag) => {
        const element = new Node(tag);
        element.focus = () => { document.activeElement = element; element.dispatchEvent(new Event('focus')); };
        return element;
      };
    }
  });
  const { OffPrint: OP, document, warnings } = env;
  const calendarAPI = OP._timeline.get('calendar');
  const source = OP._timeline.get(sourceTimeline);
  const detail = (el) => OP._detailPane.get(el).snapshot().key;
  const marks = (host) => host.querySelectorAll('.op-timeline-event');
  const keyOf = (button) => button.getAttribute(KEY);

  assert.deepEqual(warnings, []);
  assert.equal(calendarAPI.snapshot().key, 'draft');
  assert.equal(calendarAPI.snapshot().end, Date.parse('2028-03-01'));
  assert.equal(source.snapshot().key, 'draft');
  assert.equal(detail(directPane), 'draft');
  assert.equal(detail(externalPane), 'draft');
  const spanWidth = parseFloat(marks(calendar)[0].querySelector('.op-timeline-span').style.width);
  const axis = calendar.querySelector('.op-timeline-axis');
  const [left, right] = ['x1', 'x2'].map((attr) => Number(axis.getAttribute(attr)));
  assert.ok(Math.abs(spanWidth - (right - left) * 2 / 3) < 0.01);
  const [draft, publish] = marks(calendar);
  assert.equal(draft.tabIndex, 0);
  assert.equal(publish.tabIndex, -1);
  const scroll = sourceTimeline.querySelector('.op-timeline-scroll');
  const stage = sourceTimeline.querySelector('.op-timeline-stage');
  scroll.clientWidth = 1100;
  resize();
  assert.equal(stage.style.width, '1100px');
  assert.equal(sourceTimeline.querySelector('.op-timeline-axis').getAttribute('x2'), String(right + 356));
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const width = parseFloat(stage.style.width);
  const height = parseFloat(stage.style.height);
  stage.getBoundingClientRect = () => rect(20, 30, width, height);
  scroll.getBoundingClientRect = sourceTimeline.getBoundingClientRect = () => rect(20, 30, width, height);
  const mid = 20 + (left + right + 356) / 2;
  const hit = OP._timeline.coords(sourceTimeline, mid, 70);
  assert.equal(hit.value, '1.5');
  assert.equal(hit.lane, 'Writing');
  scroll.getBoundingClientRect = () => rect(mid + 1, 30, 400, height);
  assert.equal(OP._timeline.coords(sourceTimeline, mid, 70), null);
  hover(publish, 'touch');
  assert.equal(calendarAPI.snapshot().key, 'draft');
  hover(publish);
  assert.equal(source.snapshot().key, 'publish');
  assert.equal(detail(directPane), 'publish');
  hover(draft);
  const keydown = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' });
  draft.dispatchEvent(keydown);
  assert.equal(keydown.defaultPrevented, true);
  assert.equal(document.activeElement, publish);
  assert.equal(publish.getAttribute('aria-current'), 'true');
  assert.equal(draft.getAttribute('aria-current'), null);
  assert.equal(detail(directPane), 'publish');
  assert.equal(detail(externalPane), 'publish');
  assert.equal(OP.selection.group('schedule').get(), 'publish');

  const updated = input(['publish,12,,Release,Ship', 'draft,0,10,Writing,Revise']);
  marks(sourceTimeline)[1].focus();
  assert.equal(data.update(updated), true);
  assert.equal(source.snapshot().key, 'publish');
  assert.equal(source.snapshot().index, 0);
  assert.equal(source.snapshot().start, 12);
  assert.equal(source.snapshot().label, 'Ship');
  assert.equal(changes.at(-1).origin, 'source');
  assert.equal(changes.at(-1).previous.start, 3);
  assert.equal(keyOf(document.activeElement), 'publish');
  assert.equal(marks(sourceTimeline)[0].getAttribute('aria-current'), 'true');
  assert.equal(detail(externalPane), 'publish');

  assert.equal(data.update(input(['publish,1,0,Release,Invalid'])), false);
  assert.equal(data.snapshot().revision, 1);
  assert.equal(source.snapshot().start, 12);
  assert.equal(data.update(input(['draft,0,10,Writing,Only draft'])), true);
  assert.equal(source.snapshot().key, 'draft');
  assert.equal(detail(externalPane), 'draft');
  assert.equal(data.reset(), true);
  assert.equal(source.snapshot().key, 'draft');
  assert.equal(source.snapshot().end, 2);
  marks(sourceTimeline)[1].dispatchEvent(new Event('click'));
  assert.equal(OP.selection.group('schedule').get(), 'publish');
  assert.equal(calendarAPI.snapshot().key, 'publish');

  const stop = source.subscribe(() => {
    stop();
    data.update(updated);
    source.select('publish');
  });
  source.select('draft');
  assert.equal(source.snapshot().key, 'publish');
  assert.equal(source.snapshot().index, 0);
  assert.equal(detail(externalPane), 'publish');
});
