(function (root) {
  'use strict';

  var OP = root.OffPrint;
  var svg = 'http://www.w3.org/2000/svg';
  var csp = "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; " +
    "base-uri 'none'; form-action 'none'";
  var declarations = 'script:not([src]):is([type="application/json"],[type="text/csv"],[type="text/json"],' +
    '[type="text/yaml"],[type="application/yaml"],[type="text/x-yaml"],[type="application/x-yaml"])';
  var popMotion = 'opacity:0;transform:translateY(-3px);transition:opacity .12s,transform .12s}' +
    '.op-export-pop[data-op-side=above]{transform:translateY(3px)}.op-export-pop.is-visible{opacity:1;transform:none}';
  var tipCSS = '.op-export-pop{position:fixed;z-index:50;display:flex;flex-direction:column;gap:6px;' +
    'max-width:min(320px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;' + popMotion +
    '.op-export-pop[hidden]{display:none}' +
    '.op-export-pop.is-wide{max-width:min(480px,calc(100vw - 16px))}' +
    '.op-export-pop .op-tooltip{position:static;max-width:none;max-height:none;opacity:1;transform:none;overflow:visible}' +
    '[data-export-disabled]{text-decoration:line-through!important;cursor:default}' +
    '.op-reader-step-controls{display:flex;flex-wrap:wrap;gap:.35rem;margin-block:.6rem;align-items:center}' +
    '.op-reader-step-controls :is(button,select){box-sizing:border-box;min-height:2.75rem;max-width:100%;' +
    'font:inherit;color:inherit;background:var(--op-bg,Canvas);border:1px solid var(--op-border,GrayText);' +
    'border-radius:var(--op-radius-lg,.5rem);padding:.35rem .6rem}' +
    '.op-reader-step-controls button{cursor:pointer}.op-reader-step-controls button[aria-disabled=true]{opacity:.55;cursor:default}' +
    '.op-reader-step-controls select{min-width:0;flex:1 1 10rem}' +
    ':root[data-op-theme=light]{color-scheme:light}:root[data-op-theme=dark]{color-scheme:dark}' +
    // An invisible stand-in for the shell's section rail, so sections.js keeps its lines clear of it.
    '.op-section-rail[data-export-rail-space]{display:none!important}' +
    '[data-export-rail] .op-section-rail[data-export-rail-space]{display:block!important;position:fixed;top:0;left:0;' +
    'width:var(--export-rail-right);height:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none}';
  var readerCSS = `
    :root{color-scheme:light dark;--nav-width:260px;--nav-slot:0px;--bar:3.75rem;
      --line:light-dark(#d9dde2,#41464e);--accent:light-dark(#245f9f,#9bc8ff);
      --wash:color-mix(in srgb,var(--accent) 12%,transparent)}
    :root[data-op-theme=light]{color-scheme:light}:root[data-op-theme=dark]{color-scheme:dark}
    body{margin:0;font:1rem system-ui;background:Canvas;color:CanvasText}
    #export-page{box-sizing:border-box;margin-left:var(--nav-slot);height:100dvh;padding-top:var(--bar);
      transition:margin-left .25s ease}
    iframe{display:block;width:100%;height:100%;border:0}
    #export-page:has(#export-status:not([hidden])){display:grid;grid-template-rows:auto minmax(0,1fr)}
    #export-status{margin:0;padding:.45rem 1rem;background:var(--wash);font-size:.88rem}
    #export-sidebar{position:fixed;z-index:3;inset:0 auto 0 0;width:var(--nav-width);box-sizing:border-box;
      background:var(--op-bg-sidebar);border-right:1px solid var(--op-border);
      padding:var(--op-space-4) var(--op-space-3);overflow:auto;overscroll-behavior:contain;
      color:var(--op-text-muted);font:15px/var(--op-line-height) var(--op-font);
      -webkit-font-smoothing:antialiased;scrollbar-width:thin;scrollbar-color:transparent transparent;
      transition:transform .25s ease,visibility 0s,scrollbar-color .2s ease}
    .op-nav-hidden #export-sidebar{transform:translateX(-100%);visibility:hidden;
      transition:transform .25s ease,visibility 0s linear .25s,scrollbar-color .2s ease}
    @media (max-width:860px),(any-hover:none){
      #export-sidebar{width:min(calc(var(--nav-width) + 40px),85vw);transition:transform .2s ease,visibility 0s}
      .op-nav-hidden #export-sidebar{transition:transform .2s ease,visibility 0s linear .2s}}
    :is([data-nav-init],[data-nav-resizing]) :is(#export-sidebar,#export-page,#export-controls){transition:none!important}
    #export-sidebar:is(:hover,:focus-within){scrollbar-color:var(--op-border-strong) transparent}
    #export-sidebar :focus-visible{outline:2px solid var(--op-focus);outline-offset:-2px}
    #export-contents summary{list-style:none;cursor:pointer}
    #export-contents summary::-webkit-details-marker{display:none}
    #export-contents details[open]:not([data-closing]) > summary .op-nav-caret svg{transform:rotate(90deg)}
    #export-contents details:not([open]) > ul{display:none}
    #export-resize{position:fixed;z-index:4;inset:0 auto 0 calc(var(--nav-width) - 4px);width:8px;
      cursor:col-resize;touch-action:none}
    #export-resize::after{content:"";position:absolute;inset:0 3px;background:var(--op-blue);
      opacity:0;transition:opacity .15s}
    #export-resize:hover::after{opacity:.6;transition-delay:.15s}
    #export-resize:focus-visible{outline:none}
    #export-resize:focus-visible::after{opacity:1}
    #export-edge{position:fixed;z-index:2;inset:var(--bar) auto 0 0;width:8px}
    #export-controls{z-index:5;left:calc(var(--nav-slot) + var(--op-space-3))}
    #export-controls :focus-visible{outline:2px solid var(--op-focus);outline-offset:2px}
    [data-zoom] :is(#export-controls,.op-section-rail){visibility:hidden}
    /* base.css is not loaded in the shell: give the rail its border-box sizing and page typography. */
    .op-section-rail,.op-section-rail *,.op-section-rail *::before,.op-section-rail *::after{box-sizing:border-box}
    .op-section-rail{color:var(--op-text);font:var(--op-font-size)/var(--op-line-height) var(--op-font);
      -webkit-font-smoothing:antialiased}
    #export-shade{position:fixed;z-index:2;inset:0;background:rgba(0,0,0,.3)}
    [data-drawer] #export-sidebar{box-shadow:0 0 24px rgba(0,0,0,.18)}
    [data-drawer] :is(#export-pill,#export-pager){visibility:hidden}
    #export-close{font:inherit;color:inherit;background:var(--op-bg);
      border:1px solid var(--op-border-strong);border-radius:var(--op-radius-lg);
      min-height:31px;padding:var(--op-space-1) var(--op-space-2);margin-bottom:var(--op-space-2);cursor:pointer}
    .op-export-pop{position:fixed;z-index:6;max-width:calc(100% - 16px);pointer-events:none;${popMotion}
    .op-tooltip{box-sizing:border-box;max-width:min(320px,calc(100vw - 16px));padding:.4rem .7rem;
      border-radius:.45rem;background:light-dark(#fff,#252525);box-shadow:0 0 0 1px var(--line),0 6px 20px #0002;
      color:CanvasText;font-size:14px;line-height:1.5}
    [hidden]{display:none!important}
  `;

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

  function folderError(message) {
    var error = Error(message);
    error.folder = 'documents';
    return error;
  }

  // Locates the selected folder on disk from a known file that it must contain.
  function documentationFolder(files, anchorURL) {
    var list = Array.from(files || []);
    var name = list[0]?.webkitRelativePath?.split('/')[0];
    var prefix = name + '/';
    var paths = new Map(list.map(function (file) {
      var path = file.webkitRelativePath;
      if (!name || !path?.startsWith(prefix) || path.length === prefix.length) {
        throw folderError('Choose the site folder.');
      }
      return [path.slice(prefix.length), file];
    }));
    if (!paths.size) throw folderError('Choose the site folder.');
    var segments = fileKey(anchorURL, true)?.split('/') || [];
    var firstFolder = anchorURL?.host ? 3 : 1;
    var match = segments.findLastIndex(function (part, index) {
      return index >= firstFolder && part === name && paths.has(segments.slice(index + 1).join('/'));
    });
    if (match < 0) {
      throw folderError('The selected site folder does not contain the open OffPrint page.');
    }
    var base = segments.slice(0, match + 1).join('/') + '/';
    function file(url, page) {
      var key = fileKey(url, page);
      return key?.startsWith(base) ? paths.get(key.slice(base.length)) : undefined;
    }

    return { file: file, readText: async function (url) {
      var item = file(address(url));
      if (!item) throw Error('The file was not found in the site folder.');
      return item.text();
    } };
  }

  function resourceFiles(folder) {
    var base = fileKey(address('.', OP._boot.entryURL));
    var bundle = OP._exportLibrary;
    var files = new Map();
    return { file: function (url) {
      var key = fileKey(url);
      if (base && key?.startsWith(base)) {
        var path = key.slice(base.length);
        if (files.has(path)) return files.get(path);
        if (Object.hasOwn(bundle.styles, path)) {
          files.set(path, new Blob([bundle.styles[path]]));
        } else if (Object.hasOwn(bundle.fonts, path)) {
          var bytes = Uint8Array.from(root.atob(bundle.fonts[path]), function (character) {
            return character.charCodeAt(0);
          });
          files.set(path, new Blob([bytes]));
        }
        if (files.has(path)) return files.get(path);
      }
      return folder.file(url);
    } };
  }

  async function config(doc, url, folder, manifestCache) {
    var script = doc.querySelector('script[data-op-site]');
    if (!script) return {};
    var base = address(doc.querySelector('base[href]')?.getAttribute('href') || url.href, url);
    var src = script.getAttribute('src');
    var siteURL = src ? address(src, base) : url;
    if (!siteURL) throw Error('The manifest URL is invalid.');
    if (!src) return { site: OP._assetBuild.parseManifest(script.textContent), siteURL: siteURL.href };
    var key = fileKey(siteURL);
    if (!manifestCache.has(key)) {
      manifestCache.set(key, folder.readText(siteURL).then(OP._assetBuild.parseManifest));
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
          items.push({ id: 'group-' + (++serial), title: node.title, collapsed: node.collapsed,
            children: children.concat(descendants) });
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
    node.removeAttribute('target');
    node.removeAttribute('download');
    node.removeAttribute('ping');
    // Pipeline setup reads these fragments before it assigns IDs to unnamed blocks.
    if (page.interactive && attr === 'href' && value.startsWith('#') &&
        node.matches('.op-pipe-link') && node.closest('.op-pipeline')) return;
    var target = linkTarget(value, page, pages);
    if (target.external) {
      node.setAttribute(attr, target.external);
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    } else if (target.route) {
      var fragment = page.interactive && value.trim().startsWith('#');
      if (!fragment) node.setAttribute(attr, target.route);
      node.setAttribute('data-export-destination', fragment ? target.route : '');
    } else {
      node.removeAttribute(attr);
      node.setAttribute('role', 'link');
      node.setAttribute('aria-disabled', 'true');
      node.setAttribute('data-export-disabled', '');
      var explanation = target.missingFragment ? 'This section is unavailable in the export.' :
        'This destination is unavailable in the export.';
      node.setAttribute('title', explanation);
      var description = create(page.document, 'span', explanation);
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
        report('missing-reference', value, 'The SVG drawing could not be read from the site folder.');
        return null;
      }
      var doc = page.document;
      var drawing = doc.importNode(source, true);
      var ids = new Map();
      var index = imported.size + 1;
      var serial = 0;
      for (var node of [drawing, ...drawing.querySelectorAll('[id]')]) {
        var id = node.id;
        do { node.id = 'op-export-svg-' + index + '-' + (++serial); }
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
    var templates = new Set();
    if (page.interactive) {
      for (var anchor of doc.body.querySelectorAll('[data-op-more-id]')) {
        var template = doc.getElementById(anchor.getAttribute('data-op-more-id').trim());
        if (template?.localName === 'template' && template.content) templates.add(template);
      }
    }
    page.templates = templates;
    var imported = new Map();
    var active = 'script,iframe,frame,frameset,object,embed,applet,portal,fencedframe,webview,link,meta,base,style,template,' +
      'animate,animateMotion,animateTransform,set,param';
    for (var { node, base, ids, owner } of sources) {
      signal?.throwIfAborted();
      var attached = owner ? doc.body.contains(owner) && owner.content.contains(node) : doc.documentElement.contains(node);
      if (!attached) continue;
      if (templates.has(node)) {
        for (var child of node.content.querySelectorAll('*')) {
          sources.push({ node: child, base: base, owner: node });
        }
      } else if (node.matches(active) && !(page.interactive && !owner &&
          node.namespaceURI === 'http://www.w3.org/1999/xhtml' && node.matches(declarations))) {
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
          sources.push({ node: image, base: base, owner: owner });
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
        if (/^on/.test(name) || ['nonce', 'autofocus', 'autoplay', 'ping', 'target', 'srcdoc', 'action', 'formaction', 'xml:base',
          'data-export-destination', 'data-export-disabled'].includes(name) ||
          ids && /^data-op-reader-step(?:s|-svg|-detail)$/.test(name)) {
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
    var description = 'op-export-unavailable';
    while (doc.getElementById(description)) description += '-';
    var main = doc.querySelector('.op-page') || doc.querySelector('main') || doc.body;
    return { ...page, document: doc, description: description, snapshot: snapshot, attributes: new Map(),
      noPager: !!OP._component.closestFlag(main, 'no-pager', 'navigation'),
      base: address(snapshot.baseURL, page.url) || address(page.url) };
  }

  function appendPager(page, adjacent) {
    if (page.noPager || adjacent.every(function (entry) { return !entry; })) return;
    var doc = page.document;
    var main = doc.querySelector('.op-page') || doc.querySelector('main') || doc.body;
    var pager = create(doc, 'nav');
    pager.className = 'op-pager';
    pager.setAttribute('aria-label', 'Previous and next pages');
    adjacent.forEach(function (entry, index) {
      if (!entry) return;
      var rel = index ? 'next' : 'prev';
      var link = create(doc, 'a');
      link.className = 'op-pager-link op-pager-' + rel;
      link.rel = rel;
      link.href = route(entry.id);
      link.setAttribute('data-export-destination', '');
      var direction = create(doc, 'span', index ? 'Next' : 'Previous');
      direction.className = 'op-pager-dir';
      var title = create(doc, 'span', entry.title);
      title.className = 'op-pager-title';
      link.append(direction, title);
      pager.append(link);
    });
    main.append(pager);
  }

  function targets(doc) {
    return new Set(Array.from(doc.querySelectorAll('[id],a[name]')).flatMap(function (node) {
      return [node.id, node.localName === 'a' && node.getAttribute('name')].filter(Boolean);
    }));
  }

  async function styles(page, resources, report, signal) {
    var doc = page.document;
    var packaged = new Set();
    var records = page.snapshot.styles.slice();
    var linked = new Set(records.filter(function (record) { return record.href && !record.media; })
      .map(function (record) { return address(record.href, page.base)?.href; }));
    if (!linked.has(address('offprint.css', OP._boot.entryURL).href)) {
      for (var path of ['css/nav.css', 'css/controls.css']) {
        var href = address(path, OP._boot.entryURL).href;
        if (!linked.has(href)) records.push({ href: href });
      }
    }
    for (var record of [...records, { text: tipCSS }]) {
      signal?.throwIfAborted();
      var reference = record.href ? await resources.stylesheet(record.href, page.base, report) :
        await resources.inlineStylesheet(record.text, page.base, report);
      if (reference === null) continue;
      if (record.module) packaged.add(record.module);
      var sheet = create(doc, 'link');
      sheet.rel = 'stylesheet';
      sheet.setAttribute('href', '');
      page.attributes.set(sheet.getAttributeNode('href'), [false, reference]);
      if (record.media) sheet.media = record.media;
      doc.head.append(sheet);
    }
    return Array.from(packaged);
  }

  function collectHeadings(page) {
    page.targets = targets(page.document);
    var headings = OP._exportReader.headings(page.document);
    // Match live navigation's anchor allocation order for pages rendered without navigation.
    for (var heading of headings.filter(function (node) { return node.localName !== 'h1'; })
      .concat(headings.filter(function (node) { return node.localName === 'h1'; }))) {
      if (!heading.id) heading.id = OP.util.uniqueSlug(OP.util.slug(heading.textContent), page.targets);
    }
  }

  function datasetConsumers(source) {
    var consumers = new Map();
    for (var node of source.querySelectorAll('[data-op-source]:not(script,pre),[data-op-dropzone][data-op-target-source]')) {
      var name = (node.getAttribute('data-op-target-source') ?? node.getAttribute('data-op-source')).trim();
      if (!name) continue;
      if (!consumers.has(name)) consumers.set(name, new Set());
      consumers.get(name).add(node.id ? '#' + node.id :
        node.getAttribute('aria-label') || node.getAttribute('class') || node.localName);
    }
    return consumers;
  }

  function pageImports(page, consumers, consent, preview) {
    var imports = page.snapshot.committed?.imports || [];
    var blocked = false;
    var data = [];
    for (var [key, item] of imports) {
      var text = page.snapshot.importPayloads?.get(key);
      var bytes = item.bytes;
      var available = !item.missing && typeof text === 'string' && new Blob([text]).size === bytes &&
        !page.snapshot.issues.some(function (issue) { return issue.code === 'saved-import' && issue.target === key; });
      var id = JSON.stringify([page.id, page.url, key, item.revision]);
      var included = available && consent.has(id);
      var target;
      try { target = JSON.parse(item.target); } catch (error) {}
      var name = target?.[1];
      var affected = target?.[0] === 'source' ? Array.from(consumers.get(name) || []) :
        target?.[0] === 'target' ? ['#' + name] : [];
      if (!affected.length) {
        var host;
        try { host = JSON.parse(item.host)?.[1]; } catch (error) {}
        affected.push(name || (host?.[0] === 'id' ? '#' + host[1] : 'File dropzone'));
      }
      preview.push({ id: id, page: page.id, title: page.snapshot.title || page.title, name: item.name,
        bytes: bytes, consumers: affected, available: available, selected: included, included: false });
      if (included) data.push([key, text]);
      else blocked = true;
    }
    if (blocked) throw Error('One or more imports needed for Interactive playback are unavailable or require inclusion.');
    return data;
  }

  async function authorScripts(source, page, folder, resources, consent, preview, signal) {
    var base = address(source.querySelector('base[href]')?.getAttribute('href') || page.url, page.url);
    var scripts = { before: [], after: [], files: [] };
    var candidates = [];
    var reads = new Map();
    var inline = 0;

    function manifest(node, attribute) {
      var value = JSON.parse(node.getAttribute(attribute) ?? '[]');
      if (!Array.isArray(value) || value.some(function (item) { return typeof item !== 'string' || !item.trim(); })) {
        throw Error(attribute + ' must contain a JSON array of local paths.');
      }
      return value;
    }

    async function local(value, resource) {
      var url = address(value, base);
      var path = fileKey(url);
      var file = path && folder.file(url);
      if (!file) throw Error('Local file unavailable: ' + value);
      if (resource && /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svg|webp|otf|ttf|woff2?)$/i.test(path)) {
        var binary = new Uint8Array(await file.arrayBuffer());
        var checksum = new Uint8Array(await root.crypto.subtle.digest('SHA-256', binary));
        return [url.href, 'url', root.btoa(String.fromCharCode(...checksum))];
      }
      if (!reads.has(path)) reads.set(path, file.text());
      var code = await reads.get(path);
      signal?.throwIfAborted();
      return resource ? [url.href, 'text', code] : [path, value, code];
    }

    var scriptNodes = Array.from(source.querySelectorAll('script'));
    var offprintEntry = scriptNodes.find(function (script) {
      return /(?:^|\/)offprint\.js(?:[?#]|$)/.test(script.getAttribute('src') || '');
    });
    for (var node of scriptNodes) {
      signal?.throwIfAborted();
      if (node.hasAttribute('data-op-site')) continue;
      var src = node.getAttribute('src');
      var type = (node.getAttribute('type') || '').trim().toLowerCase();
      if (type && !/^(?:(?:text|application)\/(?:x-)?(?:java|ecma)script|text\/(?:jscript|livescript|javascript1\.[0-5]))$/.test(type) &&
          type !== 'module') continue;
      if (node === offprintEntry) {
        candidates.push(null);
        continue;
      }
      var name = src || 'Inline script ' + (++inline);
      var entry = { page: page.id, title: page.snapshot.title || page.title, name: name,
        dependencies: [], resources: [], available: false, selected: false, included: false };
      preview.push(entry);
      try {
        entry.dependencies = manifest(node, 'data-op-export-dependencies');
        entry.resources = manifest(node, 'data-op-export-resources');
        if (type === 'module' || node.hasAttribute('nomodule') || src !== null && node.hasAttribute('async')) {
          throw Error('Only ordered classic scripts can be included.');
        }
        var dependencies = await Promise.all(entry.dependencies.map(function (value) { return local(value, false); }));
        var files = await Promise.all(entry.resources.map(function (value) { return local(value, true); }));
        var main = src === null ? [null, name, node.textContent] : await local(src, false);
        // Consent covers the exact code and files shown in the preview, including changes between builds.
        var signature = JSON.stringify([dependencies, main, files]);
        var bytes = new TextEncoder().encode(signature);
        var digest = new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes));
        entry.id = JSON.stringify([page.id, preview.length, root.btoa(String.fromCharCode(...digest))]);
        entry.available = !!consent;
        entry.selected = !!consent?.has(entry.id);
        if (!entry.available) entry.issue = 'Interactive playback is unavailable for this page.';
        if (entry.selected) candidates.push({ dependencies: dependencies, main: main, files: files,
          defer: src !== null && node.hasAttribute('defer') });
      } catch (error) {
        signal?.throwIfAborted();
        entry.issue = error.message;
        page.report('author-script', name, error.message);
      }
    }

    var afterEntry = false;
    var seen = new Set();
    var files = new Map();
    function include(candidate, list) {
      for (var [path, name, code] of candidate.dependencies) {
        if (seen.has(path)) continue;
        seen.add(path);
        list.push([name, code]);
      }
      var [path, name, code] = candidate.main;
      if (path) seen.add(path);
      list.push([name, code]);
      candidate.files.forEach(function (file) { files.set(file[0], file); });
    }
    for (var candidate of candidates) {
      if (!candidate) afterEntry = true;
      else if (!candidate.defer) include(candidate, afterEntry ? scripts.after : scripts.before);
    }
    for (var candidate of candidates) {
      if (candidate?.defer) include(candidate, scripts.after);
    }
    for (var [url, kind, value] of files.values()) {
      if (kind === 'url') {
        var parts = await resources.resource(url, base, page.report);
        if (!parts) throw Error('An author resource could not be embedded.');
        value = parts[0];
      }
      scripts.files.push([url, kind, value]);
    }
    return scripts.before.length || scripts.after.length ? scripts : null;
  }

  async function interactivePage(input, page, folder, signal, consent, preview) {
    var source = new root.DOMParser().parseFromString(input.html, 'text/html');
    var consumers = datasetConsumers(source);
    var imports = pageImports(page, consumers, consent, preview);
    var entry = OP._boot.entryURL;
    var settings = Array.from(source.querySelectorAll('script[src]')).find(function (script) {
      return /(?:^|\/)offprint\.js(?:[?#]|$)/.test(script.getAttribute('src'));
    });
    if (!settings) throw Error('This page has no OffPrint entry script.');
    var base = address(source.querySelector('base[href]')?.getAttribute('href') || page.url, page.url);
    if (!base) throw Error('The page base URL is invalid.');
    var profile = settings.getAttribute('data-op-profile');
    var configNode = source.querySelector('script[data-op-page]');
    var config = {};
    if (configNode?.type === 'application/json') {
      config = JSON.parse(configNode.textContent);
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Invalid OffPrint page configuration.');
    }
    var records = Array.from(source.querySelectorAll('style,link[rel~="stylesheet"][href]:not([disabled])'), function (node) {
      return { href: node.getAttribute('href'), text: node.textContent, media: node.media || '' };
    });
    var combined = records.some(function (record) {
      return record.href && fileKey(address(record.href, base)) === fileKey(address('offprint.css', entry));
    });
    var plan = OP._boot.exportPlan(input.site || {}, config, profile, combined);
    var modulesByStyle = new Map(plan.styles.map(function (path) { return [fileKey(address(path, entry)), path]; }));
    var present = new Set();
    records.forEach(function (record) {
      var path = record.href && modulesByStyle.get(fileKey(address(record.href, base)));
      if (path) {
        record.module = path;
        present.add(path);
      }
    });
    for (var path of plan.styles) {
      if (!present.has(path)) records.push({ href: address(path, entry).href, module: path });
    }
    var identities = [];
    source.querySelectorAll('[data-op-export-identity]').forEach(function (node) { node.removeAttribute('data-op-export-identity'); });
    for (var [host, identity] of OP._readerState.identify(source)) {
      host.setAttribute('data-op-export-identity', identities.length);
      identities.push(identity);
    }
    var inlineData = [];
    source.querySelectorAll('[data-op-export-data]').forEach(function (node) { node.removeAttribute('data-op-export-data'); });
    if (plan.features.includes('data')) {
      for (var definition of source.querySelectorAll('script:not([src])[data-op-source],pre[data-op-source]')) {
        var name = definition.getAttribute('data-op-source').trim();
        if (!consumers.has(name) && !definition.hasAttribute('data-op-data-view')) {
          if (definition.localName === 'script') definition.remove();
          continue;
        }
        definition.setAttribute('data-op-export-data', inlineData.length);
        inlineData.push(definition.textContent);
        definition.textContent = '';
      }
    }
    var live = copyPage({
      title: source.title, baseURL: base.href, body: source.body,
      htmlAttributes: Array.from(source.documentElement.attributes, function (attr) { return [attr.name, attr.value]; }),
      styles: records
    }, page);
    live.interactive = true;
    live.document.querySelectorAll('.op-sidebar,.op-nav-toggle,.op-controls,.op-pager,[data-op-export-control]')
      .forEach(function (node) { node.remove(); });
    live.document.documentElement.setAttribute('data-op-export-replay', '');
    live.document.querySelector('meta[http-equiv]').content = csp + "; script-src 'nonce-op-export-nonce' 'unsafe-eval'";
    for (var declaration of source.head.querySelectorAll(declarations + ':not([data-op-site])')) {
      // Import only the inert text and the data attributes used by OffPrint.
      var script = create(live.document, 'script', declaration.textContent);
      script.type = declaration.type;
      for (var attr of declaration.attributes) {
        if (attr.name.startsWith('data-op-') && attr.name !== 'data-op-export-identity') {
          script.setAttribute(attr.name, attr.value);
        }
      }
      live.document.head.append(script);
    }
    for (var template of source.head.querySelectorAll('template[id]')) {
      if (!live.document.getElementById(template.id)) live.document.body.append(live.document.importNode(template, true));
    }
    if (input.site) {
      var manifest = create(live.document, 'script');
      manifest.type = 'application/json';
      manifest.setAttribute('data-op-site', '');
      live.document.head.append(manifest);
    }
    var data = [];
    if (plan.features.includes('data')) {
      for (var [name, item] of Object.entries(input.site?.assets?.data || {})) {
        if (!consumers.has(name)) continue;
        if (typeof item?.output !== 'string' || !item.output.trim()) continue;
        signal?.throwIfAborted();
        var value = OP._pageSnapshot.wrappedAsset('data', name, await folder.readText(address(item.output, input.siteURL)));
        if (value && typeof value === 'object' && typeof value.text === 'string') {
          value = { format: value.format, version: value.version, type: value.type, text: value.text };
        }
        data.push([name, value]);
      }
    }
    signal?.throwIfAborted();
    var modules = plan.scripts.map(function (path) {
      if (!Object.hasOwn(OP._exportRuntime, path)) throw Error('A trusted OffPrint module is missing: ' + path);
      return [path, OP._exportRuntime[path]];
    });
    live.payload = { url: page.url, base: base.href, siteURL: input.siteURL || page.url, entryURL: entry,
      profile: profile, site: input.site || null, combined: combined, features: plan.features,
      modules: modules, data: data, inlineData: inlineData, imports: imports,
      identities: identities, state: page.snapshot.committed || null };
    return live;
  }

  function pageMarkup(page) {
    var html = page.document.documentElement;
    var markup = '<!doctype html>\n' + html.outerHTML;
    if (!page.attributes.size) return [markup];
    // Mark only known attribute values, then split away the markers before saving.
    var prefix = 'op-export-asset-';
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
    list.className = 'op-nav-list';
    for (var node of tree) {
      var item = create(doc, 'li');
      item.className = 'op-nav-item';
      if (node.children.length) {
        var children = contentsList(doc, node.children, pages);
        if (!children.children.length) continue;
        var group = create(doc, 'details');
        group.className = 'op-nav-page-group';
        if (!node.collapsed) group.setAttribute('open', '');
        var summary = create(doc, 'summary');
        summary.className = 'op-nav-row';
        var caret = create(doc, 'span');
        caret.className = 'op-nav-caret';
        caret.setAttribute('aria-hidden', 'true');
        caret.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" focusable="false" fill="none" ' +
          'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M6 3.5l4.5 4.5L6 12.5"/></svg>';
        var label = create(doc, 'span', node.title);
        label.className = 'op-nav-label';
        summary.append(caret, label);
        group.append(summary, children);
        item.append(group);
      } else {
        if (!pages.has(node.id)) continue;
        var row = create(doc, 'div');
        row.className = 'op-nav-row';
        var spacer = create(doc, 'span');
        spacer.className = 'op-nav-caret-space';
        var link = create(doc, 'a', node.title);
        link.className = 'op-nav-link';
        link.href = route(node.id);
        link.setAttribute('data-export-destination', '');
        row.append(spacer, link);
        item.append(row);
      }
      list.append(item);
    }
    return list;
  }

  function serialize(site, pages, assets, interactive) {
    var doc = document.implementation.createHTMLDocument(site.title);
    var withAuthor = pages.some(function (page) { return page.payload?.author; });
    doc.documentElement.lang = 'en';
    meta(doc, 'charset', 'utf-8');
    meta(doc, 'name', 'viewport').content = 'width=device-width,initial-scale=1';
    meta(doc, 'http-equiv', 'Content-Security-Policy').content =
      "object-src 'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline' 'unsafe-eval'" +
      (withAuthor ? " blob:; frame-src 'none'" : '');
    var styles = OP._exportLibrary.styles;
    doc.head.append(create(doc, 'style', [styles['css/tokens.css'], styles['css/nav.css'], styles['css/controls.css'],
      readerCSS].join('\n')));
    var sidebar = create(doc, 'div');
    sidebar.id = 'export-sidebar';
    sidebar.hidden = true;
    var close = create(doc, 'button', 'Close navigation');
    close.id = 'export-close';
    close.type = 'button';
    close.hidden = true;
    var toc = create(doc, 'nav');
    toc.id = 'export-contents';
    toc.setAttribute('aria-label', 'Contents');
    if (site.navTitle) {
      var heading = create(doc, 'a', site.navTitle);
      heading.className = 'op-nav-title';
      heading.href = route(pages[0].id);
      heading.setAttribute('data-export-destination', '');
      toc.append(heading);
    }
    toc.append(contentsList(doc, site.tree, new Set(pages.map(function (page) { return page.id; }))));
    sidebar.append(close, toc);
    var pill = create(doc, 'div');
    pill.id = 'export-pill';
    pill.className = 'op-controls';
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Page controls');
    var nav = create(doc, 'nav');
    nav.id = 'export-pager';
    nav.className = 'op-controls-pager';
    nav.setAttribute('aria-label', 'Quick page navigation');
    for (var id of ['export-previous', 'export-next']) {
      var link = create(doc, 'a');
      link.hidden = true;
      link.id = id;
      link.className = 'op-controls-btn';
      link.setAttribute('data-export-destination', '');
      nav.append(link);
    }
    var separator = create(doc, 'div');
    separator.id = 'export-resize';
    separator.hidden = true;
    separator.tabIndex = 0;
    separator.setAttribute('role', 'separator');
    separator.setAttribute('aria-label', 'Navigation width');
    separator.setAttribute('aria-orientation', 'vertical');
    separator.setAttribute('aria-controls', sidebar.id);
    var edge = create(doc, 'div');
    edge.id = 'export-edge';
    edge.hidden = true;
    var shade = create(doc, 'div');
    shade.id = 'export-shade';
    shade.hidden = true;
    var host = create(doc, 'main');
    host.id = 'export-page';
    host.dataset.initial = pages.find(function (page) { return page.id === site.active; })?.id || pages[0].id;
    if (interactive) {
      var status = create(doc, 'p');
      status.id = 'export-status';
      status.hidden = true;
      status.setAttribute('role', 'status');
      host.append(status);
    }
    var bar = create(doc, 'div');
    bar.id = 'export-controls';
    bar.className = 'op-controls-bar';
    bar.append(pill, nav);
    doc.body.append(bar, edge, shade, sidebar, separator, host,
      create(doc, 'noscript', 'Enable JavaScript to use the standalone reader.'));
    var shared = [];
    var keys = new Map();
    function share(value) {
      var key = JSON.stringify(value);
      if (!keys.has(key)) {
        keys.set(key, shared.length);
        shared.push(value);
      }
      return keys.get(key);
    }
    var bundle = create(doc, 'script', JSON.stringify({
      ...(interactive ? { version: 1, mode: 'interactive', shared: shared } : {}),
      assets: assets,
      icons: OP._icons,
      pages: pages.map(function (page) {
        var record = { id: page.id, title: page.title, markup: page.markup, ...(page.noPager ? { noPager: true } : {}) };
        if (interactive) {
          var payload = page.payload;
          record.url = page.url;
          if (withAuthor) record.targets = page.targets;
          record.interactive = payload ? { ...payload,
            site: payload.site === null ? null : share(payload.site),
            modules: payload.modules.map(function ([path, code]) { return [path, share(code)]; }),
            data: payload.data.map(function ([name, value]) { return [name, share(value)]; }),
            inlineData: payload.inlineData.map(share),
            imports: payload.imports.map(function ([key, text]) { return [key, share(text)]; }),
            ...(payload.author ? { author: {
              before: payload.author.before.map(function ([name, code]) { return [name, share(code)]; }),
              after: payload.author.after.map(function ([name, code]) { return [name, share(code)]; }),
              files: payload.author.files.map(function ([url, kind, value]) {
                return [url, kind, kind === 'text' ? share(value) : value];
              })
            } } : {})
          } : null;
        }
        return record;
      })
    }).replace(/</g, '\\u003c'));
    bundle.id = 'export-bundle';
    bundle.type = 'application/json';
    doc.body.append(bundle);
    var reader = OP._exportReader;
    var runtime = [reader.assemble, reader.figureSteps, reader.headings, reader.controls,
      interactive ? reader.startInteractive : null, interactive ? fileKey : null, withAuthor ? reader.authorFrame : null,
      reader.focusBlocks];
    doc.body.append(create(doc, 'script', '(' + reader.run.toString() + ')(' + runtime.map(String).join(',') + ');'));
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  async function build(folder, site, manifestCache, selected, options) {
    var signal = options?.signal;
    var interactive = options?.mode === 'interactive';
    signal?.throwIfAborted();
    var chosen = selection(site.tree, selected);
    if (!chosen.size) throw Error('Select at least one page.');
    if (!OP._exportLibrary) await OP._boot.loadExport('js/export-library.js');
    signal?.throwIfAborted();
    if (!OP._exportLibrary) throw Error('The OffPrint library assets could not load. Check that the full OffPrint library is installed.');
    if (interactive && !OP._exportRuntime) await OP._boot.loadExport('js/export-runtime.js');
    signal?.throwIfAborted();
    if (interactive && !OP._exportRuntime) throw Error('The trusted OffPrint export modules could not load.');
    var issues = [];
    var importPreview = [];
    var scriptPreview = [];
    var includeScripts = new Set(options?.includeScripts || []);
    var consent = new Set(options?.includeImports || []);
    var pages = new Map();
    var resources = OP._exportResources.setup(resourceFiles(folder), signal);

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
        if (!file) throw Error('The page file was not found in the site folder.');
        var html = await file.text();
        var source = OP._assetBuild.parseHTML(html);
        var configForPage = await config(source, address(page.url), folder, manifestCache).catch(function (error) {
          report('missing-manifest', page.url, error.message);
          return {};
        });
        signal?.throwIfAborted();
        var input = { ...configForPage, html: html, url: page.url, readText: folder.readText };
        var snapshot = await OP._pageSnapshot.capture(input, { signal: signal, interactive: interactive });
        for (var item of snapshot.issues) {
          if (!interactive || item.code !== 'custom-script') report(item.code, item.target, item.message);
        }
        var copied = copyPage(snapshot, page);
        copied.report = report;
        pages.set(page.key, copied);
        if (interactive) {
          try { copied.live = await interactivePage(input, copied, folder, signal, consent, importPreview); }
          catch (error) {
            signal?.throwIfAborted();
            report('interactive-fallback', page.url, error.message);
          }
          try {
            var localScripts = await authorScripts(source, copied, folder, resources, copied.live ? includeScripts : null,
              scriptPreview, signal);
            if (localScripts) copied.live.payload.author = localScripts;
          } catch (error) {
            signal?.throwIfAborted();
            copied.live = null;
            report('interactive-fallback', page.url, error.message);
          }
        }
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
      collectHeadings(page);
      if (page.live) {
        await assets(page.live, folder, resources, page.report, signal);
        collectHeadings(page.live);
        page.live.targets.forEach(function (id) { page.targets.add(id); });
      }
    }
    var includedPages = Array.from(pages.values());
    for (var [index, page] of includedPages.entries()) {
      await options?.onProgress?.({ phase: 'links', completed: completed, total: chosen.size,
        page: page.id, title: page.title });
      signal?.throwIfAborted();
      for (var output of [page, page.live].filter(Boolean)) {
        var scopes = [output.document.body];
        for (var template of output.templates) {
          if (output.document.body.contains(template)) scopes.push(template.content);
        }
        for (var scope of scopes) {
          for (var link of scope.querySelectorAll('a[href],area[href],a[*|href]')) {
            rewriteLink(link, link.hasAttribute('href') ? 'href' : 'xlink:href', output, pages, page.report);
          }
        }
        appendPager(output, [includedPages[index - 1], includedPages[index + 1]]);
        var packaged = await styles(output, resources, page.report, signal);
        signal?.throwIfAborted();
        output.markup = pageMarkup(output);
        output.attributes.clear();
        output.templates.clear();
        output.document = null;
        if (output.payload) {
          output.payload.styles = packaged;
          output.payload.markup = output.markup;
        }
      }
    }
    await options?.onProgress?.({ phase: 'serialize', completed: completed, total: chosen.size });
    signal?.throwIfAborted();
    var included = includedPages.map(function (page) {
      return { id: page.id, title: page.snapshot.title || page.title, markup: page.markup,
        url: page.url, noPager: page.noPager, targets: Array.from(page.targets), payload: page.live?.payload,
        view: page.snapshot.view, imports: page.snapshot.imports };
    });
    var blob = new Blob([serialize(site, included, resources.assets, interactive)],
      { type: 'text/html;charset=utf-8' });
    signal?.throwIfAborted();
    var filename = site.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().replace(/[. ]+$/, '').slice(0, 120);
    options?.onProgress?.({ phase: 'done', completed: completed, total: chosen.size });
    var livePages = new Set(included.filter(function (page) { return page.payload; }).map(function (page) { return page.id; }));
    for (var entry of importPreview) entry.included = entry.selected && livePages.has(entry.page);
    for (var entry of scriptPreview) entry.included = entry.selected && livePages.has(entry.page);
    return { blob: blob, bytes: blob.size, filename: (filename || 'OffPrint export') + '.html', issues: issues,
      importChoices: importPreview, scriptChoices: scriptPreview,
      pages: included.map(function (page) {
        return { id: page.id, title: page.title, view: page.view, imports: page.imports,
          ...(interactive ? { interactive: !!page.payload } : {}) };
      }) };
  }

  async function prepare(files, options) {
    var signal = options?.signal;
    signal?.throwIfAborted();
    var url = address(OP._page);
    var folder = documentationFolder(files, url);
    var loaded = await Promise.all([
      ['_assetBuild', 'tools/asset-build.js'], ['_pageSnapshot', 'js/page-snapshot.js'],
      ['_exportResources', 'js/export-resources.js'], ['_exportReader', 'js/export-reader.js']
    ].map(async function ([key, path]) {
      return OP[key] || await OP._boot.loadExport(path) && OP[key];
    }));
    signal?.throwIfAborted();
    if (loaded.some(function (dependency) { return !dependency; })) throw Error('The OffPrint export tools could not be loaded.');
    var manifestCache = new Map();
    var source = OP._assetBuild.parseHTML(await folder.file(url, true).text());
    var configuration = await config(source, url, folder, manifestCache);
    signal?.throwIfAborted();
    var expected = OP._site.provided ? address(OP._site.base) : null;
    if (fileKey(expected) !== fileKey(address(configuration.siteURL)) && (expected || configuration.site)) {
      throw Error('The selected page does not use the manifest of the open OffPrint page.');
    }
    var normalized = OP._normalizeSite(configuration.site, configuration.siteURL || url.href);
    var site = catalog(normalized, url, source.title || document.title || 'OffPrint export', folder);
    site.title = normalized.title || source.title || document.title || 'OffPrint export';
    site.navTitle = normalized.title;
    return { title: site.title, tree: site.tree, active: site.active,
      build: function (selected, options) { return build(folder, site, manifestCache, selected, options); } };
  }

  OP._exportPackage = { prepare: prepare };
})(window);
