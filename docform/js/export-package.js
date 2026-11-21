(function (root) {
  'use strict';

  var DF = root.DocForm;
  var svg = 'http://www.w3.org/2000/svg';
  var csp = "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; " +
    "base-uri 'none'; form-action 'none'";
  var tipCSS = '.df-export-pop{position:fixed;z-index:50;display:flex;flex-direction:column;gap:6px;' +
    'max-width:min(320px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto}' +
    '.df-export-pop.is-wide{max-width:min(480px,calc(100vw - 16px))}' +
    '.df-export-pop .df-tooltip{position:static;max-width:none;max-height:none;opacity:1;transform:none;overflow:visible}' +
    '[data-export-disabled]{text-decoration:line-through!important;cursor:default}';
  var readerCSS = 'html{color-scheme:light dark}body{margin:0;height:100dvh;display:flex;flex-direction:column;' +
    'font:1rem system-ui;background:Canvas;color:CanvasText}header{padding:.65rem 1rem;border-bottom:1px solid GrayText;' +
    'display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem 1rem}header nav{display:flex;flex-wrap:wrap;gap:.5rem 1rem}' +
    'details{position:relative}summary{cursor:pointer}details nav{position:absolute;z-index:1;inset-inline-start:0;' +
    'min-width:16rem;max-width:85vw;max-height:70vh;overflow:auto;background:Canvas;border:1px solid GrayText;' +
    'padding:.5rem 1rem;box-shadow:0 4px 14px #0003}ul{padding-inline-start:1.25rem;margin:.25rem 0}' +
    'li{margin:.35rem 0}a[aria-current]{font-weight:bold}main{flex:1;min-height:0}iframe{display:block;' +
    'width:100%;height:100%;border:0}[hidden]{display:none!important}';

  function address(value, base) {
    try { return new URL(value, base); } catch (error) { return null; }
  }

  function fileKey(url, page) {
    if (url?.protocol !== 'file:') return null;
    try {
      var segments = url.pathname.split('/').map(decodeURIComponent);
      if (segments.some(function (part) { return /[\/\\\x00-\x1f]/.test(part); })) return null;
      if (page && !segments.at(-1)) segments[segments.length - 1] = 'index.html';
      return (url.host ? '//' + url.host : '') + segments.join('/');
    } catch (error) { return null; }
  }

  function folderError(message, folder) {
    var error = Error(message);
    error.folder = folder;
    return error;
  }

  // Locates the selected folder on disk from a known file that it must contain.
  function folderFromFiles(files, anchorURL, page, kind, label) {
    var list = Array.from(files || []);
    var name = list[0]?.webkitRelativePath?.split('/')[0];
    var prefix = name + '/';
    var paths = new Map(list.map(function (file) {
      var path = file.webkitRelativePath;
      if (!name || !path?.startsWith(prefix) || path.length === prefix.length) {
        throw folderError('Choose the ' + label + ' folder.', kind);
      }
      return [path.slice(prefix.length), file];
    }));
    if (!paths.size) throw folderError('Choose the ' + label + ' folder.', kind);
    var segments = fileKey(anchorURL, page)?.split('/') || [];
    var firstFolder = anchorURL?.host ? 3 : 1;
    var match = segments.findLastIndex(function (part, index) {
      return index >= firstFolder && part === name && paths.has(segments.slice(index + 1).join('/'));
    });
    if (match < 0) {
      throw folderError('The selected ' + label + ' folder does not contain ' +
        (kind === 'library' ? 'the DocForm library used by this page.' : 'the open DocForm page.'), kind);
    }
    var base = segments.slice(0, match + 1).join('/') + '/';
    return function (url, page) {
      var key = fileKey(url, page);
      return key?.startsWith(base) ? paths.get(key.slice(base.length)) : undefined;
    };
  }

  function sourceFolders(documents, library, pageURL) {
    var lookups = [
      folderFromFiles(documents, pageURL, true, 'documents', 'documentation'),
      folderFromFiles(library, address(DF._boot.entryURL), false, 'library', 'DocForm library')
    ];

    function file(url, page) {
      for (var lookup of lookups) {
        var item = lookup(url, page);
        if (item) return item;
      }
    }

    return { file: file, readText: async function (url) {
      var item = file(address(url));
      if (!item) throw Error('The file was not found in the selected folders.');
      return item.text();
    } };
  }

  async function config(doc, url, folder, manifestCache) {
    var script = doc.querySelector('script[data-df-site]');
    if (!script) return {};
    var base = address(doc.querySelector('base[href]')?.getAttribute('href') || url.href, url);
    var src = script.getAttribute('src');
    var siteURL = src ? address(src, base) : url;
    if (!siteURL) throw Error('The manifest URL is invalid.');
    if (!src) return { site: DF._assetBuild.parseManifest(script.textContent), siteURL: siteURL.href };
    var key = fileKey(siteURL);
    if (!manifestCache.has(key)) {
      manifestCache.set(key, folder.readText(siteURL).then(DF._assetBuild.parseManifest));
    }
    return { site: await manifestCache.get(key), siteURL: siteURL.href };
  }

  function catalog(normalized, activeURL, activeTitle, folder) {
    var ordered = new Map();
    var serial = 0;
    var active = fileKey(activeURL, true);

    function branch(nodes) {
      var items = [];
      for (var node of nodes) {
        var url = address(node.href);
        var key = fileKey(url, true);
        var children = [];
        if (key && !ordered.has(key)) {
          if (url.pathname.endsWith('/')) url.pathname += 'index.html';
          var page = { id: 'page-' + (ordered.size + 1), title: node.title, key: key,
            url: key === active ? activeURL.href : url.href, available: !!folder.file(url, true) };
          ordered.set(key, page);
          children.push({ ...page, children: [] });
        }
        var descendants = branch(node.pages);
        if (descendants.length) {
          items.push({ id: 'group-' + (++serial), title: node.title, children: children.concat(descendants) });
        } else items.push(...children);
      }
      return items;
    }

    var tree = branch(normalized.pages);
    if (!ordered.has(active)) {
      var page = { id: 'page-' + (ordered.size + 1), title: activeTitle, key: active,
        url: activeURL.href, available: true };
      ordered.set(active, page);
      tree.push({ ...page, children: [] });
    }
    return { ordered: ordered, tree: tree, active: ordered.get(active).id };
  }

  function selection(tree, selected) {
    var choices = new Set(selected);
    var pages = new Set();
    function walk(nodes, include) {
      nodes.forEach(function (node) {
        var chosen = include || choices.has(node.id);
        if (node.children.length) walk(node.children, chosen);
        else if (chosen) pages.add(node.id);
      });
    }
    walk(tree, false);
    return pages;
  }

  function create(doc, tag, content) {
    var node = doc.createElement(tag);
    if (content != null) node.textContent = content;
    return node;
  }

  function meta(doc, name, value) {
    var el = doc.createElement('meta');
    el.setAttribute(name, value);
    if (name === 'charset') doc.head.prepend(el);
    else doc.head.append(el);
    return el;
  }

  function fragmentID(hash) {
    try { return decodeURIComponent(hash.slice(1)); } catch (error) { return hash.slice(1); }
  }

  function route(page, fragment) {
    return '#' + page + (fragment ? '/' + encodeURIComponent(fragment) : '');
  }

  function linkTarget(value, page, pages) {
    var relativeFragment = value.trim().startsWith('#');
    var url = address(value, relativeFragment ? page.url : page.base);
    if (!url) return {};
    if (['https:', 'http:', 'mailto:', 'tel:', 'sms:'].includes(url.protocol)) return { external: url.href };
    var key = relativeFragment ? page.key : fileKey(url, true);
    var target = pages.get(key);
    var fragment = fragmentID(url.hash);
    if (target && (!fragment || target.targets.has(fragment) || fragment.toLowerCase() === 'top')) {
      return { route: route(target.id, fragment) };
    }
    return { missingFragment: !!(target && fragment) };
  }

  function rewriteLink(node, attr, page, pages, report) {
    var value = node.getAttribute(attr);
    var target = linkTarget(value, page, pages);
    node.removeAttribute('target');
    node.removeAttribute('download');
    node.removeAttribute('ping');
    if (target.external) {
      node.setAttribute(attr, target.external);
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    } else if (target.route) {
      node.setAttribute(attr, target.route);
      node.setAttribute('data-export-destination', '');
    } else {
      node.removeAttribute(attr);
      node.setAttribute('role', 'link');
      node.setAttribute('aria-disabled', 'true');
      node.setAttribute('data-export-disabled', '');
      var explanation = target.missingFragment ? 'This section is unavailable in the export.' :
        'This destination is unavailable in the export.';
      node.setAttribute('title', explanation);
      var description = create(node.ownerDocument, 'span', explanation);
      description.id = page.description;
      description.hidden = true;
      if (!page.document.getElementById(page.description)) page.document.body.append(description);
      node.setAttribute('aria-describedby', [node.getAttribute('aria-describedby'), page.description].filter(Boolean).join(' '));
      report('unavailable-link', value, explanation);
    }
  }

  async function svgReference(value, base, page, folder, sources, imported, report) {
    var url = address(value, base);
    if (!url || url.protocol !== 'file:' || !/\.svg$/i.test(url.pathname)) {
      report('unsupported-reference', value, 'The SVG drawing must be a local SVG file.');
      return null;
    }
    var fragment = fragmentID(url.hash);
    var key = fileKey(url);
    if (!imported.has(key)) {
      var source;
      try {
        var text = await folder.readText(url.href);
        source = new root.DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
      if (source.namespaceURI !== svg || source.localName !== 'svg' || source.prefix || source.querySelector('parsererror')) {
          throw Error('The file is not an SVG drawing.');
        }
      } catch (error) {
        report('missing-reference', value, 'The SVG drawing could not be read from the selected folders.');
        return null;
      }
      var doc = page.document;
      var drawing = doc.importNode(source, true);
      var ids = new Map();
      var index = imported.size + 1;
      var serial = 0;
      for (var node of [drawing, ...drawing.querySelectorAll('[id]')]) {
        var id = node.id;
        do { node.id = 'df-export-svg-' + index + '-' + (++serial); }
        while (doc.getElementById(node.id));
        if (id && !ids.has(id)) ids.set(id, node.id);
      }
      if (drawing.querySelector('style,link')) {
        report('unsupported-svg-style', value, 'Stylesheets inside the referenced SVG were omitted.');
      }
      var definitions = doc.createElementNS(svg, 'svg');
      definitions.setAttribute('width', '0');
      definitions.setAttribute('height', '0');
      definitions.setAttribute('aria-hidden', 'true');
      definitions.style.position = 'absolute';
      var defs = doc.createElementNS(svg, 'defs');
      defs.append(drawing);
      definitions.append(defs);
      doc.body.append(definitions);
      imported.set(key, { ids: ids, root: drawing.id });
      for (var node of [drawing, ...drawing.querySelectorAll('*')]) {
        sources.push({ node: node, base: url, ids: ids });
      }
    }
    var asset = imported.get(key);
    var id = fragment ? asset.ids.get(fragment) : asset.root;
    if (!id) report('missing-reference', value, 'The SVG fragment was not found.');
    return id ? '#' + id : null;
  }

  async function assets(page, folder, resources, report, signal) {
    var doc = page.document;
    var sources = [doc.documentElement, doc.body, ...doc.body.querySelectorAll('*')].map(function (node) {
      return { node: node, base: page.base };
    });
    var imported = new Map();
    var active = 'script,iframe,frame,frameset,object,embed,applet,portal,fencedframe,webview,link,meta,base,style,template,' +
      'animate,animateMotion,animateTransform,set,param';
    for (var { node, base, ids } of sources) {
      signal?.throwIfAborted();
      if (!doc.documentElement.contains(node)) continue;
      if (node.matches(active)) {
        node.remove();
        continue;
      }
      if (node.matches('audio,video')) {
        var fallback = create(doc, 'div');
        if (node.id) fallback.id = node.id;
        var poster = node.getAttribute('poster');
        if (poster) {
          var image = create(doc, 'img');
          image.setAttribute('src', poster);
          image.alt = node.getAttribute('aria-label') || 'Video poster';
          fallback.append(image);
          sources.push({ node: image, base: base });
        }
        for (var child of Array.from(node.childNodes)) {
          if (!child.matches?.('source,track')) fallback.append(child);
        }
        fallback.append(create(doc, 'p', node.localName === 'video' ? 'Video playback is unavailable.' : 'Audio playback is unavailable.'));
        report('omitted-media', node.getAttribute('src') || node.querySelector('source[src]')?.getAttribute('src') || node.localName,
          'Playback media was omitted. Still images and available fallback content were retained.');
        node.replaceWith(fallback);
        continue;
      }
      if (node.matches('track,source') && !node.closest('picture')) {
        node.remove();
        continue;
      }
      var isLink = node.matches('a,area');
      // SVG 2 uses href in preference to xlink:href.
      if (node.hasAttribute('href') && node.hasAttribute('xlink:href')) node.removeAttribute('xlink:href');
      for (var attr of Array.from(node.attributes)) {
        var name = attr.name.toLowerCase();
        var value = attr.value;
        var replacement = value;
        var css = false;
        if (/^on/.test(name) || ['autofocus', 'autoplay', 'ping', 'target', 'srcdoc', 'action', 'formaction', 'xml:base',
          'data-export-destination', 'data-export-disabled'].includes(name)) {
          replacement = null;
        } else if (name === 'href' || name === 'xlink:href') {
          if (isLink) {
            if (!ids) continue;
            if (value.trim().startsWith('#')) {
              var mapped = ids.get(fragmentID(value.trim()));
              replacement = mapped ? '#' + encodeURIComponent(mapped) : base.href;
            } else replacement = address(value, base)?.href || value;
          } else if (node.namespaceURI === svg && ['image', 'feImage'].includes(node.localName)) {
            replacement = await resources.resource(value, base, report, 'image');
          } else if (node.namespaceURI === svg && value.trim().startsWith('#')) {
            if (ids) replacement = ids.has(fragmentID(value.trim())) ? '#' + ids.get(fragmentID(value.trim())) : null;
          } else if (node.namespaceURI === svg && node.matches('use,linearGradient,radialGradient,pattern,filter,textPath')) {
            replacement = await svgReference(value, base, page, folder, sources, imported, report);
          } else {
            report('unsupported-reference', value, 'This external reference is unavailable in the export.');
            replacement = null;
          }
        } else if (name === 'src' || name === 'background') {
          replacement = name === 'background' || node.matches('img,input[type="image"]') ?
            await resources.resource(value, base, report, 'image') : null;
        } else if (name === 'srcset') {
          replacement = node.matches('img,picture source') ?
            await resources.srcset(value, base, report) : null;
        } else if (name === 'style' || node.namespaceURI === svg && /url\(/i.test(value)) {
          css = true;
          replacement = await resources.css(value, base, report, ids);
        } else if (ids && ['aria-labelledby', 'aria-describedby'].includes(name)) {
          replacement = value.split(/\s+/).map(function (id) { return ids.get(id); }).filter(Boolean).join(' ') || null;
        }
        if (replacement === null) node.removeAttributeNode(attr);
        else if (Array.isArray(replacement)) {
          if (replacement.some(Array.isArray)) page.attributes.set(attr, [css, replacement]);
          else attr.value = replacement.join('');
        } else if (replacement !== value) attr.value = replacement;
      }
    }
  }

  function copyPage(snapshot, page) {
    var doc = document.implementation.createHTMLDocument(snapshot.title || page.title);
    meta(doc, 'charset', 'utf-8');
    meta(doc, 'http-equiv', 'Content-Security-Policy').content = csp;
    meta(doc, 'name', 'viewport').content = 'width=device-width,initial-scale=1';
    for (var [name, value] of snapshot.htmlAttributes) doc.documentElement.setAttribute(name, value);
    doc.body.replaceWith(doc.importNode(snapshot.body, true));
    var description = 'df-export-unavailable';
    while (doc.getElementById(description)) description += '-';
    return { ...page, document: doc, description: description, snapshot: snapshot, attributes: new Map(),
      base: address(snapshot.baseURL, page.url) || address(page.url) };
  }

  function targets(doc) {
    return new Set(Array.from(doc.querySelectorAll('[id],a[name]')).flatMap(function (node) {
      return [node.id, node.localName === 'a' && node.getAttribute('name')].filter(Boolean);
    }));
  }

  async function styles(page, resources, report, signal) {
    var doc = page.document;
    for (var record of [...page.snapshot.styles, { text: tipCSS }]) {
      signal?.throwIfAborted();
      var reference = record.href ? await resources.stylesheet(record.href, page.base, report) :
        await resources.inlineStylesheet(record.text, page.base, report);
      if (reference === null) continue;
      var sheet = create(doc, 'link');
      sheet.rel = 'stylesheet';
      sheet.setAttribute('href', '');
      page.attributes.set(sheet.getAttributeNode('href'), [false, reference]);
      if (record.media) sheet.media = record.media;
      doc.head.append(sheet);
    }
  }

  function pageMarkup(page) {
    var html = page.document.documentElement;
    var markup = '<!doctype html>\n' + html.outerHTML;
    if (!page.attributes.size) return [markup];
    // Mark only known attribute values, then split away the markers before saving.
    var prefix = 'df-export-asset-';
    while (markup.includes(prefix)) prefix += '-';
    var values = [];
    for (var [attr, parts] of page.attributes) {
      attr.value = prefix + values.length + '-ref';
      values.push(parts);
    }
    return ('<!doctype html>\n' + html.outerHTML).split(new RegExp(prefix + '(\\d+)-ref', 'g'))
      .map(function (part, index) { return index % 2 ? values[Number(part)] : part; });
  }

  function contentsList(doc, tree, pages) {
    var list = create(doc, 'ul');
    for (var node of tree) {
      var item = create(doc, 'li');
      if (node.children.length) {
        var children = contentsList(doc, node.children, pages);
        if (!children.children.length) continue;
        item.append(node.title, children);
      } else {
        if (!pages.has(node.id)) continue;
        var link = create(doc, 'a', node.title);
        link.href = route(node.id);
        link.setAttribute('data-export-destination', '');
        item.append(link);
      }
      list.append(item);
    }
    return list;
  }

  function serialize(title, tree, active, pages, assets) {
    var doc = document.implementation.createHTMLDocument(title);
    doc.documentElement.lang = 'en';
    meta(doc, 'charset', 'utf-8');
    meta(doc, 'name', 'viewport').content = 'width=device-width,initial-scale=1';
    meta(doc, 'http-equiv', 'Content-Security-Policy').content =
      "object-src 'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline'";
    doc.head.append(create(doc, 'style', readerCSS));
    var header = create(doc, 'header');
    var contents = create(doc, 'details');
    contents.id = 'export-contents';
    var toc = create(doc, 'nav');
    toc.setAttribute('aria-label', 'Table of contents');
    toc.append(contentsList(doc, tree, new Set(pages.map(function (page) { return page.id; }))));
    contents.append(create(doc, 'summary', 'Contents'), toc);
    var status = create(doc, 'strong');
    status.id = 'export-status';
    status.setAttribute('aria-live', 'polite');
    var nav = create(doc, 'nav');
    nav.setAttribute('aria-label', 'Sequential pages');
    for (var id of ['export-previous', 'export-next']) {
      var link = create(doc, 'a');
      link.hidden = true;
      link.id = id;
      link.setAttribute('data-export-destination', '');
      nav.append(link);
    }
    header.append(contents, status, nav);
    var host = create(doc, 'main');
    host.id = 'export-page';
    host.dataset.initial = pages.find(function (page) { return page.id === active; })?.id || pages[0].id;
    doc.body.append(header, host, create(doc, 'noscript', 'Enable JavaScript to use the standalone reader.'));
    var bundle = create(doc, 'script', JSON.stringify({
      assets: assets,
      pages: pages.map(function (page) { return { id: page.id, title: page.title, markup: page.markup }; })
    }).replace(/</g, '\\u003c'));
    bundle.id = 'export-bundle';
    bundle.type = 'application/json';
    doc.body.append(bundle);
    var reader = DF._exportReader;
    doc.body.append(create(doc, 'script', '(' + reader.run.toString() + ')(' + reader.assemble.toString() + ');'));
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  async function build(folder, site, manifestCache, selected, options) {
    var signal = options?.signal;
    signal?.throwIfAborted();
    var chosen = selection(site.tree, selected);
    if (!chosen.size) throw Error('Select at least one page.');
    var issues = [];
    var pages = new Map();
    var resources = DF._exportResources.setup(folder, signal);

    function reportFor(page) {
      var seen = new Set();
      return function (code, target, message) {
        var key = JSON.stringify([code, target, message]);
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({ page: page.id, title: page.title, code: code, target: target, message: message });
      };
    }

    var completed = 0;
    for (var page of site.ordered.values()) {
      if (!chosen.has(page.id)) continue;
      signal?.throwIfAborted();
      var report = reportFor(page);
      await options?.onProgress?.({ phase: 'capture', completed: completed++, total: chosen.size,
        page: page.id, title: page.title });
      signal?.throwIfAborted();
      try {
        var file = folder.file(address(page.url), true);
        if (!file) throw Error('The page file was not found in the documentation folder.');
        var html = await file.text();
        var source = DF._assetBuild.parseHTML(html);
        var configForPage = await config(source, address(page.url), folder, manifestCache).catch(function (error) {
          report('missing-manifest', page.url, error.message);
          return {};
        });
        signal?.throwIfAborted();
        var snapshot = await DF._pageSnapshot.capture({ ...configForPage,
          html: html, url: page.url, readText: folder.readText }, { signal: signal });
        for (var item of snapshot.issues) report(item.code, item.target, item.message);
        var copied = copyPage(snapshot, page);
        copied.report = report;
        pages.set(page.key, copied);
      } catch (error) {
        signal?.throwIfAborted();
        report('unavailable-page', page.url, error.message);
      }
    }
    if (!pages.size) {
      var error = Error('None of the selected pages could be packaged.');
      error.issues = issues;
      throw error;
    }
    // Collect destinations after removing non-reader markup and replacing playback media.
    for (var page of pages.values()) {
      await options?.onProgress?.({ phase: 'assets', completed: completed, total: chosen.size,
        page: page.id, title: page.title });
      signal?.throwIfAborted();
      await assets(page, folder, resources, page.report, signal);
      page.targets = targets(page.document);
    }
    for (var page of pages.values()) {
      await options?.onProgress?.({ phase: 'links', completed: completed, total: chosen.size,
        page: page.id, title: page.title });
      signal?.throwIfAborted();
      for (var link of page.document.body.querySelectorAll('a[href],area[href],a[*|href]')) {
        rewriteLink(link, link.hasAttribute('href') ? 'href' : 'xlink:href', page, pages, page.report);
      }
      await styles(page, resources, page.report, signal);
      signal?.throwIfAborted();
      page.markup = pageMarkup(page);
      page.attributes.clear();
      page.document = null;
    }
    await options?.onProgress?.({ phase: 'serialize', completed: completed, total: chosen.size });
    signal?.throwIfAborted();
    var included = Array.from(pages.values(), function (page) {
      return { id: page.id, title: page.snapshot.title || page.title, markup: page.markup,
        view: page.snapshot.view, imports: page.snapshot.imports };
    });
    var blob = new Blob([serialize(site.title, site.tree, site.active, included, resources.assets)],
      { type: 'text/html;charset=utf-8' });
    signal?.throwIfAborted();
    var filename = site.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().replace(/[. ]+$/, '').slice(0, 120);
    options?.onProgress?.({ phase: 'done', completed: completed, total: chosen.size });
    return { blob: blob, bytes: blob.size, filename: (filename || 'DocForm export') + '.html', issues: issues,
      pages: included.map(function (page) {
        return { id: page.id, title: page.title, view: page.view, imports: page.imports };
      }) };
  }

  async function prepare(files, options) {
    var signal = options?.signal;
    signal?.throwIfAborted();
    var url = address(DF._page);
    var folder = sourceFolders(files, options?.library, url);
    var loaded = await Promise.all([
      ['_assetBuild', 'tools/asset-build.js'], ['_pageSnapshot', 'js/page-snapshot.js'],
      ['_exportResources', 'js/export-resources.js'], ['_exportReader', 'js/export-reader.js']
    ].map(async function ([key, path]) {
      return DF[key] || await DF._boot.loadExport(path) && DF[key];
    }));
    signal?.throwIfAborted();
    if (loaded.some(function (dependency) { return !dependency; })) throw Error('The DocForm export tools could not be loaded.');
    var manifestCache = new Map();
    var source = DF._assetBuild.parseHTML(await folder.file(url, true).text());
    var configuration = await config(source, url, folder, manifestCache);
    signal?.throwIfAborted();
    var expected = DF._site.provided ? address(DF._site.base) : null;
    if (fileKey(expected) !== fileKey(address(configuration.siteURL)) && (expected || configuration.site)) {
      throw Error('The selected page does not use the manifest of the open DocForm page.');
    }
    var normalized = DF._normalizeSite(configuration.site, configuration.siteURL || url.href);
    var site = catalog(normalized, url, source.title || document.title || 'DocForm export', folder);
    site.title = normalized.title || source.title || document.title || 'DocForm export';
    return { title: site.title, tree: site.tree, active: site.active,
      build: function (selected, options) { return build(folder, site, manifestCache, selected, options); } };
  }

  DF._exportPackage = { prepare: prepare };
})(window);
