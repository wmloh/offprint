const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../docform/js/reader-state.js'), 'utf8');
const site = 'file:///book/site.js';
const chapter = 'file:///book/pages/chapter.html';
const review = 'file:///book/review.html';

function indexedDB() {
  const stores = new Map();
  return {
    stores,
    open() {
      const request = {
        result: {
          createObjectStore(name) { stores.set(name, new Map()); },
          transaction() {
            let pending = 0;
            const tx = {
              objectStore(name) {
                const store = stores.get(name);
                return {
                  get(key) {
                    const request = {};
                    pending++;
                    queueMicrotask(() => {
                      pending--;
                      request.onsuccess({ target: { result: structuredClone(store.get(JSON.stringify(key))) } });
                      if (!pending) tx.oncomplete();
                    });
                    return request;
                  },
                  put(value, key) { store.set(JSON.stringify(key), structuredClone(value)); },
                  delete(key) { store.delete(JSON.stringify(key)); }
                };
              }
            };
            return tx;
          }
        }
      };
      queueMicrotask(() => {
        if (!stores.size) request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    }
  };
}

function element(id, markup, parent = null) {
  const attrs = new Map();
  return {
    id, localName: 'div', outerHTML: markup, parentElement: parent, children: [],
    matches: () => true,
    setAttribute(name, value) { attrs.set(name, value); },
    addEventListener() {},
    appendChild(child) { this.children.push(child); return child; }
  };
}

function page(db, pageURL, { isolated = false, edited = false, config = {} } = {}) {
  const body = element('main', '');
  const tabs = body.appendChild(element('', edited ? '<div>new tabs</div>' : '<div>tabs</div>', body));
  const zone = body.appendChild(element('zone', '<div data-df-dropzone></div>', body));
  const doc = {
    body,
    documentElement: { hasAttribute() { return isolated; } },
    querySelector: () => null,
    querySelectorAll: selector => selector.startsWith('[id],') ? [body, tabs, zone] : [],
    createElement: () => element('', ''),
    addEventListener() {}
  };
  const context = vm.createContext({
    DocForm: {}, URL, TextEncoder, indexedDB: db, document: doc, addEventListener() {}, setTimeout, clearTimeout
  });
  vm.runInContext(source, context);
  const state = context.DocForm._readerState;
  state.prepare(doc, pageURL, site, config);
  return { state, tabs, zone };
}

function controller(state, kind, host, initial, options = {}) {
  let value = initial;
  const track = state.watch(kind, host, () => value, next => {
    if (options.accept && !options.accept(next)) return false;
    value = next;
    return true;
  }, options);
  return {
    get: () => value,
    select(next, origin = 'user') { value = next; track(origin); }
  };
}

function registerImport(page, destination, replay = () => true) {
  return page.state.registerImport(destination, page.zone, 'CSV source', replay, file => file.type === 'csv');
}

test('capture identifies transient previews and keeps their committed controller values', async () => {
  const db = indexedDB();
  const live = page(db, chapter);
  const tab = controller(live.state, 'tabs', live.tabs, 'overview', { current: () => true, reassert: true });
  live.state.start();
  tab.select('runs');
  live.state.transient(() => tab.select('preview'));

  const capture = live.state.capture();
  assert.equal(capture.preview, true);
  assert.equal(capture.record.views[0][1].value, 'runs');
  assert.equal(tab.get(), 'preview');

  const rendered = page(db, chapter, { isolated: true });
  const restored = controller(rendered.state, 'tabs', rendered.tabs, 'overview');
  rendered.state.start();
  assert.equal(rendered.state.replay(capture).issues.length, 0);
  assert.equal(restored.get(), 'runs');

  tab.select('preview');
  assert.equal(live.state.capture().preview, false);
  assert.equal(live.state.capture().record.views[0][1].value, 'preview');
  await live.state.clear();
});

test('committed views restore only in the matching export context, after shared data', async () => {
  const db = indexedDB();
  const live = page(db, chapter + '#heading');
  const tab = controller(live.state, 'tabs', live.tabs, 'overview');
  const linked = controller(live.state, 'selection', 'group', null, { order: 8 });
  const remember = registerImport(live, 'shared');
  live.state.start();
  tab.select('runs');
  linked.select('selected');
  live.state.transient(() => { tab.select('hovered'); linked.select('wrong'); });
  remember({ type: 'csv', name: 'runs.csv', text: 'id\nselected' });
  assert.equal(live.state.capture().record.views[0][1].value, 'runs');

  const read = await live.state.read(chapter);
  assert.equal(read.status, 'saved');
  assert.equal(read.record.page, chapter);
  assert.equal(read.record.document, site);
  assert.equal(read.record.imports[0][1].text, undefined);
  assert.equal(read.payloads.get('shared'), 'id\nselected');

  const sibling = page(db, review);
  sibling.state.start();
  const saved = await sibling.state.read(chapter);
  assert.equal(saved.status, 'saved');
  assert.throws(() => sibling.state.replay(saved), /initialized export context/);
  assert.equal((await sibling.state.read(review)).status, 'missing');

  const exported = page(db, chapter, { isolated: true });
  const restored = controller(exported.state, 'tabs', exported.tabs, 'overview');
  let imported = '';
  const restoredLink = controller(exported.state, 'selection', 'group', null, {
    order: 8, accept: next => imported.includes(next)
  });
  registerImport(exported, 'shared', entry => { imported = entry.text; return true; });
  exported.state.start();
  assert.equal(restored.get(), 'overview');
  assert.equal(exported.state.replay(saved).issues.length, 0);
  assert.equal(restored.get(), 'runs');
  assert.equal(restoredLink.get(), 'selected');
  const missingPayload = exported.state.replay({ ...saved, payloads: new Map() });
  assert.equal(missingPayload.issues[0].reason, 'missing');

  const wrongPage = page(db, review, { isolated: true });
  wrongPage.state.start();
  assert.equal(wrongPage.state.replay(saved).status, 'stale');
  await live.state.clear();
  assert.equal((await sibling.state.read(chapter)).status, 'missing');
  assert.equal(db.stores.get('imports').size, 0);
});

test('stale anonymous controls and oversized imports fall back independently, and reset removes the record', async () => {
  const db = indexedDB();
  const live = page(db, chapter);
  const tab = controller(live.state, 'tabs', live.tabs, 'overview');
  const remember = registerImport(live, null);
  live.state.start();
  tab.select('changed');
  remember({ type: 'csv', name: 'large.csv', text: 'x'.repeat(4 * 1024 * 1024 + 1) });
  const saved = await live.state.read(chapter);
  assert.equal(saved.payloads.size, 0);
  assert.equal(saved.record.imports[0][1].missing, 'oversized');

  const exported = page(db, chapter, { isolated: true, edited: true });
  const restored = controller(exported.state, 'tabs', exported.tabs, 'overview');
  let replayed = false;
  registerImport(exported, null, () => { replayed = true; });
  exported.state.start();
  const result = exported.state.replay(saved);
  assert.equal(Array.from(result.issues, issue => issue.reason).join(','), 'oversized,stale');
  assert.equal(restored.get(), 'overview');
  assert.equal(replayed, false);

  live.state.removeImport(live.zone);
  assert.equal((await live.state.read(chapter)).record.imports.length, 0);
  assert.equal(db.stores.get('imports').size, 0);
});

test('a delayed reset cannot delete an import replaced by another reader', async () => {
  const db = indexedDB();
  const first = page(db, chapter);
  const second = page(db, chapter);
  const rememberFirst = registerImport(first, 'shared');
  const rememberSecond = registerImport(second, 'shared');
  first.state.start();
  second.state.start();
  rememberFirst({ type: 'csv', name: 'first.csv', text: 'id\nfirst' });
  await first.state.read(chapter);
  rememberSecond({ type: 'csv', name: 'second.csv', text: 'id\nsecond' });
  await second.state.read(chapter);
  first.state.removeImport(first.zone);
  const saved = await first.state.read(chapter);
  assert.equal(saved.record.imports[0][1].name, 'second.csv');
  assert.equal(saved.payloads.get('shared'), 'id\nsecond');
});

test('reset removes an accepted import from sibling-page replay', async () => {
  const db = indexedDB();
  const live = page(db, chapter);
  const tab = controller(live.state, 'tabs', live.tabs, 'overview');
  const remember = registerImport(live, 'shared');
  live.state.start();
  tab.select('runs');
  remember({ type: 'csv', name: 'runs.csv', text: 'id\nselected' });

  const sibling = page(db, review);
  sibling.state.start();
  await live.state.read(chapter);
  assert.equal((await sibling.state.read(chapter)).payloads.get('shared'), 'id\nselected');

  live.state.removeImport(live.zone);
  await live.state.read(chapter);
  const saved = await sibling.state.read(chapter);
  assert.equal(saved.record.views[0][1].value, 'runs');
  assert.equal(saved.record.imports.length, 0);
  assert.equal(saved.payloads.size, 0);
  assert.equal(db.stores.get('imports').size, 0);
});

test('unavailable storage leaves live committed state available and clear reports failure', async () => {
  const live = page(undefined, chapter);
  const tab = controller(live.state, 'tabs', live.tabs, 'overview');
  live.state.start();
  tab.select('runs');
  assert.equal((await live.state.read(chapter)).status, 'unavailable');
  assert.equal(live.state.capture().record.views[0][1].value, 'runs');
  assert.equal(await live.state.clear(), false);
});
