const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { load } = require('../support/export-runtime');

test('Reader routes selected pages and encoded fragments through history and focuses followed links', () => {
  const { run } = load()._exportReader;
  const location = new URL('file:///moved/Reader.html#page-2/caf%C3%A9%2Fmore');
  const opened = [];
  const actions = [];
  const targets = new Map();
  const window = new EventTarget();
  const document = new EventTarget();
  const host = { dataset: { initial: 'page-1' }, replaceChildren: frame => opened.push(frame) };
  const bundle = {
    textContent: JSON.stringify({ assets: [], pages: [
      { id: 'page-1', title: 'First', markup: ['first'] },
      { id: 'page-2', title: 'Second', markup: ['second'] }
    ] }), remove() {}
  };
  document.querySelector = selector => ({ '#export-bundle': bundle, '#export-page': host })[selector];
  document.createElement = tag => {
    assert.equal(tag, 'iframe');
    const frame = new EventTarget();
    const content = new EventTarget();
    content.URL = 'about:srcdoc';
    content.querySelector = () => null;
    content.getElementById = id => targets.get(id);
    content.getElementsByName = () => [];
    content.body = { focus: () => actions.push('body focus') };
    frame.contentDocument = content;
    frame.contentWindow = { scrollTo: () => actions.push('top') };
    frame.setAttribute = (name, value) => {
      assert.equal(name, 'sandbox');
      assert.doesNotMatch(value, /allow-scripts/);
    };
    return frame;
  };
  const attrs = new Map();
  targets.set('café/more', {
    tabIndex: -1, hasAttribute: name => attrs.has(name),
    scrollIntoView: () => actions.push('scroll to café'),
    focus: () => actions.push('heading focus')
  });
  function controls() {
    return { mount() {}, follow() {}, scrolled() {}, page() {} };
  }
  const assemble = markup => markup[0];
  const figureSteps = () => target => assert.equal(target, targets.get('café/more'));
  vm.runInNewContext(`(${run})(assemble, figureSteps, null, controls)`,
    { document, window, location, assemble, figureSteps, controls });
  assert.equal(opened[0].srcdoc, 'second');
  opened[0].dispatchEvent(new Event('load'));
  assert.deepEqual(actions, ['scroll to café']);

  const click = new Event('click', { cancelable: true });
  Object.defineProperty(click, 'target', { value: { closest: () => ({ getAttribute: () => '#page-1' }) } });
  opened[0].contentDocument.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(location.hash, '#page-1');
  window.dispatchEvent(new Event('hashchange'));
  opened[1].dispatchEvent(new Event('load'));
  assert.deepEqual(actions.slice(-2), ['top', 'body focus']);

  // Deliver the hash changes emitted by Back and Forward without a browser history stack.
  location.hash = '#page-2/caf%C3%A9%2Fmore';
  window.dispatchEvent(new Event('hashchange'));
  opened[2].dispatchEvent(new Event('load'));
  assert.equal(actions.at(-1), 'scroll to café');
  const same = new Event('click', { cancelable: true });
  Object.defineProperty(same, 'target', { value: { closest: () => ({ getAttribute: () => location.hash }) } });
  document.dispatchEvent(same);
  assert.equal(actions.at(-1), 'heading focus');
  assert.equal(opened.length, 3);
  location.hash = '#page-1';
  window.dispatchEvent(new Event('hashchange'));
  opened[3].dispatchEvent(new Event('load'));
  assert.equal(actions.at(-1), 'top');
});

