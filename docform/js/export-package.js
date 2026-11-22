(function (root) {
  'use strict';

  var DF = root.DocForm;
  var svg = 'http://www.w3.org/2000/svg';
  var csp = "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; " +
    "base-uri 'none'; form-action 'none'";
  var declarations = 'script:not([src]):is([type="application/json"],[type="text/csv"],[type="text/json"],' +
    '[type="text/yaml"],[type="application/yaml"])';
  var tipCSS = '.df-export-pop{position:fixed;z-index:50;display:flex;flex-direction:column;gap:6px;' +
    'max-width:min(320px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto}' +
    '.df-export-pop[hidden]{display:none}' +
    '.df-export-pop.is-wide{max-width:min(480px,calc(100vw - 16px))}' +
    '.df-export-pop .df-tooltip{position:static;max-width:none;max-height:none;opacity:1;transform:none;overflow:visible}' +
    '[data-export-disabled]{text-decoration:line-through!important;cursor:default}' +
    '.df-reader-step-controls{display:flex;flex-wrap:wrap;gap:.35rem;margin-block:.6rem;align-items:center}' +
    '.df-reader-step-controls :is(button,select){box-sizing:border-box;min-height:2.75rem;max-width:100%;' +
    'font:inherit;color:inherit;background:var(--df-bg,Canvas);border:1px solid var(--df-border,GrayText);' +
    'border-radius:var(--df-radius-lg,.5rem);padding:.35rem .6rem}' +
    '.df-reader-step-controls button{cursor:pointer}.df-reader-step-controls button[aria-disabled=true]{opacity:.55;cursor:default}' +
    '.df-reader-step-controls select{min-width:0;flex:1 1 10rem}' +
    ':root[data-df-theme=light]{color-scheme:light}:root[data-df-theme=dark]{color-scheme:dark}' +
    '.df-reader-dim:not(:focus-within){filter:blur(2px);opacity:.54}' +
    '@media(hover:hover){.df-reader-dim:hover{filter:none;opacity:1}}';
  var readerCSS = `
    :root{color-scheme:light dark;--nav-width:260px;--nav-slot:0px;--bar:3.75rem;
      --line:light-dark(#d9dde2,#41464e);--accent:light-dark(#245f9f,#9bc8ff);
      --wash:color-mix(in srgb,var(--accent) 12%,transparent)}
    :root[data-df-theme=light]{color-scheme:light}:root[data-df-theme=dark]{color-scheme:dark}
    body{margin:0;font:1rem system-ui;background:Canvas;color:CanvasText}
    #export-page{box-sizing:border-box;margin-left:var(--nav-slot);height:100dvh;padding-top:var(--bar)}
    iframe{display:block;width:100%;height:100%;border:0}
    #export-page:has(#export-status:not([hidden])){display:grid;grid-template-rows:auto minmax(0,1fr)}
    #export-status{margin:0;padding:.45rem 1rem;background:var(--wash);font-size:.88rem}
    #export-sidebar{position:fixed;z-index:3;inset:0 auto 0 0;width:var(--nav-width);box-sizing:border-box;
      background:Canvas;border-right:1px solid var(--line);padding:.75rem;overflow:auto;overscroll-behavior:contain;
      scrollbar-width:thin;overflow-wrap:anywhere}
    #export-contents ul{list-style:none;padding:0;margin:.25rem 0}
    #export-contents ul ul{padding-left:.65rem}
    .export-group{display:block;margin:.7rem .4rem .2rem;padding-top:.65rem;border-top:1px solid var(--line);
      font-size:.8rem;font-weight:650;color:GrayText}
    #export-contents a{display:block;color:inherit;text-decoration:none;padding:.36rem .5rem;border-radius:.4rem}
    #export-contents a:hover,#export-contents [aria-current]{background:var(--wash);color:var(--accent)}
    #export-contents [aria-current]{font-weight:650}
    #export-contents .export-outline{margin:.2rem 0 .6rem .45rem;border-left:1px solid var(--line);font-size:.86rem}
    .export-outline [data-level="2"]{padding-left:.65rem}.export-outline [data-level="3"]{padding-left:1.25rem}
    #export-resize{position:fixed;z-index:4;inset:0 auto 0 calc(var(--nav-width) - 4px);width:8px;
      cursor:col-resize;touch-action:none}
    #export-resize:hover,#export-resize:focus-visible{background:var(--accent)}
    #export-edge{position:fixed;z-index:2;inset:var(--bar) auto 0 0;width:8px}
    #export-pill,#export-pager{position:fixed;z-index:5;top:.45rem;display:flex;gap:.08rem;align-items:center;
      background:color-mix(in srgb,Canvas 92%,transparent);backdrop-filter:blur(12px);
      box-shadow:0 0 0 1px var(--line),0 3px 12px #0002;border-radius:2rem;padding:.12rem}
    #export-pill{left:calc(var(--nav-slot) + .55rem)}#export-pager{right:.55rem}
    #export-pill :is(button,[role=progressbar]),#export-pager a{box-sizing:border-box;display:grid;place-items:center;
      width:2.65rem;height:2.65rem;border:0;border-radius:50%;padding:0;background:transparent;color:inherit;
      font:inherit;text-decoration:none}
    #export-pill button,#export-pager a{cursor:pointer}
    #export-pill button:hover,#export-pill [aria-pressed=true],#export-pager a:hover{background:var(--wash);color:var(--accent)}
    #export-pill svg,#export-pager svg{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:1.5;
      stroke-linecap:round;stroke-linejoin:round}
    #export-pill .export-progress svg{width:1.55rem;height:1.55rem;color:var(--accent);transform:rotate(-90deg)}
    .export-progress circle:first-child{opacity:.24}
    #export-shade{position:fixed;z-index:2;inset:0;background:#0007}
    [data-drawer] #export-sidebar{inset-block-start:var(--bar);width:min(22rem,calc(100% - 2.75rem))}
    [data-drawer] :is(#export-pill,#export-pager){visibility:hidden}
    #export-close{font:inherit;color:inherit;background:var(--wash);border:0;border-radius:.4rem;
      min-height:2.75rem;padding:.3rem .65rem;cursor:pointer}
    @media(max-width:360px){#export-pill{gap:0;left:.3rem}#export-pager{gap:0;right:.3rem}
      #export-pill :is(button,[role=progressbar]),#export-pager a{width:2.3rem}}
    @media(max-width:310px){#export-pager{top:auto;bottom:.45rem}
      body:has(#export-pager:not([hidden])) #export-page{padding-bottom:var(--bar)}}
    .df-export-pop{position:fixed;z-index:6;max-width:calc(100% - 16px);pointer-events:none}
    .df-tooltip{box-sizing:border-box;max-width:min(320px,calc(100vw - 16px));padding:.4rem .7rem;
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
        throw folderError('Choose the documentation folder.');
      }
      return [path.slice(prefix.length), file];
    }));
    if (!paths.size) throw folderError('Choose the documentation folder.');
    var segments = fileKey(anchorURL, true)?.split('/') || [];
    var firstFolder = anchorURL?.host ? 3 : 1;
    var match = segments.findLastIndex(function (part, index) {
      return index >= firstFolder && part === name && paths.has(segments.slice(index + 1).join('/'));
    });
    if (match < 0) {
      throw folderError('The selected documentation folder does not contain the open DocForm page.');
    }
    var base = segments.slice(0, match + 1).join('/') + '/';
    function file(url, page) {
      var key = fileKey(url, page);
      return key?.startsWith(base) ? paths.get(key.slice(base.length)) : undefined;
    }

    return { file: file, readText: async function (url) {
      var item = file(address(url));
      if (!item) throw Error('The file was not found in the documentation folder.');
      return item.text();
    } };
  }

  function resourceFiles(folder) {
    var base = fileKey(address('.', DF._boot.entryURL));
    var bundle = DF._exportLibrary;
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
        report('missing-reference', value, 'The SVG drawing could not be read from the documentation folder.');
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
      if (node.matches(active) && !(page.interactive && node.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
          node.matches(declarations))) {
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
        if (/^on/.test(name) || ['nonce', 'autofocus', 'autoplay', 'ping', 'target', 'srcdoc', 'action', 'formaction', 'xml:base',
          'data-export-destination', 'data-export-disabled'].includes(name) ||
          ids && /^data-df-reader-step(?:s|-svg|-detail)$/.test(name)) {
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
    var packaged = new Set();
    for (var record of [...page.snapshot.styles, { text: tipCSS }]) {
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
    var headings = DF._exportReader.headings(page.document);
    // Match live navigation's anchor allocation order for pages rendered without navigation.
    for (var heading of headings.filter(function (node) { return node.localName !== 'h1'; })
      .concat(headings.filter(function (node) { return node.localName === 'h1'; }))) {
      if (!heading.id) heading.id = DF.util.uniqueSlug(DF.util.slug(heading.textContent), page.targets);
    }
  }

  async function interactivePage(input, page, folder, signal) {
    if (page.snapshot.committed?.imports.length) {
      throw Error('This page uses a committed import. Its rendered view is available in Reader mode.');
    }
    var source = new root.DOMParser().parseFromString(input.html, 'text/html');
    var entry = DF._boot.entryURL;
    var settings = Array.from(source.querySelectorAll('script[src]')).find(function (script) {
      return /(?:^|\/)docform\.js(?:[?#]|$)/.test(script.getAttribute('src'));
    });
    if (!settings) throw Error('This page has no DocForm entry script.');
    var base = address(source.querySelector('base[href]')?.getAttribute('href') || page.url, page.url);
    if (!base) throw Error('The page base URL is invalid.');
    var profile = settings.getAttribute('data-df-profile');
    var configNode = source.querySelector('script[data-df-page]');
    var config = {};
    if (configNode?.type === 'application/json') {
      config = JSON.parse(configNode.textContent);
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Invalid DocForm page configuration.');
    }
    var records = Array.from(source.querySelectorAll('style,link[rel~="stylesheet"][href]:not([disabled])'), function (node) {
      return { href: node.getAttribute('href'), text: node.textContent, media: node.media || '' };
    });
    var combined = records.some(function (record) {
      return record.href && fileKey(address(record.href, base)) === fileKey(address('docform.css', entry));
    });
    var plan = DF._boot.exportPlan(input.site || {}, config, profile, combined);
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
    source.querySelectorAll('[data-df-export-identity]').forEach(function (node) { node.removeAttribute('data-df-export-identity'); });
    for (var [host, identity] of DF._readerState.identify(source)) {
      host.setAttribute('data-df-export-identity', identities.length);
      identities.push(identity);
    }
    var live = copyPage({
      title: source.title, baseURL: base.href, body: source.body,
      htmlAttributes: Array.from(source.documentElement.attributes, function (attr) { return [attr.name, attr.value]; }),
      styles: records
    }, page);
    live.interactive = true;
    live.document.querySelectorAll('.df-sidebar,.df-nav-toggle,.df-controls,.df-pager,[data-df-export-control]')
      .forEach(function (node) { node.remove(); });
    live.document.documentElement.setAttribute('data-df-export-replay', '');
    live.document.querySelector('meta[http-equiv]').content = csp + "; script-src 'nonce-df-export-nonce'";
    for (var declaration of source.head.querySelectorAll(declarations + ':not([data-df-site])')) {
      // Import only the inert text and the data attributes used by DocForm.
      var script = create(live.document, 'script', declaration.textContent);
      script.type = declaration.type;
      for (var attr of declaration.attributes) {
        if (attr.name.startsWith('data-df-') && attr.name !== 'data-df-export-identity') {
          script.setAttribute(attr.name, attr.value);
        }
      }
      live.document.head.append(script);
    }
    if (input.site) {
      var manifest = create(live.document, 'script');
      manifest.type = 'application/json';
      manifest.setAttribute('data-df-site', '');
      live.document.head.append(manifest);
    }
    var data = [];
    if (plan.features.includes('data')) {
      for (var [name, item] of Object.entries(input.site?.assets?.data || {})) {
        if (typeof item?.output !== 'string' || !item.output.trim()) continue;
        signal?.throwIfAborted();
        var value = DF._pageSnapshot.wrappedAsset('data', name, await folder.readText(address(item.output, input.siteURL)));
        data.push([name, value]);
      }
    }
    signal?.throwIfAborted();
    var modules = plan.scripts.map(function (path) {
      if (!Object.hasOwn(DF._exportRuntime, path)) throw Error('A trusted DocForm module is missing: ' + path);
      return [path, DF._exportRuntime[path]];
    });
    live.payload = { url: page.url, base: base.href, siteURL: input.siteURL || page.url, entryURL: entry,
      profile: profile, site: input.site || null, combined: combined, features: plan.features,
      modules: modules, data: data, identities: identities, state: page.snapshot.committed || null };
    return live;
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
        var label = create(doc, 'span', node.title);
        label.className = 'export-group';
        item.append(label, children);
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

  function serialize(title, tree, active, pages, assets, interactive) {
    var doc = document.implementation.createHTMLDocument(title);
    doc.documentElement.lang = 'en';
    meta(doc, 'charset', 'utf-8');
    meta(doc, 'name', 'viewport').content = 'width=device-width,initial-scale=1';
    meta(doc, 'http-equiv', 'Content-Security-Policy').content =
      "object-src 'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline'";
    doc.head.append(create(doc, 'style', readerCSS));
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
    toc.append(contentsList(doc, tree, new Set(pages.map(function (page) { return page.id; }))));
    sidebar.append(close, toc);
    var pill = create(doc, 'div');
    pill.id = 'export-pill';
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Reading controls');
    var nav = create(doc, 'nav');
    nav.id = 'export-pager';
    nav.setAttribute('aria-label', 'Sequential pages');
    for (var id of ['export-previous', 'export-next']) {
      var link = create(doc, 'a');
      link.hidden = true;
      link.id = id;
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
    host.dataset.initial = pages.find(function (page) { return page.id === active; })?.id || pages[0].id;
    if (interactive) {
      var status = create(doc, 'p');
      status.id = 'export-status';
      status.hidden = true;
      status.setAttribute('role', 'status');
      host.append(status);
    }
    doc.body.append(pill, nav, edge, shade, sidebar, separator, host,
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
      pages: pages.map(function (page) {
        var record = { id: page.id, title: page.title, markup: page.markup };
        if (interactive) {
          var payload = page.payload;
          record.url = page.url;
          record.interactive = payload ? { ...payload,
            site: payload.site === null ? null : share(payload.site),
            modules: payload.modules.map(function ([path, code]) { return [path, share(code)]; }),
            data: payload.data.map(function ([name, value]) { return [name, share(value)]; })
          } : null;
        }
        return record;
      })
    }).replace(/</g, '\\u003c'));
    bundle.id = 'export-bundle';
    bundle.type = 'application/json';
    doc.body.append(bundle);
    var reader = DF._exportReader;
    var runtime = [reader.assemble, reader.figureSteps, reader.headings, reader.controls];
    if (interactive) runtime.push(reader.startInteractive, fileKey);
    doc.body.append(create(doc, 'script', '(' + reader.run.toString() + ')(' + runtime.map(String).join(',') + ');'));
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  async function build(folder, site, manifestCache, selected, options) {
    var signal = options?.signal;
    var interactive = options?.mode === 'interactive';
    signal?.throwIfAborted();
    var chosen = selection(site.tree, selected);
    if (!chosen.size) throw Error('Select at least one page.');
    if (!DF._exportLibrary) await DF._boot.loadExport('js/export-library.js');
    signal?.throwIfAborted();
    if (!DF._exportLibrary) throw Error('The DocForm library assets could not load. Check that the full DocForm library is installed.');
    if (interactive && !DF._exportRuntime) await DF._boot.loadExport('js/export-runtime.js');
    signal?.throwIfAborted();
    if (interactive && !DF._exportRuntime) throw Error('The trusted DocForm export modules could not load.');
    var issues = [];
    var pages = new Map();
    var resources = DF._exportResources.setup(resourceFiles(folder), signal);

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
        var input = { ...configForPage, html: html, url: page.url, readText: folder.readText };
        var snapshot = await DF._pageSnapshot.capture(input, { signal: signal, interactive: interactive });
        for (var item of snapshot.issues) report(item.code, item.target, item.message);
        var copied = copyPage(snapshot, page);
        copied.report = report;
        pages.set(page.key, copied);
        if (interactive) {
          try { copied.live = await interactivePage(input, copied, folder, signal); }
          catch (error) {
            signal?.throwIfAborted();
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
    for (var page of pages.values()) {
      await options?.onProgress?.({ phase: 'links', completed: completed, total: chosen.size,
        page: page.id, title: page.title });
      signal?.throwIfAborted();
      for (var output of [page, page.live].filter(Boolean)) {
        for (var link of output.document.body.querySelectorAll('a[href],area[href],a[*|href]')) {
          rewriteLink(link, link.hasAttribute('href') ? 'href' : 'xlink:href', output, pages, page.report);
        }
        var packaged = await styles(output, resources, page.report, signal);
        signal?.throwIfAborted();
        output.markup = pageMarkup(output);
        output.attributes.clear();
        output.document = null;
        if (output.payload) {
          output.payload.styles = packaged;
          output.payload.markup = output.markup;
        }
      }
    }
    await options?.onProgress?.({ phase: 'serialize', completed: completed, total: chosen.size });
    signal?.throwIfAborted();
    var included = Array.from(pages.values(), function (page) {
      return { id: page.id, title: page.snapshot.title || page.title, markup: page.markup,
        url: page.url, payload: page.live?.payload, view: page.snapshot.view, imports: page.snapshot.imports };
    });
    var blob = new Blob([serialize(site.title, site.tree, site.active, included, resources.assets, interactive)],
      { type: 'text/html;charset=utf-8' });
    signal?.throwIfAborted();
    var filename = site.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().replace(/[. ]+$/, '').slice(0, 120);
    options?.onProgress?.({ phase: 'done', completed: completed, total: chosen.size });
    return { blob: blob, bytes: blob.size, filename: (filename || 'DocForm export') + '.html', issues: issues,
      pages: included.map(function (page) {
        return { id: page.id, title: page.title, view: page.view, imports: page.imports,
          ...(interactive ? { interactive: !!page.payload } : {}) };
      }) };
  }

  async function prepare(files, options) {
    var signal = options?.signal;
    signal?.throwIfAborted();
    var url = address(DF._page);
    var folder = documentationFolder(files, url);
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
