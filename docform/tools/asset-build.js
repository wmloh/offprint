(function (root) {
  'use strict';

  var DF = root.DocForm;
  var VERSION = 1;
  var GENERATOR = 1;
  var SEARCH = 'docform-search';
  var DATA = 'docform-data';

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function parseManifest(source) {
    var assignment = /^\s*window\.DocFormSite\s*=\s*([\s\S]+?)\s*;\s*$/.exec(source);
    if (!assignment) throw Error('Use window.DocFormSite = <JSON object>; as the only statement.');
    var site = JSON.parse(assignment[1]);
    if (!object(site)) throw Error('The manifest must contain a JSON object.');
    return site;
  }

  function parts(path) {
    return path.split('/').slice(0, -1);
  }

  // Resolve URL paths to the picker’s decoded, site-relative file names.
  function resolve(path, from, page) {
    if (typeof path !== 'string' || !path.trim() || /^[\\/]|^[a-z][a-z\d+.-]*:/i.test(path.trim())) {
      throw Error('Use a local path relative to ' + from + '.');
    }
    path = path.trim();
    if (page) path = path.split(/[?#]/)[0];
    if (!path || /[\\?#]/.test(path)) throw Error('Use a file path relative to ' + from + '.');
    var names = path.split('/').map(decodeURIComponent);
    var directory = ['', '.', '..'].includes(names[names.length - 1]);
    if (directory && !page) throw Error('Path must name a file.');
    var segments = parts(from);
    names.forEach(function (name) {
      if (/[\/\\\x00-\x1f]/.test(name)) throw Error('Use "/" to separate path segments.');
      if (!name || name === '.') return;
      if (name === '..') {
        if (!segments.length) throw Error('Path leaves the selected folder.');
        segments.pop();
      } else segments.push(name);
    });
    if (directory) segments.push('index.html');
    return segments.join('/');
  }

  function relative(from, target) {
    var base = parts(from);
    var dest = target.split('/');
    var same = 0;
    while (same < base.length && same < dest.length - 1 && base[same] === dest[same]) same++;
    return '../'.repeat(base.length - same) + dest.slice(same).map(encodeURIComponent).join('/');
  }

  function html(source) {
    // A detached HTML document has no browsing context. Scripts inserted by innerHTML stay inert.
    var doc = root.document.implementation.createHTMLDocument('');
    doc.documentElement.innerHTML = source;
    return doc;
  }

  async function discover(files, parseHTML) {
    var paths = new Set();
    var diagnostics = [];
    parseHTML = parseHTML || html;
    for (var path of Array.from(files.keys()).sort()) {
      if (!/\.html?$/i.test(path)) continue;
      try {
        var doc = parseHTML(await files.get(path).text());
        for (var script of doc.querySelectorAll('script[data-df-site][src]')) {
          var src = script.getAttribute('src');
          try { paths.add(resolve(src, path, true)); }
          catch (error) { diagnostics.push(path + ' → ' + src + ' — ' + error.message); }
        }
      } catch (error) {
        diagnostics.push('Cannot inspect ' + path + ' — ' + error.message);
      }
    }
    if (!paths.size) {
      for (var path of files.keys()) if (/(^|\/)site\.js$/i.test(path)) paths.add(path);
    }
    return { paths: Array.from(paths).sort(), diagnostics: diagnostics };
  }

  function pageInputs(site, manifest, include) {
    var base = 'file:///site/' + manifest.split('/').map(encodeURIComponent).join('/');
    var normalized = DF._normalizeSite(site, base);
    var titles = new Map();
    if (include !== undefined && !Array.isArray(include)) {
      throw Error('assets.search.include must be an ordered array of page paths.');
    }
    var pages = new Set(include?.map(function (path) { return resolve(path, manifest, true); }));

    normalized.order.forEach(function (page) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(page.path.trim()) && !page.href.startsWith('file:')) return;
      var file;
      try { file = resolve(page.path, manifest, true); }
      catch (error) {
        if (include !== undefined) return;
        throw Error('Cannot index ' + page.path + ' — ' + error.message);
      }
      if (!titles.has(file)) titles.set(file, page.title);
      if (include === undefined) pages.add(file);
    });
    return Array.from(pages, function (file) {
      return { file: file, path: relative(manifest, file), title: titles.get(file) || '' };
    });
  }

  function glossaryOptions(terms) {
    return Object.fromEntries(Object.entries(DF._tooltips.glossary(terms)).sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    }));
  }

  function plan(site, manifest, protectedPaths) {
    var assets = site.assets;
    var jobs = [];
    var diagnostics = [];
    if (assets === undefined) return { jobs: jobs, diagnostics: diagnostics };
    if (!object(assets)) return { jobs: jobs, diagnostics: ['assets must be an object.'] };

    function add(format, name, label, item) {
      var job = { format: format, name: name, label: label, output: null, inputs: [], errors: [] };
      jobs.push(job);
      if (!object(item)) {
        job.errors.push(label + ' must declare an output' + (format === DATA ? ' and source.' : '.'));
        return;
      }
      try { job.output = resolve(item.output, manifest); }
      catch (error) { job.errors.push(label + '.output (' + String(item.output) + ') — ' + error.message); }
      try {
        if (format === SEARCH) {
          job.inputs = pageInputs(site, manifest, item.include);
          var normalized = DF._normalizeSite(site, 'file:///manifest.js');
          job.config = { terms: glossaryOptions(normalized.glossary), autoLink: normalized.terms.autoLink === true };
        } else {
          var file = resolve(item.source, manifest);
          job.inputs = [{ file: file }];
          var ext = /\.([^.\/]+)$/.exec(file);
          var type = DF._dataSource.type(item.type === undefined ? ext && ext[1] : item.type);
          if (!name || name.trim() !== name) throw Error('Use a nonempty, trimmed source name.');
          if (!type) throw Error('Set type to csv, json, or yaml, or use a matching source extension.');
          job.config = { name: name, type: type };
        }
      } catch (error) {
        job.errors.push(label + (format === DATA ? '.source (' + String(item.source) + ')' : '') + ' — ' + error.message);
      }
    }

    if (assets.search !== undefined) add(SEARCH, null, 'assets.search', assets.search);
    if (object(assets.data)) {
      Object.keys(assets.data).forEach(function (name) {
        add(DATA, name, 'assets.data.' + name, assets.data[name]);
      });
    } else if (assets.data !== undefined) diagnostics.push('assets.data must map source names to descriptors.');

    var sources = new Set([manifest].concat(protectedPaths || []));
    jobs.forEach(function (job) { job.inputs.forEach(function (input) { sources.add(input.file); }); });
    jobs.forEach(function (job) {
      if (!job.output) return;
      if (Array.from(sources).some(function (source) {
        return source === job.output || source.startsWith(job.output + '/') || job.output.startsWith(source + '/');
      })) job.errors.push('Output ' + job.output + ' overlaps a site input or manifest.');
      var conflicts = jobs.filter(function (other) {
        return other !== job && other.output && (other.output === job.output ||
          other.output.startsWith(job.output + '/') || job.output.startsWith(other.output + '/'));
      });
      if (conflicts.length) job.errors.push('Output ' + job.output + ' conflicts with ' +
        conflicts.map(function (other) { return other.label + ' (' + other.output + ')'; }).join(', ') + '.');
    });
    return { jobs: jobs, diagnostics: diagnostics };
  }

  function linkTerms(doc, config) {
    var options = {};
    var node = doc.querySelector('script[type="application/json"][data-df-page]');
    if (node) {
      try { options = JSON.parse(node.textContent)?.options?.tooltips || {}; }
      catch (error) { /* The runtime also falls back to the site options. */ }
    }
    var terms = Object.assign(Object.create(null), config.terms, glossaryOptions(options.terms));
    var autoLink = typeof options.autoLink === 'boolean' ? options.autoLink : config.autoLink;
    var roots = Array.from(doc.querySelectorAll('[data-df-autolink]')).filter(function (el) {
      return DF._component.flag(el, 'autolink', 'tooltips');
    });
    if (autoLink) roots = roots.concat(Array.from(doc.querySelectorAll('.df-page')).filter(function (el) {
      return DF._component.flag(el, 'autolink', 'tooltips', true);
    }));
    DF._tooltips.linkTags(doc, terms);
    DF._tooltips.autoLink(roots, DF._tooltips.matcher(Object.keys(terms)));
  }

  async function fingerprint(file) {
    if (!root.crypto?.subtle) throw Error('Open the asset tool in a browser with local SHA-256 support.');
    var bytes = await file.arrayBuffer();
    var hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return {
      text: new TextDecoder().decode(bytes),
      bytes: bytes.byteLength,
      sha256: Array.from(new Uint8Array(hash), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('')
    };
  }

  function serialize(job, metadata, payload) {
    var value = JSON.stringify(Object.assign({ format: job.format, version: VERSION, metadata: metadata }, payload), null, 2);
    var header = '// Generated by DocForm tools/assets.html.\n';
    if (job.format === SEARCH) return header + 'window.DocFormSearch = ' + value + ';\n';
    return header + 'Object.defineProperty(window.DocFormData || (window.DocFormData = Object.create(null)), ' +
      JSON.stringify(job.name) + ', { configurable: true, enumerable: true, writable: true, value: ' + value + ' });\n';
  }

  async function inspect(files, site, manifest, protectedPaths, parseHTML) {
    var pages = Array.from(files.keys()).filter(function (path) { return /\.html?$/i.test(path); });
    var result = plan(site, manifest, pages.concat(protectedPaths || []));
    var reads = new Map();
    parseHTML = parseHTML || html;

    async function read(input) {
      if (!files.has(input.file)) throw Error('Missing input ' + input.file + '.');
      if (!reads.has(input.file)) reads.set(input.file, fingerprint(files.get(input.file)));
      try { return await reads.get(input.file); }
      catch (error) { throw Error('Cannot read or fingerprint ' + input.file + ' — ' + error.message); }
    }

    for (var job of result.jobs) {
      job.status = 'blocked';
      job.warnings = [];
      if (job.output && Array.from(files.keys()).some(function (path) {
        return path.startsWith(job.output + '/') ||
          path !== job.output && job.output.startsWith(path + '/');
      })) job.errors.push('Destination ' + job.output + ' conflicts with an existing file or directory.');
      var contents = [];
      for (var input of job.inputs) {
        try { contents.push(await read(input)); }
        catch (error) { job.errors.push(error.message); }
      }
      if (job.errors.length) continue;
      var metadata = {
        generator: GENERATOR, output: job.output, config: job.config,
        inputs: job.inputs.map(function (input, i) {
          return Object.assign({}, input, { sha256: contents[i].sha256 });
        })
      };

      var payload;
      if (job.format === SEARCH) {
        var pages = [];
        job.inputs.forEach(function (input, i) {
          try {
            var doc = parseHTML(contents[i].text);
            linkTerms(doc, job.config);
            var page = DF._search.extract(doc, input.title);
            pages.push({ path: input.path, title: page.title || input.path, sections: page.sections,
              terms: page.terms, outline: page.outline });
          } catch (error) {
            job.errors.push('Cannot index ' + input.file + ' — ' + error.message);
          }
        });
        if (job.errors.length) continue;
        payload = { pages: pages };
      } else {
        var raw = contents[0];
        payload = { type: job.config.type, text: raw.text };
        try {
          var parsed = DF._dataSource.input(payload, job.name, 0).parsed;
          var table = DF.data.table(parsed);
          var rows = table ? table.cells.length : raw.text.split('\n').length;
          var caps = DF._dataSource.defaults;
          if (raw.bytes > caps.maxBytes) job.warnings.push('Source exceeds the default ' + DF._dataSource.formatSize(caps.maxBytes) + ' size cap.');
          if (rows > caps.maxRows) job.warnings.push('Source exceeds the default ' + caps.maxRows + ' ' + (table ? 'row' : 'line') + ' cap.');
        } catch (error) {
          job.errors.push('Cannot parse ' + job.inputs[0].file + ' as ' + job.config.type + ' — ' + error.message);
          job.draft = serialize(job, metadata, Object.assign({ draft: true }, payload));
          continue;
        }
      }

      job.script = serialize(job, metadata, payload);
      try {
        job.existing = files.has(job.output) ? await files.get(job.output).text() : null;
        job.status = job.existing === null ? 'missing' : job.existing === job.script ? 'current' : 'stale';
      } catch (error) {
        job.errors.push('Cannot read output ' + job.output + ' — ' + error.message);
      }
    }
    return result;
  }

  function selected(jobs, choices) {
    return jobs.filter(function (job) { return job.status !== 'blocked' && choices.has(job.output); });
  }

  DF._assetBuild = { discover: discover, inspect: inspect, parseHTML: html, parseManifest: parseManifest, selected: selected };
})(window);
