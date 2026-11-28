// Synchronous entry for offline pages. Feature scripts are loaded after the author scripts have registered.
(function (root, doc) {
  'use strict';

  if (root.OffPrint) return;

  var entry = doc.currentScript;
  var exportContext = doc.documentElement.hasAttribute('data-op-export-replay') && root.OffPrintExportContext;
  var replaying = !!exportContext;
  var pageURL = exportContext && exportContext.pageURL || root.location.href;
  var library = new URL('.', exportContext?.entryURL || entry.src);
  var siteScript = doc.querySelector('script[data-op-site]');
  var siteURL = exportContext && exportContext.siteURL || siteScript && siteScript.src || pageURL;
  var authoredTheme = doc.documentElement.getAttribute('data-op-theme');
  var appliedTheme;

  // Declaration order is startup order. Shared files still load just once.
  var catalog = {
    tokens: { css: ['tokens'] },
    base: { needs: ['tokens'], css: ['base', 'text', 'sections', 'buttons'] },
    tags: { needs: ['base'], css: ['blocks'] },
    callouts: { needs: ['base'], css: ['blocks'] },
    blocks: { needs: ['tags', 'callouts'] },
    'concept-tables': { needs: ['base'] },
    theme: { needs: ['tokens'], css: ['theme'], script: 'theme', api: '_theme' },
    roles: { needs: ['base'], css: ['roles'], script: 'roles', api: '_roles' },
    math: { needs: ['base'], css: ['vendor/katex/katex.min.css', 'math'],
      vendor: ['vendor/katex/katex.min.js', 'katex'], script: 'math', api: '_math' },
    tooltips: { needs: ['base'], css: ['tooltip'], script: 'tooltip', api: '_tooltips' },
    selection: { needs: ['base'], css: ['highlight'], script: 'highlight', api: 'selection' },
    animation: { needs: ['base'], css: ['anim'], script: 'anim', api: '_animation' },
    dropdowns: { needs: ['base'], css: ['dropdowns'], script: 'dropdowns', api: '_dropdowns' },
    choices: { needs: ['base'], css: ['choices'], script: 'choices', api: '_choices' },
    parameters: { needs: ['base', 'dropdowns', 'choices'], css: ['params'], script: 'params', api: '_parameters' },
    code: { needs: ['base'], css: ['code'], script: 'code', api: '_code' },
    'editable-text': { needs: ['base'], css: ['editable-text'], script: 'editable-text', api: '_editableText' },
    tree: { needs: ['base'], css: ['tree'], script: 'tree', api: '_tree' },
    markdown: { needs: ['base'], css: ['markdown'], script: 'markdown', api: '_markdown' },
    data: { vendor: ['vendor/js-yaml/js-yaml.min.js', 'jsyaml'], script: 'data', api: 'data' },
    'data-view': { needs: ['base', 'data'], css: ['data'] },
    chart: { needs: ['base', 'choices'], css: ['chart'], script: 'chart', api: '_chart' },
    dropzone: { needs: ['base', 'data'], css: ['dropzone', 'data'], script: 'dropzone', api: '_dropzone' },
    'chart-playback': { needs: ['chart'], css: ['chart-playback'], script: 'chart-playback', api: '_chartPlayback' },
    // Chart add-ons register the chart types they list with OffPrint.chart.addon as their script loads.
    'chart-intervals': { needs: ['chart'], css: ['chart-intervals'], script: 'chart-intervals', chartTypes: ['interval'] },
    'chart-histogram': { needs: ['chart'], css: ['chart-histogram'], script: 'chart-histogram', chartTypes: ['histogram'] },
    'chart-heatmap': { needs: ['chart'], css: ['chart-heatmap'], script: 'chart-heatmap', chartTypes: ['heatmap'] },
    'chart-combo': { needs: ['chart'], css: ['chart-combo'], script: 'chart-combo', chartTypes: ['combo'] },
    // Layer add-ons draw over every chart type from the spec field named after the layer, in declaration order.
    'chart-fits': { needs: ['chart'], css: ['chart-fits'], script: 'chart-fits', chartLayers: ['fits', 'residuals'] },
    'chart-annotations': { needs: ['chart'], css: ['chart-annotations'], script: 'chart-annotations', chartLayers: ['annotations'] },
    results: { needs: ['base', 'choices'], css: ['results'], script: 'results', api: '_results' },
    matrix: { needs: ['base', 'data', 'choices'], css: ['matrix'], script: 'matrix', api: '_matrix' },
    scenarios: { needs: ['chart'], css: ['scenarios'], script: 'scenarios' },
    tabs: { needs: ['base'], css: ['tabs'], script: 'tabs', api: '_tabs' },
    'detail-pane': { needs: ['base'], css: ['detail'], script: 'detail', api: '_detailPane' },
    cards: { needs: ['detail-pane'], css: ['steps'], script: 'steps', api: '_cards' },
    quiz: { needs: ['base', 'choices', 'dropdowns', 'chart', 'cards'], css: ['quiz'], script: 'quiz', api: 'quiz' },
    'figure-steps': { needs: ['detail-pane'], css: ['steps'], script: 'steps', module: 'figure-steps' },
    stepper: { needs: ['base'], css: ['stepper'], script: 'stepper' },
    'diagram-core': { needs: ['detail-pane'], script: 'diagram', api: '_diagram' },
    pipeline: { needs: ['diagram-core'], css: ['pipeline'], script: 'pipeline', api: '_pipeline' },
    timeline: { needs: ['diagram-core'], css: ['timeline'], script: 'timeline', api: '_timeline' },
    sequence: { needs: ['diagram-core'], css: ['sequence'], script: 'sequence-diagram', api: '_sequenceDiagram' },
    'tree-diagram': { needs: ['diagram-core'], css: ['tree-diagram'], script: 'tree-diagram', api: '_treeDiagram' },
    'split-views': { needs: ['base'], css: ['reveal'], script: 'reveal', module: 'split-views' },
    reveals: { needs: ['base'], css: ['reveal'], script: 'reveal', api: '_reveals' },
    'peek-bubbles': { needs: ['base'], css: ['blocks', 'bubble'], script: 'bubble', api: '_peekBubbles' },
    search: { needs: ['base'], css: ['search'], script: 'search', api: '_search' },
    glossary: { needs: ['tooltips'], css: ['glossary'], script: 'glossary', api: '_glossary' },
    references: { needs: ['base'], css: ['refs'], script: 'refs', api: '_references' },
    citations: { needs: ['tooltips'], css: ['refs'], script: 'refs', api: '_citations' },
    navigation: { needs: ['base'], css: ['nav'], script: 'nav', api: '_navigation' },
    sidenotes: { needs: ['base'], css: ['notes'], script: 'notes', api: '_sidenotes' },
    sections: { needs: ['base'], script: 'sections', api: '_sections' },
    controls: { needs: ['base'], css: ['controls'], script: 'controls', api: '_controls' },
    zoom: { needs: ['base'], css: ['zoom'], script: 'zoom', api: '_zoom' },
    'zoom-tools': { needs: ['zoom'], css: ['zoomtools'], script: 'zoomtools', api: '_zoomTools' }
  };
  var reading = ['base', 'blocks', 'theme', 'roles', 'navigation', 'controls', 'tooltips',
    'references', 'citations', 'sidenotes', 'search', 'sections'];
  var readingStyles = new Set(['tokens', 'base', 'text', 'sections', 'buttons', 'blocks', 'theme', 'roles', 'tooltip', 'search',
    'refs', 'nav', 'notes', 'controls']);
  var moduleFeatures = {
    tooltip: 'tooltips', params: 'parameters',
    reveal: 'reveals', bubble: 'peek-bubbles', refs: 'references', nav: 'navigation', notes: 'sidenotes'
  };
  var setup = [];
  var ready = [];
  var diagnostics = [];
  var reported = new Map();
  var parsed = new WeakMap();
  var assets = new Map();
  var active = new Set();
  var failed = new Set();
  var after = [];
  var setupClosed = false;
  var readyComplete = false;
  var readyScheduled = false;
  var combinedStyles = false;

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function merge() {
    var out = Object.create(null);
    Array.prototype.forEach.call(arguments, function (layer) {
      if (!object(layer)) return;
      Object.keys(layer).forEach(function (key) {
        var value = layer[key];
        out[key] = object(value) ? merge(out[key], value) : Array.isArray(value) ? value.map(copy) : value;
      });
    });
    return out;
  }

  function copy(value) {
    return Array.isArray(value) ? value.map(copy) : object(value) ? merge(value) : value;
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function report(code, feature, target, message, correction, input) {
    var key = JSON.stringify([code, feature, input]);
    if (!reported.has(key)) reported.set(key, new Set());
    var targets = reported.get(key);
    if (targets.has(target)) return;
    targets.add(target);
    var detail = Object.freeze({ code: code, feature: feature, target: target, message: message, correction: correction });
    diagnostics.push(detail);
    root.console.warn('[offprint] ' + message + ' ' + correction, target);
    doc.dispatchEvent(new root.CustomEvent('op:diagnostic', { detail: detail }));
  }

  function run(name, fn) {
    try {
      fn(OP);
    } catch (error) {
      report(name + '-failed', null, null, 'OffPrint.' + name + ' callback failed: ' + String(error),
        'Fix the callback in the author script.', String(fn));
    }
  }

  var OP = root.OffPrint = {
    _page: pageURL,
    _site: null,
    diagnostics: { list: function () { return diagnostics.slice(); } },
    setup: function (fn) {
      if (setupClosed || typeof fn !== 'function') {
        report('setup-registration', null, null, 'OffPrint.setup could not register the callback.',
          'Pass a function before startup from an ordered classic script.');
        return false;
      }
      setup.push(fn);
      return true;
    },
    ready: function (fn) {
      if (typeof fn !== 'function') {
        report('ready-registration', null, null, 'OffPrint.ready needs a callback.', 'Pass a function.');
        return false;
      }
      ready.push(fn);
      if (readyComplete && !readyScheduled) {
        readyScheduled = true;
        root.queueMicrotask(function () {
          readyScheduled = false;
          ready.splice(0).forEach(function (callback) { run('ready', callback); });
        });
      }
      return true;
    }
  };

  function pageConfig() {
    var nodes = doc.querySelectorAll('script[data-op-page]');
    if (nodes.length > 1) report('page-config-count', null, nodes[1], 'Multiple page configuration blocks.',
      'Keep a single script[data-op-page].');
    var node = nodes[0];
    if (!node) return {};
    if (!parsed.has(node)) {
      var value = {};
      try {
        if (node.type !== 'application/json') throw new Error('Expected type="application/json".');
        value = JSON.parse(node.textContent);
        if (!object(value)) throw new Error('Expected a JSON object.');
      } catch (error) {
        report('page-config', null, node, 'Invalid page configuration: ' + error.message,
          'Use a JSON object in script[type="application/json"][data-op-page].');
        value = {};
      }
      parsed.set(node, value);
    }
    return parsed.get(node);
  }

  function profile(value, target, notify) {
    if (value === 'none' || value === 'reading') return value;
    if (value !== undefined) notify('profile', null, target, 'Unknown OffPrint profile.',
      'Choose "reading" or "none".', value);
  }

  function configuration() {
    var site = siteScript && object(root.OffPrintSite) ? root.OffPrintSite : {};
    var config = resolveConfiguration(site, pageConfig(), entry.getAttribute('data-op-profile') ?? undefined, report);
    if (exportContext?.interactive) config.enabled = new Set(exportContext.features);
    return config;
  }

  function resolveConfiguration(site, page, requestedProfile, notify) {
    var siteProfile = profile(site.profile, siteScript, notify);
    var entryProfile = profile(requestedProfile, entry, notify);
    var pageProfile = profile(page.profile, 'page', notify);
    var selected = new Map();
    var wanted = new Map();
    if ((pageProfile || entryProfile || siteProfile || 'reading') === 'reading') {
      reading.forEach(function (id) { wanted.set(id, true); });
    }
    function applyFeatures(features, target) {
      if (features === undefined) return;
      if (!object(features)) {
        notify('features', null, target, 'Feature choices must be an object.', 'Map feature names to true or false.');
        return;
      }
      Object.keys(features).forEach(function (id) {
        if (!own(catalog, id) || typeof features[id] !== 'boolean') {
          notify('feature-choice', id, target, 'Invalid choice for feature "' + id + '".',
            'Use a supported feature name and a boolean value.', features[id]);
        } else {
          wanted.set(id, features[id]);
        }
      });
    }
    if (pageProfile !== 'none') applyFeatures(site.features, siteScript);
    applyFeatures(page.features, 'page');

    function include(id) {
      if (selected.has(id)) return selected.get(id);
      if (wanted.get(id) === false) return false;
      var missing = (catalog[id].needs || []).find(function (dep) { return !include(dep); });
      if (missing && notify === report) dependency(id, missing);
      selected.set(id, !missing);
      return !missing;
    }
    wanted.forEach(function (on, id) { if (on) include(id); });
    // A failed root can have visited prerequisites. Keep only the closure of successful roots.
    var enabled = new Set();
    function add(id) {
      if (enabled.has(id)) return;
      enabled.add(id);
      (catalog[id].needs || []).forEach(add);
    }
    wanted.forEach(function (on, id) { if (on && selected.get(id)) add(id); });
    return { site: site, page: page, options: merge(site.options, page.options), enabled: enabled };
  }

  function dependency(id, missing) {
    report('dependency', id, missing, 'Feature "' + id + '" requires "' + missing + '".',
      'Enable "' + missing + '" and restore its assets if they are missing.');
  }

  function themeMode(config) {
    for (var layer of [config.page, config.site]) {
      var mode = layer.options && layer.options.theme && layer.options.theme.mode;
      if (mode === undefined) continue;
      if (mode === null || mode === 'light' || mode === 'dark') return mode;
      report('theme-mode', 'theme', 'options.theme.mode', 'Unknown initial theme.',
        'Choose "light", "dark", or null for the system preference.', mode);
    }
    if (authoredTheme === 'light' || authoredTheme === 'dark') return authoredTheme;
  }

  function earlyTheme(config) {
    if (!config.enabled.has('theme')) {
      if (appliedTheme && doc.documentElement.getAttribute('data-op-theme') === appliedTheme) {
        if (authoredTheme === null) doc.documentElement.removeAttribute('data-op-theme');
        else doc.documentElement.setAttribute('data-op-theme', authoredTheme);
      }
      appliedTheme = undefined;
      return;
    }
    var stored;
    var dark = false;
    try { if (!replaying) stored = root.localStorage.getItem('offprint-theme'); } catch (error) {}
    try { dark = root.matchMedia('(prefers-color-scheme: dark)').matches; } catch (error) {}
    var defaultMode = themeMode(config);
    appliedTheme = stored === 'light' || stored === 'dark' ? stored : defaultMode || (dark ? 'dark' : 'light');
    doc.documentElement.setAttribute('data-op-theme', appliedTheme);
  }

  function keyOf(href) {
    var url = new URL(href);
    url.hash = '';
    return url.href;
  }

  function seedAssets() {
    if (exportContext?.interactive) {
      combinedStyles = exportContext.combinedStyles;
      return;
    }
    doc.querySelectorAll('link[rel~="stylesheet"][href]:not([disabled]), script[src]:not([type="module"])')
      .forEach(function (node) {
        var key = keyOf(node.href || node.src);
        if (node.href && key === keyOf(new URL('offprint.css', library).href)) combinedStyles = true;
        assets.set(key, Promise.resolve(true));
      });
  }

  function load(url, css, exportUI) {
    var key = keyOf(url);
    if (!assets.has(key)) {
      if (exportContext?.interactive) {
        assets.set(key, Promise.resolve().then(function () { return exportContext.loadModule(key, css); }));
        return assets.get(key);
      }
      assets.set(key, new Promise(function (resolve) {
        var el = doc.createElement(css ? 'link' : 'script');
        el.onload = function () { resolve(true); };
        el.onerror = function () {
          if (exportUI) {
            assets.delete(key);
            el.remove();
          }
          resolve(false);
        };
        el.setAttribute('data-op-runtime-asset', '');
        if (exportUI) el.setAttribute('data-op-export-control', '');
        if (css) {
          el.rel = 'stylesheet';
          el.href = url;
        } else {
          el.async = false;
          if (replaying) el.nonce = entry.nonce;
          el.src = url;
        }
        doc.head.appendChild(el);
      }));
    }
    return assets.get(key);
  }

  function loadExport(path, css) {
    return load(new URL(path, library).href, css, true);
  }

  function mountExport(parent, iconOnly) {
    if (replaying) return;
    var button = doc.createElement('button');
    button.type = 'button';
    button.className = iconOnly ? 'op-controls-btn' : 'op-button';
    button.setAttribute('data-op-export-control', '');
    button.setAttribute('aria-haspopup', 'dialog');
    if (iconOnly) {
      button.setAttribute('aria-label', 'Export');
      button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" ' +
        'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M8 2v8m-3-3 3 3 3-3M2.5 10v3.5h11V10"/></svg>';
    } else button.textContent = 'Export';
    button.addEventListener('click', async function () {
      if (button.hasAttribute('aria-busy')) return;
      button.setAttribute('aria-busy', 'true');
      try {
        var loaded = await Promise.all([loadExport('js/export-dialog.js'), loadExport('css/export-dialog.css', true)]);
        if (!loaded.every(Boolean) || !OP._exportDialog) throw Error('The OffPrint export dialog could not load.');
        OP._exportDialog.open(button);
      } catch (error) {
        root.alert(error.message + ' Check the local OffPrint files and try again.');
      } finally {
        button.removeAttribute('aria-busy');
      }
    });
    parent.appendChild(button);
    boot.exportMounted = true;
    return button;
  }

  function assetFailure(feature, url) {
    report('asset', feature, url, 'Could not load a required asset for "' + feature + '".',
      'Restore the local file or correct its path.');
  }

  async function featureAssets(id) {
    var item = catalog[id];
    for (var style of item.css || []) {
      if (combinedStyles && readingStyles.has(style)) continue;
      var href = new URL(stylePath(style), library).href;
      if (!await load(href, true)) {
        assetFailure(id, href);
        return false;
      }
    }
    if (item.vendor) {
      var vendor = new URL(item.vendor[0], library).href;
      if (!await load(vendor, false) || !root[item.vendor[1]]) {
        assetFailure(id, vendor);
        return false;
      }
    }
    if (item.script) {
      var script = new URL('js/' + item.script + '.js', library).href;
      var loaded = await load(script, false);
      var present = item.chartTypes || item.chartLayers ? !!OP.chart && OP.chart.addons().indexOf(id) >= 0 :
        item.api ? !!OP[item.api] : boot.registered(item.module || item.script);
      if (!loaded || !present) {
        assetFailure(id, script);
        return false;
      }
    }
    return true;
  }

  function stylePath(style) {
    return style.endsWith('.css') ? style : 'css/' + style + '.css';
  }

  function exportPlan(site, page, requestedProfile, combined) {
    var enabled = resolveConfiguration(site, page, requestedProfile ?? undefined, function () {}).enabled;
    var shell = new Set(['navigation', 'controls', 'theme', 'search']);
    var features = Object.keys(catalog).filter(function (id) { return enabled.has(id) && !shell.has(id); });
    var scripts = new Set(['offprint.js', 'js/core.js', 'js/reader-state.js']);
    var styles = new Set();
    features.forEach(function (id) {
      var item = catalog[id];
      (item.css || []).forEach(function (style) {
        if (!combined || !readingStyles.has(style)) styles.add(stylePath(style));
      });
      if (item.vendor) scripts.add(item.vendor[0]);
      if (item.script) scripts.add('js/' + item.script + '.js');
    });
    return { features: features, scripts: Array.from(scripts), styles: Array.from(styles) };
  }

  function localPath(path, base, feature, target) {
    if (path == null) return null;
    if (typeof path === 'string' && path.trim()) {
      try {
        var url = new URL(path, base);
        var origin = new URL(base);
        if (url.protocol === origin.protocol && url.host === origin.host) return url.href;
      } catch (error) {}
    }
    report('asset-path', feature, target, 'Invalid local asset path for "' + feature + '".',
      'Use a path relative to the manifest or page.', path);
    return null;
  }

  function siteConfig(config) {
    var site = config.site;
    var options = config.options;
    function optionMap(feature, field, accept) {
      var map;
      [site, config.page].forEach(function (layer) {
        var values = layer.options && layer.options[feature];
        if (!object(values) || !own(values, field)) return;
        var path = 'options.' + feature + '.' + field;
        var raw = values[field];
        if (!object(raw)) {
          report('feature-option', feature, path, 'Invalid ' + path + '.', 'Supply a keyed object.', raw);
          return;
        }
        if (!map) map = Object.create(null);
        Object.keys(raw).forEach(function (key) {
          var value = object(raw[key]) ? merge(map[key], raw[key]) : raw[key];
          if (accept(value)) map[key] = value;
          else report('feature-option', feature, path + '.' + key, 'Invalid entry "' + key + '" in ' + path + '.',
            'Check the feature’s supported entry format.', raw[key]);
        });
      });
      if (map !== undefined) {
        if (!object(options[feature])) options[feature] = {};
        options[feature][field] = map;
      } else if (object(options[feature])) delete options[feature][field];
    }
    optionMap('roles', 'colors', function (value) {
      return typeof value === 'string' && OP._colors.includes(value.trim().toLowerCase());
    });
    optionMap('roles', 'tips', function (value) { return typeof value === 'string' && value.trim() !== ''; });
    optionMap('tags', 'glossary', function (value) {
      return typeof value === 'string' ? value.trim() !== '' : object(value) && typeof value.tip === 'string';
    });
    optionMap('tags', 'classes', function (value) {
      return object(value) && typeof value.shape === 'string' && (!own(value, 'tags') || Array.isArray(value.tags));
    });
    optionMap('math', 'macros', function (value) { return typeof value === 'string'; });
    optionMap('tooltips', 'terms', function (value) {
      return typeof value === 'string' || (object(value) && typeof value.text === 'string' &&
        (!own(value, 'more') || typeof value.more === 'string') &&
        (!own(value, 'title') || typeof value.title === 'string'));
    });
    optionMap('citations', 'entries', function (value) { return typeof value === 'string' || object(value); });
    var hasManifest = !!siteScript && object(root.OffPrintSite);
    var normalized = OP._normalizeSite(hasManifest ? copy(site) : undefined, siteURL, options);
    var declared = object(site.assets) ? site.assets : {};
    var pageSearch = config.page.options && config.page.options.search;
    var localSearch = localPath(pageSearch && pageSearch.index, pageURL, 'search', 'options.search.index');
    var search = pageSearch && pageSearch.index === null ? null : localSearch ||
      localPath(declared.search && declared.search.output, siteURL, 'search', 'assets.search.output');
    var data = Object.create(null);
    if (object(declared.data)) Object.keys(declared.data).forEach(function (name) {
      var item = declared.data[name];
      var output = localPath(item && item.output, siteURL, 'data', name);
      if (!output) return;
      data[name] = {
        source: localPath(item.source, siteURL, 'data', name),
        output: output,
        type: item.type || null
      };
    });
    normalized.search = search;
    normalized.searchBase = localSearch ? pageURL : siteURL;
    normalized.assets = { search: { output: search }, data: data };
    normalized.options = options;
    normalized.selectionGroups = merge(site.selectionGroups, config.page.selectionGroups);
    normalized.parameterScopes = merge(site.parameterScopes, config.page.parameterScopes);
    return freeze(normalized);
  }

  function finish() {
    readyComplete = true;
    ready.splice(0).forEach(function (callback) { run('ready', callback); });
  }

  var boot = OP._boot = {
    entryURL: exportContext?.entryURL || entry.src,
    replaying: replaying,
    // Only the Reader capture freezes the page; Interactive export frames keep the live page's motion.
    capturing: replaying && !exportContext.interactive,
    enabled: function (id) { return active.has(id) && !failed.has(id); },
    canInitialize: function (name) {
      var id = own(moduleFeatures, name) ? moduleFeatures[name] : name;
      if (!own(catalog, id)) return true;
      if (!active.has(id)) return false;
      var missing = (catalog[id].needs || []).find(function (dep) { return failed.has(dep); });
      if (!missing) return true;
      failed.add(id);
      dependency(id, missing);
      return false;
    },
    after: function (name, fn) { after.push({ name: name, fn: fn }); },
    chartFeature: function (type) {
      return Object.keys(catalog).find(function (id) { return (catalog[id].chartTypes || []).indexOf(type) >= 0; }) || null;
    },
    chartLayerFeature: function (name) {
      return Object.keys(catalog).find(function (id) { return (catalog[id].chartLayers || []).indexOf(name) >= 0; }) || null;
    },
    load: function (url) {
      return replaying ? exportContext.loadAsset('search', url) : load(url, false);
    },
    loadExport: loadExport,
    exportPlan: exportPlan,
    mountExport: mountExport,
    report: report,
    merge: merge,
    optionLayers: function (feature, id) {
      var layers = boot.configOptions.map(function (options) {
        return object(options[feature]) ? options[feature] : {};
      });
      return layers.concat(id ? layers.map(function (layer) {
        return object(layer.instances) && own(layer.instances, id) ? layer.instances[id] : {};
      }) : []);
    },
    moduleFailed: function (name, error) {
      var id = own(moduleFeatures, name) ? moduleFeatures[name] : name;
      failed.add(id);
      report('feature-init', id, null, 'Feature "' + id + '" failed to initialize: ' + String(error),
        'Check the feature markup and configuration, then reload.');
    }
  };

  async function start() {
    var config = configuration();
    earlyTheme(config);
    seedAssets();
    var core = new URL('js/core.js', library).href;
    if (!await load(core, false) || !boot.initialize) {
      assetFailure('core', core);
      setupClosed = true;
      finish();
      return;
    }
    Object.defineProperty(OP, '_site', { value: siteConfig(config), writable: false });
    boot.configOptions = [config.site, config.page].map(function (layer) { return freeze(merge(layer.options)); });
    boot.themeDefault = config.enabled.has('theme') ? themeMode(config) : undefined;
    var readerState = new URL('js/reader-state.js', library).href;
    if (await load(readerState, false) && OP._readerState) {
      OP._readerState.prepare(doc, pageURL, OP._site.provided ? siteURL : pageURL, [
        config.page, config.options, config.site.selectionGroups, config.site.parameterScopes, config.site.assets
      ]);
    } else assetFailure('reader-state', readerState);
    for (var id of Object.keys(catalog)) {
      if (!config.enabled.has(id)) continue;
      var missing = (catalog[id].needs || []).find(function (dep) { return !active.has(dep); });
      if (missing) dependency(id, missing);
      else if (await featureAssets(id)) active.add(id);
    }
    if (!active.has('theme') && appliedTheme) earlyTheme({ enabled: active });
    if (active.has('data')) {
      for (var name of Object.keys(OP._site.assets.data)) {
        if (exportContext?.interactive && !exportContext.hasData?.(name)) continue;
        var url = OP._site.assets.data[name].output;
        var loaded = replaying ? await exportContext.loadAsset('data', url, name) : await load(url, false);
        if (!loaded) assetFailure('data', url);
        else if (!boot.registerData(name)) report('data-wrapper', 'data', url,
          'Data wrapper did not register "' + name + '".', 'Regenerate the classic data wrapper with that name.', name);
      }
      try { boot.readData(); } catch (error) { boot.moduleFailed('data', error); }
    }
    boot.prepareSelection();
    setupClosed = true;
    setup.splice(0).forEach(function (callback) { run('setup', callback); });
    boot.setupComplete = true;
    boot.initialize();
    after.forEach(function (item) {
      try { item.fn(); } catch (error) { boot.moduleFailed(item.name, error); }
    });
    OP._readerState?.start();
    finish();
  }

  earlyTheme(configuration());
  function begin() {
    start().catch(function (error) {
      boot.moduleFailed('core', error);
      setupClosed = true;
      finish();
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', begin, { once: true });
  else begin();
})(window, document);