test('Interactive routing cancels stale startup, disposes frames, and restores session state on return', async () => {
  const { run } = load()._exportReader;
  const location = new URL('file:///moved/Interactive.html#page-1');
  const window = new EventTarget();
  const document = new EventTarget();
  const status = {};
  let current;
  const host = { dataset: { initial: 'page-1' }, replaceChildren(message, frame) {
    assert.equal(message, status);
    if (current) current.detached = true;
    current = frame;
  } };
  const pages = ['page-1', 'page-2'].map(id => ({
    id, title: id, url: 'file:///source/' + id + '.html', markup: ['fallback for ' + id],
    interactive: { url: 'file:///source/' + id + '.html', base: 'file:///source/', markup: ["'nonce-op-export-nonce'"],
      state: { choice: 'exported ' + id } }
  }));
  const bundle = { textContent: JSON.stringify({ version: 1, mode: 'interactive', assets: [], pages, shared: ['code'] }),
    remove() {} };
  document.querySelector = selector => ({ '#export-bundle': bundle, '#export-page': host, '#export-status': status })[selector];
  document.createElement = () => {
    const frame = new EventTarget();
    frame.contentDocument = Object.assign(new EventTarget(), {
      URL: 'about:srcdoc', querySelector: () => null, getElementById: () => null, getElementsByName: () => [],
      body: { focus() {} }
    });
    frame.contentWindow = { scrollTo() {} };
    frame.setAttribute = (name, value) => { frame[name] = value; };
    return frame;
  };
  const startups = [];
  const mounts = [];
  function startInteractive(doc, payload, shared, nonce, saved, signal) {
    assert.equal(doc, current.contentDocument);
    assert.equal(shared[0], 'code');
    assert.ok(current.srcdoc.includes(nonce));
    const frame = current;
    const startup = { saved, signal };
    signal.addEventListener('abort', () => { startup.abortedBeforeDetach = !frame.detached; }, { once: true });
    return new Promise((resolve, reject) => startups.push(Object.assign(startup, { resolve, reject })));
  }
  function controls() {
    return { mount(doc, page) { mounts.push(page); }, follow() {}, scrolled() {}, page() {} };
  }
  vm.runInNewContext(`(${run})(assemble, figureSteps, null, controls, startInteractive, fileKey)`, {
    document, window, location, AbortController, URL, crypto: require('node:crypto').webcrypto,
    assemble: markup => markup[0], figureSteps: () => {}, controls, startInteractive, fileKey: url => url.pathname
  });
  const first = current;
  assert.match(first.sandbox, /allow-scripts/);
  assert.equal(startups.length, 0);
  first.dispatchEvent(new Event('load'));
  assert.equal(startups.length, 1);
  assert.equal(startups[0].saved.choice, 'exported page-1');

  function go(hash) {
    location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
    current.dispatchEvent(new Event('load'));
  }

  go('#page-2');
  assert.equal(startups.length, 2);
  assert.equal(first.detached, true);
  assert.equal(startups[0].signal.aborted, true);
  startups[0].resolve({ capture() { assert.fail('Cancelled page became active'); } });
  const page2State = { record: { choice: 'reader selection' }, payloads: new Map([['shared', 'dataset']]) };
  startups[1].resolve({ capture: () => page2State });
  await new Promise(setImmediate);
  assert.deepEqual(mounts, ['page-2']);
  assert.equal(current.inert, false);

  const click = new Event('click', { cancelable: true });
  const link = { ownerDocument: current.contentDocument, getAttribute(name) {
    return name === 'href' ? 'page-1.html#caf%C3%A9%2Fmore' : null;
  } };
  Object.defineProperty(click, 'target', { value: { closest: () => link } });
  current.contentDocument.dispatchEvent(click);
  assert.equal(location.hash, '#page-1/caf%C3%A9%2Fmore');
  go(location.hash);
  const failed = current;
  assert.equal(startups[1].abortedBeforeDetach, true);
  startups[2].reject(Error('Module could not load.'));
  await new Promise(setImmediate);
  assert.equal(failed.detached, true);
  assert.doesNotMatch(current.sandbox, /allow-scripts/);
  assert.equal(current.srcdoc, 'fallback for page-1');
  assert.match(status.textContent, /Showing the Reader view for page-1/);
  current.dispatchEvent(new Event('load'));
  go('#page-2');
  assert.equal(startups[3].saved, page2State);
  startups[3].resolve({});
  await new Promise(setImmediate);
  assert.deepEqual(mounts, ['page-2', 'page-1', 'page-2']);
  assert.equal(status.hidden, true);
});
