// Internal state for offline export. Normal page startup does not read saved views.
(function (root) {
  'use strict';

  var OP = root.OffPrint;
  var version = 1;
  var viewLimit = 64 * 1024;
  var fileLimit = 4 * 1024 * 1024;
  var pageLimit = 8 * 1024 * 1024;
  var documentLimit = 24 * 1024 * 1024;
  var maxPages = 128;
  var maxImports = 32;
  var storeNames = ['views', 'imports', 'documents'];
  var hosts = new WeakMap();
  var adapters = new Map();
  var liveImports = new Map();
  var pending = new Map();
  var pendingImports = new Map();
  var writeIssue;
  var dbPromise;
  var writes = Promise.resolve();
  var timer;
  var mode;
  var documentKey;
  var pageKey;
  var configuration;
  var started = false;
  var muted = 0;
  var restoring;
  var applying = false;
  var revision = 0;
  var session = Math.random().toString(36).slice(2);

  function canonical(href) {
    var url = new URL(href);
    url.hash = '';
    url.search = '';
    return url.href;
  }

  function stamp(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return text.length + '-' + (hash >>> 0).toString(36);
  }

  function bytes(text) { return new TextEncoder().encode(text).byteLength; }
  function size(value) { return bytes(JSON.stringify(value)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function identify(doc) {
    var selector = [
      '.op-tabs', '[data-op-tabs]', '.op-figure-steps', '.op-card-panel', '.op-detail-pane',
      '.op-pipeline', '[data-op-chart]', '[data-op-chart-playback]', '.op-anim',
      'figure:has(> [data-op-animation-steps], > script[data-op-animation])',
      '[data-op-scenarios]', '[data-op-matrix]', '[data-op-stepper]', '[data-op-results]', '[data-op-dropzone]',
      '.op-tree-diagram',
      '.op-timeline', '.op-sequence', '[data-op-data-view]', '[data-op-source]', 'details', '[data-op-selection-group]'
    ].join(',');
    var counts = new Map();
    var ordinals = new Map();
    var identities = new Map();
    var elements = Array.from(doc.querySelectorAll('[id],' + selector));
    var targets = new Set(Array.from(doc.querySelectorAll('[data-op-dropzone][data-op-target]'), function (host) {
      return host.getAttribute('data-op-target').trim();
    }));
    elements.forEach(function (host) {
      if (host.id) counts.set(host.id, (counts.get(host.id) || 0) + 1);
    });
    elements.forEach(function (host) {
      if (host.id && counts.get(host.id) === 1) {
        identities.set(host, { key: ['id', host.id], stamp: null });
        return;
      }
      // Anchor anonymous siblings to their authored parent path, independently of generated markup.
      var path = [];
      for (var at = host; at.parentElement; at = at.parentElement) {
        var parent = at.parentElement;
        if (parent.id && counts.get(parent.id) === 1) {
          path.unshift(parent.id);
          break;
        }
        if (!ordinals.has(at)) {
          Array.from(parent.children).forEach(function (child, i) { ordinals.set(child, i); });
        }
        path.unshift([at.localName, ordinals.get(at)]);
      }
      identities.set(host, { key: ['path', path], stamp: null });
    });

    // Take signatures before feature setup moves, replaces, or enhances authored markup.
    elements.forEach(function (host) {
      if (!host.matches(selector) && !targets.has(host.id)) {
        // Programmatic components can mount on any authored ID. Their controller validates the semantic domain.
        identities.get(host).stamp = stamp(host.localName + '#' + host.id);
      } else {
        identities.get(host).stamp = stamp(host.outerHTML);
      }
    });
    return identities;
  }

  function prepare(doc, pageURL, siteURL, config) {
    pageKey = canonical(pageURL);
    documentKey = canonical(siteURL || pageURL);
    var interactive = root.OffPrintExportContext?.interactive;
    mode = interactive ? 'session' : doc.documentElement.hasAttribute('data-op-export-replay') ? 'replay' : 'reading';
    configuration = stamp(JSON.stringify(config));
    if (interactive) {
      doc.querySelectorAll('[data-op-export-identity]').forEach(function (host) {
        var index = Number(host.getAttribute('data-op-export-identity'));
        host.removeAttribute('data-op-export-identity');
        var authored = root.OffPrintExportContext.identities[index];
        if (authored) hosts.set(host, authored);
      });
    } else identify(doc).forEach(function (authored, host) { hosts.set(host, authored); });
    doc.querySelectorAll('details').forEach(function (host) {
      var track = watch('details', host, function () { return host.isConnected ? host.open : undefined; }, function (open) {
        if (!host.isConnected || typeof open !== 'boolean') return false;
        host.open = open;
        return true;
      });
      host.addEventListener('toggle', function () {
        if (host.isConnected) track('user');
      });
    });
  }

  function identity(kind, host) {
    var authored = typeof host === 'string' ? { key: ['name', host], stamp: '' } : hosts.get(host);
    return authored && { key: JSON.stringify([kind, authored.key]), stamp: authored.stamp };
  }

  function transient(fn) {
    muted++;
    try { return fn(); } finally { muted--; }
  }

  function watch(kind, host, snapshot, apply, options) {
    var id = identity(kind, host);
    if (!id) return function () {};
    options = options || {};
    var entry = { id: id, snapshot: snapshot, apply: apply, order: options.order || 0,
      current: options.current, revision: options.revision };
    if (started) entry.value = snapshot();
    adapters.set(id.key, entry);
    return function (origin) {
      if (!started || mode === 'replay') return;
      if (muted || origin === 'hover') {
        entry.preview = true;
        return;
      }
      if (['init', 'storage', 'source', 'drop'].includes(origin)) return;
      var value = snapshot();
      entry.preview = false;
      if (value === undefined || (same(value, entry.value) && (!options.reassert || entry.touched || origin === 'group'))) return;
      entry.touched = true;
      entry.value = value;
      if (mode === 'session') return;
      pending.set(id.key, savedView(entry, value));
      schedule();
    };
  }

  function savedView(entry, value) {
    var revision = entry.revision?.();
    return revision == null ? { stamp: entry.id.stamp, value: value } :
      { stamp: entry.id.stamp, value: value, revision: revision };
  }

  function keyed(kind, host, controller, options) {
    return watch(kind, host, function () { return controller.snapshot()?.key ?? null; }, function (key) {
      return key === null ? (controller.snapshot()?.key == null || controller.reset()) : controller.select(key);
    }, Object.assign({ reassert: true }, options));
  }

  function start() {
    adapters.forEach(function (entry) { if (entry.snapshot) entry.value = entry.snapshot(); });
    started = true;
    if (mode !== 'reading') return;
    root.addEventListener('pagehide', flush);
    root.document.addEventListener('visibilitychange', function () {
      if (root.document.visibilityState === 'hidden') flush();
    });
    // Pages without reading controls get the export entry at the end of their content.
    if (OP._boot?.mountExport && !OP._boot.exportMounted) {
      var parent = root.document.querySelector('main, .op-page') || root.document.body;
      var controls = parent.appendChild(root.document.createElement('div'));
      controls.setAttribute('data-op-reader-state-control', '');
      OP._boot.mountExport(controls);
    }
  }

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var request = root.indexedDB.open('offprint-reader-views', 1);
      request.onupgradeneeded = function () {
        storeNames.forEach(function (name) { request.result.createObjectStore(name); });
      };
      request.onblocked = function () { reject(new Error('Storage is blocked.')); };
      request.onerror = function () { reject(request.error); };
      request.onsuccess = function () {
        var database = request.result;
        database.onversionchange = function () { database.close(); dbPromise = null; };
        resolve(database);
      };
    }).catch(function (error) { dbPromise = null; throw error; });
    return dbPromise;
  }

  async function transaction(mode, run) {
    var database = await db();
    return new Promise(function (resolve, reject) {
      var tx = database.transaction(storeNames, mode);
      var result;
      tx.oncomplete = function () { resolve(result); };
      tx.onabort = function () { reject(tx.error || new Error('Storage transaction failed.')); };
      run(tx, function (value) { result = value; });
    });
  }

  function get(store, key, fn) {
    store.get(key).onsuccess = function (event) { fn(event.target.result); };
  }

  function getPage(tx, page, fn) {
    get(tx.objectStore('views'), [documentKey, page], fn);
  }

  function getDocument(tx, fn) {
    get(tx.objectStore('documents'), documentKey, function (meta) {
      fn(meta || { pages: [] });
    });
  }

  function record() {
    return { version: version, document: documentKey, page: pageKey, configuration: configuration, views: [], imports: [] };
  }

  function currentFormat(saved) {
    function entries(list) {
      return Array.isArray(list) && list.every(function (item) {
        return Array.isArray(item) && typeof item[0] === 'string' && item[1] && typeof item[1] === 'object';
      });
    }
    return saved && saved.version === version && saved.document === documentKey && entries(saved.views) && entries(saved.imports);
  }

  function targetStamp(host) { return hosts.get(host)?.stamp || null; }

  function registerImport(destination, host, signature, replay, canReplay) {
    var id = identity('import', host);
    if (!id) return;
    var key = destination || id.key;
    if (mode === 'replay' || mode === 'session') {
      adapters.set('import:' + id.key, { id: id, host: host, standalone: !destination,
        destination: key, signature: signature, apply: replay, accepts: canReplay });
    }
    if (mode === 'reading' || mode === 'session') {
      return function (file) {
        if (muted) return;
        var item = {
          host: id.key, stamp: id.stamp, target: signature, revision: [Date.now(), session, ++revision],
          bytes: bytes(file.text), name: file.name, type: file.type
        };
        if (!destination) discardFileView(host);
        liveImports.set(key, { item: item, text: file.text, host: host, standalone: !destination });
        if (mode === 'session') return;
        pendingImports.set(key, item.bytes > fileLimit ? { item: Object.assign({}, item, { missing: 'oversized' }) } :
          { item: item, text: file.text });
        schedule();
      };
    }
  }

  function discardFileView(host, unmount) {
    ['data-rows', 'data-tree'].forEach(function (kind) {
      var id = identity(kind, host);
      if (!id) return;
      if (mode === 'reading') pending.set(id.key, null);
      if (unmount) adapters.delete(id.key);
    });
  }

  function removeImport(host) {
    if (mode !== 'reading' && mode !== 'session') return;
    liveImports.forEach(function (value, key) {
      if (value.host !== host) return;
      liveImports.delete(key);
      if (value.standalone) discardFileView(host, true);
      if (mode === 'reading') {
        pendingImports.set(key, { remove: value.item.revision });
        schedule();
      }
    });
  }

  function schedule() {
    if (mode !== 'reading' || timer !== undefined) return;
    db().catch(function () {});
    timer = root.setTimeout(flush, 100);
  }

  function flush() {
    if (mode !== 'reading') return writes;
    root.clearTimeout(timer);
    timer = undefined;
    if (!pending.size && !pendingImports.size) return writes;
    var changes = new Map(pending);
    var files = new Map(pendingImports);
    pending.clear();
    pendingImports.clear();
    writes = writes.then(function () { return save(changes, files); }).catch(function (error) {
      writeIssue = error?.name === 'QuotaExceededError' ? 'oversized' : 'unavailable';
    });
    return writes;
  }

  function save(changes, files) {
    return transaction('readwrite', function (tx) {
      getPage(tx, pageKey, function (previous) {
        getDocument(tx, function (meta) {
          var index = meta.pages.find(function (entry) { return entry.page === pageKey; });
          if (!index && meta.pages.length >= maxPages) {
            writeIssue = 'oversized';
            return;
          }
          var fileStore = tx.objectStore('imports');
          var prior = currentFormat(previous) ? previous : record();
          var matches = prior.configuration === configuration;
          var next = matches ? Object.assign({}, prior) : record();
          var views = new Map(next.views);
          var imports = new Map(next.imports);
          if (!matches || !currentFormat(previous)) {
            (index?.imports || []).forEach(function (key) { fileStore.delete([documentKey, pageKey, key]); });
          }
          changes.forEach(function (value, key) {
            if (value) views.set(key, value);
            else views.delete(key);
          });
          next.views = Array.from(views);
          if (size(next.views) > viewLimit) {
            next.views = [];
            next.incomplete = 'oversized';
          }
          var used = Array.from(imports.values()).reduce(function (sum, item) { return sum + (item.missing ? 0 : item.bytes); }, 0);
          var elsewhere = meta.pages.reduce(function (sum, entry) { return sum + (entry === index ? 0 : entry.bytes); }, 0);
          files.forEach(function (value, key) {
            var former = imports.get(key);
            if (value.remove && former && !same(former.revision, value.remove)) return;
            if (former && !former.missing) used -= former.bytes;
            var fileKey = [documentKey, pageKey, key];
            if (value.remove) {
              imports.delete(key);
              fileStore.delete(fileKey);
              return;
            }
            var item = value.item;
            if ((!former && imports.size >= maxImports) || size([key, item]) > 4096) {
              next.incomplete = 'oversized';
              imports.delete(key);
              fileStore.delete(fileKey);
              return;
            }
            if (item.missing || used + item.bytes > pageLimit || elsewhere + used + item.bytes > documentLimit) {
              imports.set(key, Object.assign({}, item, { missing: 'oversized' }));
              fileStore.delete(fileKey);
              return;
            }
            imports.set(key, item);
            used += item.bytes;
            fileStore.put(value.text, fileKey);
          });
          next.imports = Array.from(imports);
          var documents = tx.objectStore('documents');
          var viewStore = tx.objectStore('views');
          if (!next.views.length && !next.imports.length && !next.incomplete) {
            viewStore.delete([documentKey, pageKey]);
            meta.pages = meta.pages.filter(function (entry) { return entry !== index; });
            if (meta.pages.length) documents.put(meta, documentKey);
            else documents.delete(documentKey);
            return;
          }
          if (!index) {
            index = { page: pageKey };
            meta.pages.push(index);
          }
          index.bytes = used;
          index.imports = Array.from(imports.keys());
          documents.put(meta, documentKey);
          viewStore.put(next, [documentKey, pageKey]);
        });
      });
    });
  }

  async function read(href) {
    var page = canonical(new URL(href, pageKey).href);
    await flush();
    try {
      return await transaction('readonly', function (tx, result) {
        getPage(tx, page, function (saved) {
          var fault = page === pageKey && writeIssue;
          if (fault || !currentFormat(saved) || saved.page !== page) {
            result({ status: fault || (saved ? 'stale' : 'missing') });
            return;
          }
          if (size(saved.views) > viewLimit) {
            result({ status: 'oversized' });
            return;
          }
          var payloads = new Map();
          var response = { status: saved.incomplete || 'saved', record: saved, payloads: payloads };
          result(response);
          saved.imports.forEach(function ([key, item]) {
            if (item.missing || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > fileLimit) return;
            get(tx.objectStore('imports'), [documentKey, page, key], function (text) {
              if (typeof text === 'string' && bytes(text) === item.bytes) payloads.set(key, text);
            });
          });
        });
      });
    } catch (error) { return { status: 'unavailable' }; }
  }

  function capture() {
    var saved = record();
    var payloads = new Map();
    adapters.forEach(function (entry, key) {
      if (!entry.snapshot) return;
      var value = !entry.preview && entry.current && entry.current() ? entry.snapshot() : entry.value;
      if (value === undefined) return;
      saved.views.push([key, savedView(entry, value)]);
    });
    liveImports.forEach(function ({ item, text }, key) {
      saved.imports.push([key, item]);
      payloads.set(key, text);
    });
    var preview = Array.from(adapters.values()).some(function (entry) {
      return entry.preview && !same(entry.value, entry.snapshot());
    });
    return { status: 'live', record: saved, payloads: payloads, preview: preview };
  }

  function replay(saved) {
    if (!['replay', 'session'].includes(mode) || !started) throw new Error('Reader state replay needs an initialized export context.');
    if (!saved.record) return { status: saved.status, issues: [] };
    var record = saved.record;
    if (!currentFormat(record) || record.page !== pageKey || record.configuration !== configuration) {
      return { status: 'stale', issues: [] };
    }
    applying = true;
    try { return applyRecord(saved, record); }
    finally { applying = false; }
  }

  function applyRecord(saved, record) {
    var issues = [];
    function attempt(kind, key, run) {
      try {
        if (run() !== false) return;
      } catch (error) { /* The controller retains its valid state on rejection. */ }
      issues.push({ kind: kind, key: key, reason: 'stale' });
    }
    record.imports.forEach(function ([key, item]) {
      var entry = adapters.get('import:' + item.host);
      var text = saved.payloads?.get(key);
      if (item.missing || typeof text !== 'string') {
        issues.push({ kind: 'import', key: key, reason: item.missing || 'missing' });
        return;
      }
      attempt('import', key, function () {
        var applied = !!entry && entry.destination === key && entry.id.stamp === item.stamp &&
          entry.signature === item.target && entry.accepts(item, text) &&
          bytes(text) === item.bytes &&
          entry.apply({ name: item.name, type: item.type, text: text });
        if (applied && mode === 'session') {
          liveImports.set(key, { item: item, text: text, host: entry.host, standalone: entry.standalone });
        }
        return applied;
      });
    });
    restoring = new Set(record.views.map(function ([key]) { return key; }));
    try {
      record.views.slice().sort(function ([a], [b]) {
        return (adapters.get(a)?.order || 0) - (adapters.get(b)?.order || 0);
      }).forEach(function ([key, item]) {
        attempt('view', key, function () {
          var entry = adapters.get(key);
          return !!entry && entry.id.stamp === item.stamp &&
            (item.revision === undefined || item.revision === entry.revision?.()) && entry.apply(item.value);
        });
      });
    } finally { restoring = undefined; }
    if (mode === 'session') adapters.forEach(function (entry) {
      if (entry.snapshot) entry.value = entry.snapshot();
      entry.preview = false;
    });
    return { status: saved.status, issues: issues };
  }

  function clear() {
    if (mode !== 'reading') return Promise.resolve(false);
    root.clearTimeout(timer);
    timer = undefined;
    pending.clear();
    pendingImports.clear();
    adapters.forEach(function (entry) { entry.touched = false; });
    writes = writes.then(function () {
      return transaction('readwrite', function (tx) {
        getDocument(tx, function (meta) {
          meta.pages.forEach(function (entry) {
            tx.objectStore('views').delete([documentKey, entry.page]);
            entry.imports.forEach(function (key) { tx.objectStore('imports').delete([documentKey, entry.page, key]); });
          });
          tx.objectStore('documents').delete(documentKey);
        });
      });
    }).then(function () {
      writeIssue = undefined;
      return true;
    }, function () { return false; });
    return writes;
  }

  OP._readerState = {
    identify: identify, prepare: prepare, start: start, watch: watch, keyed: keyed, transient: transient,
    preserveOrigin: function (fn) { return muted ? function () { return transient(fn); } : fn; },
    isolated: function () { return mode === 'replay' || mode === 'session'; },
    restoring: function (kind, host) { return restoring?.has(identity(kind, host)?.key); },
    // True while a saved view is applied, so features can show it in place instead of animating to it.
    applying: function () { return applying; },
    registerImport: registerImport, removeImport: removeImport, targetStamp: targetStamp, stamp: stamp,
    capture: capture, read: read, replay: replay, clear: clear,
    enabled: function () { return mode === 'reading'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
