const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isCurrent } = require('../scripts/build-export-library.js');

test('the shipped export bundle matches the library styles and fonts', () => {
  assert.ok(isCurrent(), 'Run node scripts/build-export-library.js to refresh the export bundle.');
});

function load(sourceDocs = new Map(), createExportDocument, DOMParser) {
  const document = {
    implementation: {
      createHTMLDocument(title) {
        if (title && createExportDocument) return createExportDocument(title);
        return {
          documentElement: {},
          get title() { return sourceDocs.get(this.documentElement.innerHTML)?.title || ''; },
          querySelector(selector) {
            const source = sourceDocs.get(this.documentElement.innerHTML);
            return selector === 'script[data-df-site]' && source?.manifest ?
              { getAttribute: () => source.manifest } : null;
          }
        };
      }
    }
  };
  const context = vm.createContext({ URL, TextEncoder, atob, btoa, Blob, document, DOMParser });
  context.window = context;
  function loadScript(path) {
    vm.runInContext(fs.readFileSync(new URL('../docform/' + path, 'file://' + __filename), 'utf8'),
      context, { filename: path });
  }
  context.DocForm = {
    _boot: { entryURL: 'file:///opt/shared/DocForm%20library/docform.js', loadExport: loadScript },
    _pageSnapshot: { capture() { throw new Error('Unexpected page capture.'); } }
  };
  for (const path of ['js/core.js', 'tools/asset-build.js', 'js/export-resources.js',
    'js/export-reader.js', 'js/export-package.js']) {
    loadScript(path);
  }
  return context.DocForm;
}

function file(path, text) {
  return { webkitRelativePath: path, text: async () => text };
}

function assembleValue(runtime, resources, parts, css = false) {
  return runtime._exportReader.assemble([[css, parts]], resources.assets).replaceAll('&quot;', '"');
}

test('prepares nested manifest groups and embeds assets from a separately installed library', async () => {
  const manifest = {
    title: 'Site',
    pages: [{
      title: 'Part', path: '../index.html', pages: [
        { title: 'Nested', pages: ['../guide/Chapter%20%231.html', '../guide/missing.html'] },
        '../guide/Chapter%20%231.html#again', 'https://example.com/outside'
      ]
    }],
    glossaryPage: '../guide/glossary/'
  };
  const docs = new Map([['home', { title: 'Home', manifest: 'assets/site.js' }]]);
  const runtime = load(docs);
  runtime._page = 'file:///work/project/docs/index.html#current';
  runtime._site = { provided: true, base: 'file:///work/project/docs/assets/site.js' };
  const files = [
    file('docs/index.html', 'home'),
    file('docs/assets/site.js', 'window.DocFormSite = ' + JSON.stringify(manifest) + ';'),
    file('docs/guide/Chapter #1.html', 'chapter'),
    file('docs/guide/glossary/index.html', 'glossary')
  ];
  const prepared = await runtime._exportPackage.prepare(files);
  assert.equal(runtime._exportLibrary, undefined);
  assert.equal(prepared.title, 'Site');
  assert.equal(prepared.active, 'page-1');
  const [part, glossary] = prepared.tree;
  const [home, nested] = part.children;
  assert.equal(part.title, 'Part');
  assert.equal(home.id, prepared.active);
  assert.deepEqual(Array.from(nested.children, page => [page.id, page.available]), [
    ['page-2', true], ['page-3', false]
  ]);
  assert.equal(glossary.url, 'file:///work/project/docs/guide/glossary/index.html');
  const setup = runtime._exportResources.setup;
  let resources;
  runtime._exportResources.setup = folder => {
    assert.equal(folder.file(new URL(runtime._page)), files[0]);
    assert.equal(folder.file(new URL('file:///different/css/base.css')), undefined);
    return resources = setup(folder);
  };
  const captures = [];
  runtime._pageSnapshot.capture = async page => {
    captures.push(page.url);
    throw new Error('Capture unavailable.');
  };
  await assert.rejects(prepared.build([part.id]), error => {
    assert.equal(error.issues.filter(issue => issue.code === 'unavailable-page').length, 3);
    return true;
  });
  assert.deepEqual(captures, [
    'file:///work/project/docs/index.html#current', 'file:///work/project/docs/guide/Chapter%20%231.html'
  ]);
  const issues = [];
  const report = (...issue) => issues.push(issue);
  const entry = runtime._boot.entryURL;
  await resources.stylesheet('docform.css', entry, report);
  await resources.stylesheet('vendor/katex/katex.min.css', entry, report);
  const font = fs.readFileSync(new URL('../docform/vendor/katex/fonts/KaTeX_Main-Regular.woff2',
    'file://' + __filename));
  assert.ok(resources.assets.includes('data:font/woff2;base64,' + font.toString('base64')));
  assert.deepEqual(issues, []);
  await assert.rejects(prepared.build([nested.children[1].id]), error => {
    assert.equal(error.issues[0].code, 'unavailable-page');
    return true;
  });
  await assert.rejects(runtime._exportPackage.prepare(files.map(item =>
    file(item.webkitRelativePath.replace('docs/', 'wrong/'), 'home'))),
  error => error.folder === 'documents' && /does not contain the open DocForm page/.test(error.message));
});

test('a standalone page supplies its own title and single selectable page', async () => {
  const runtime = load(new Map([['only', { title: 'An example' }]]));
  runtime._page = 'file:///work/project/An%20example.html';
  runtime._site = { provided: false };
  const prepared = await runtime._exportPackage.prepare([file('project/An example.html', 'only')]);
  assert.equal(prepared.title, 'An example');
  assert.equal(prepared.tree.length, 1);
  assert.equal(prepared.tree[0].id, prepared.active);
  await assert.rejects(prepared.build([]), /Select at least one page/);
});

test('a Windows network-share folder resolves pages on the same host only', async () => {
  const runtime = load(new Map([['home', { title: 'Home', manifest: 'site.js' }]]));
  runtime._page = 'file://wsl.localhost/Ubuntu/project/index.html';
  runtime._site = { provided: true, base: 'file://wsl.localhost/Ubuntu/project/site.js' };
  const manifest = { pages: ['chapter.html', 'file://other-host/Ubuntu/project/chapter.html'] };
  const prepared = await runtime._exportPackage.prepare([
    file('project/index.html', 'home'),
    file('project/site.js', 'window.DocFormSite = ' + JSON.stringify(manifest) + ';'),
    file('project/chapter.html', 'chapter')
  ]);
  assert.deepEqual(Array.from(prepared.tree, page => page.available), [true, false, true]);
  assert.equal(prepared.tree[2].id, prepared.active);
});

test('nested CSS imports keep conditions and embed resources relative to each source file', async () => {
  const runtime = load();
  const files = new Map([
    ['/site/css/outer.css', new Blob(['@import /* keep */ "./nested/inner.css" layer(print) print;'])],
    ['/site/css/nested/inner.css', new Blob([
      '@import "../outer.css"; @font-face {font-family:Sample;src:url("../../font.woff2")}' +
      '.example{background: image-set("../../My\\20 image.png" 1x, url(https://example.com/out.png) 2x);' +
      'mask:url(#paint);content:"url(not-a-resource.png)"} /* url(also-not-a-resource.png) */'
    ])],
    ['/site/font.woff2', new Blob(['font'])],
    ['/site/My%20image.png', new Blob(['image'])]
  ]);
  const issues = [];
  const resources = runtime._exportResources.setup({ file: url => files.get(url.pathname) });
  const sheet = await resources.stylesheet('../css/outer.css', 'file:///site/docs/page.html',
    (...args) => issues.push(args));
  const css = Buffer.from(assembleValue(runtime, resources, sheet).split(',')[1], 'base64').toString();
  assert.match(css, /layer\(print\) print/);
  const bytes = /data:text\/css;charset=utf-8;base64,([^"]+)/.exec(css)[1];
  const embedded = Buffer.from(bytes, 'base64').toString();
  assert.match(embedded, /data:font\/woff2;base64,Zm9udA==/);
  assert.match(embedded, /data:image\/png;base64,aW1hZ2U=/);
  assert.match(embedded, /mask:url\("#paint"\)/);
  assert.match(embedded, /"url\(not-a-resource\.png\)"/);
  assert.doesNotMatch(embedded, /example\.com/);
  assert.deepEqual(issues.map(item => item[0]), ['stylesheet-cycle', 'unsupported-resource']);
});

test('responsive image candidates preserve data URLs and descriptors while omitting missing files', async () => {
  const runtime = load();
  const files = new Map([
    ['/site/large.png', new Blob(['two'])],
    ['/site/copy.png', new Blob(['two'])]
  ]);
  const resources = runtime._exportResources.setup({ file: url => files.get(url.pathname) });
  const issues = [];
  const result = await resources.srcset('data:image/png;base64,b25l 1x, large.png 2x, missing.png 3x',
    'file:///site/index.html', (...args) => issues.push(args));
  assert.equal(assembleValue(runtime, resources, result), 'data:image/png;base64,b25l 1x, data:image/png;base64,dHdv 2x');
  assert.equal(issues[0][0], 'missing-resource');
  const shared = await resources.srcset('copy.png#first 1x, data:image/png,%74wo#second 2x',
    'file:///site/index.html', (...args) => issues.push(args));
  assert.equal(assembleValue(runtime, resources, shared),
    'data:image/png;base64,dHdv#first 1x, data:image/png;base64,dHdv#second 2x');
  assert.equal(resources.assets.length, 2);
  const remapped = await resources.css('fill:url(#paint); stroke:url(#missing)', 'file:///site/drawing.svg',
    (...args) => issues.push(args), new Map([['paint', 'export-paint']]));
  assert.equal(assembleValue(runtime, resources, remapped, true), 'fill:url("#export-paint"); stroke:url("data:,")');
});

test('a cancelled two-page export rebuilds a shared bundle and reconstructs each page', async t => {
  function element(tag, text = '') {
    const attributes = new Map();
    return {
      children: [], dataset: {}, localName: tag, textContent: text,
      matches(selectors) { return selectors.split(',').includes(tag); },
      querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
        if (selector === '*') return descendants;
        if (selector.startsWith('[data-df-source]:not(')) return descendants.filter(child =>
          child.localName !== 'script' && child.localName !== 'pre' && child.hasAttribute('data-df-source') ||
          child.hasAttribute('data-df-dropzone') && child.hasAttribute('data-df-target-source'));
        if (selector.startsWith('script:not([src])[data-df-source]')) return descendants.filter(child =>
          child.localName === 'pre' && child.hasAttribute('data-df-source'));
        if (selector === '[data-df-more-id]') return descendants.filter(child => child.hasAttribute('data-df-more-id'));
        if (selector === '[id],a[name]') return descendants.filter(child => child.id);
        if (selector === 'h1,h2,h3') return descendants.filter(child => /^h[123]$/.test(child.localName));
        if (selector.startsWith('a[href],area[href]')) return descendants.filter(child => child.localName === 'a' && child.href);
        return [];
      },
      closest() { return this.getAttribute('data-df-no-outline') === 'true' ? this : null; },
      contains: () => true,
      hasAttribute(name) { return attributes.has(name); },
      setAttribute(name, value) { attributes.set(name, { name, value: String(value) }); },
      getAttribute(name) { return attributes.get(name)?.value ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      removeAttributeNode(attr) { attributes.delete(attr.name); },
      getAttributeNode(name) { return attributes.get(name); },
      get attributes() { return attributes.values(); },
      set id(value) { this.setAttribute('id', value); },
      get id() { return this.getAttribute('id') || ''; },
      set href(value) { this.setAttribute('href', value); },
      get href() { return this.getAttribute('href'); },
      set hidden(value) { if (value) this.setAttribute('hidden', ''); else attributes.delete('hidden'); },
      set className(value) { this.setAttribute('class', value); },
      set type(value) { this.setAttribute('type', value); },
      set content(value) { this.setAttribute('content', value); },
      set rel(value) { this.setAttribute('rel', value); },
      set media(value) { this.setAttribute('media', value); },
      append(...children) { this.children.push(...children); },
      prepend(child) { this.children.unshift(child); },
      get outerHTML() {
        const attrs = Array.from(attributes.values(), attr =>
          ` ${attr.name}="${attr.value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join('');
        const children = this.content?.children || this.children;
        return `<${tag}${attrs}>${this.textContent}${children.map(child => child.outerHTML).join('')}</${tag}>`;
      }
    };
  }
  function exportDocument(title) {
    const html = element('html');
    const head = element('head');
    const body = element('body');
    body.replaceWith = replacement => {
      html.children[1] = replacement;
      doc.body = replacement;
    };
    head.append(element('title', title));
    html.append(head, body);
    const doc = { documentElement: html, head, body, createElement: element, importNode(node) {
      [node, ...node.querySelectorAll('*')].forEach(child => { child.ownerDocument = doc; });
      return node;
    }, getElementById: id => doc.body.querySelectorAll('[id],a[name]').find(node => node.id === id),
    querySelector: selector => selector === 'meta[http-equiv]' ?
      head.children.find(node => node.getAttribute('http-equiv')) : null,
    querySelectorAll: selector => doc.body.querySelectorAll(selector) };
    return doc;
  }
  function asset(path, bytes) {
    return Object.assign(new Blob([bytes]), { webkitRelativePath: 'project/' + path });
  }
  function decodeSheet(url) {
    return Buffer.from(url.split(',')[1], 'base64').toString();
  }
  const runtime = load(new Map([
    ['home', { title: 'An example', manifest: 'site.js' }],
    ['nested', { title: 'Nested', manifest: '../site.js' }]
  ]), exportDocument, class {
    parseFromString(html) {
      const links = html === 'home' ? 'nested/index.html#caf%C3%A9%2Fmore' : '../index.html';
      const doc = exportDocument('Interactive input');
      const entry = element('script');
      entry.setAttribute('src', '/local/docform.js');
      const link = element('a', 'Switch pages');
      link.href = links;
      const heading = element('h2', 'Café');
      heading.id = 'café/more';
      const custom = element('script', 'doNotPackageThisAuthorScript()');
      custom.remove = () => doc.body.children.splice(doc.body.children.indexOf(custom), 1);
      doc.body.append(heading, link, custom);
      const consumer = element('figure');
      consumer.id = 'runs-figure';
      consumer.setAttribute('data-df-chart', 'scatter');
      consumer.setAttribute('data-df-source', html === 'home' ? 'runs' : 'alias');
      const chartSpec = element('script', '{"x":"Run","y":"Value","brush":true}');
      chartSpec.type = 'application/json';
      chartSpec.namespaceURI = 'http://www.w3.org/1999/xhtml';
      const matchesSpec = chartSpec.matches;
      chartSpec.matches = selector => selector.startsWith('script:not([src])') || matchesSpec(selector);
      consumer.append(chartSpec);
      const inline = element('pre', 'id,value\ninline-record,7');
      inline.setAttribute('data-df-source', 'inline');
      const inlineView = element('div');
      inlineView.setAttribute('data-df-source', 'inline');
      doc.body.append(consumer, inline, inlineView);
      if (html === 'home') {
        const panel = element('div');
        panel.className = 'df-card-panel';
        const detail = element('section');
        detail.id = 'alternate-card';
        const figure = element('figure');
        const declaration = element('script', '{"steps":[{"key":"draw","actions":[]}]}');
        declaration.setAttribute('data-df-animation', '');
        declaration.type = 'application/json';
        declaration.namespaceURI = 'http://www.w3.org/1999/xhtml';
        const matches = declaration.matches;
        declaration.matches = selector => selector.startsWith('script:not([src])') || matches(selector);
        figure.append(declaration);
        const term = element('span', 'An annotated term');
        term.setAttribute('data-df-more-id', 'term-detail');
        const template = element('template');
        template.id = 'term-detail';
        Object.defineProperty(template, 'content', { value: element('fragment') });
        const image = element('img');
        image.setAttribute('src', 'detail.png');
        image.setAttribute('onload', 'sourceHandler()');
        const detailLink = element('a', 'Read the section');
        detailLink.href = links;
        template.content.append(image, detailLink);
        detail.append(figure, term, template);
        panel.append(detail);
        doc.body.append(panel);
        const pipeline = element('figure');
        pipeline.id = 'flow';
        pipeline.className = 'df-pipeline';
        const edge = element('a', 'Next block');
        edge.className = 'df-pipe-link';
        edge.href = '#flow-2';
        const matchesEdge = edge.matches;
        edge.matches = selector => selector === '.df-pipe-link' || matchesEdge(selector);
        edge.closest = selector => selector === '.df-pipeline' ? pipeline : null;
        const blocks = element('ol');
        blocks.className = 'df-pipe-blocks';
        const first = element('li');
        first.className = 'df-pipe-block';
        first.append(edge);
        const second = element('li', 'An unnamed block');
        second.className = 'df-pipe-block';
        blocks.append(first, second);
        const details = element('div');
        details.className = 'df-detail-pane';
        const overview = element('section', 'Pipeline overview');
        overview.setAttribute('data-df-key', 'flow-1');
        const alternate = element('section');
        alternate.setAttribute('data-df-key', 'flow-2');
        const alternateImage = element('img');
        alternateImage.setAttribute('src', 'detail.png');
        const alternateLink = element('a', 'Read the pipeline detail');
        alternateLink.href = links;
        alternate.append(alternateImage, alternateLink);
        details.append(overview, alternate);
        pipeline.append(blocks, details);
        doc.body.append(pipeline);
      }
      doc.querySelectorAll = selector => selector === 'script[src]' ? [entry] : doc.body.querySelectorAll(selector);
      return doc;
    }
  });
  runtime._boot.exportPlan = () => ({
    features: ['base', 'tabs', 'data'], styles: ['css/tabs.css'],
    scripts: ['docform.js', 'js/core.js', 'js/reader-state.js', 'js/tabs.js']
  });
  runtime._readerState = { identify: () => new Map() };
  runtime._page = 'file:///work/project/index.html';
  runtime._site = { provided: true, base: 'file:///work/project/site.js' };
  const sharedCSS = '@font-face{font-family:Shared;src:url(font.woff2)} p{color:blue}';
  const overrideCSS = 'p{color:red;background:url(image.png)}';
  let css = 'p::before{content:"cancelled"}';
  let stepCount = 0;
  let committedImport = false;
  let staleImport = false;
  let revision = 1;
  const importText = 'id,name\n1,private full record café <script>';
  runtime._boot.loadExport('js/page-snapshot.js');
  const authoredText = 'id,name\n1,authored record';
  const wrapper = (name, path) => 'Object.defineProperty(window.DocFormData || (window.DocFormData = Object.create(null)), ' +
    JSON.stringify(name) + ', { configurable: true, enumerable: true, writable: true, value: ' +
    JSON.stringify({ format: 'docform-data', version: 1, type: 'csv', text: authoredText, metadata: { output: path } }) + ' });';
  runtime._pageSnapshot.capture = async (page, options) => {
    const nested = page.url.endsWith('/nested/index.html');
    const body = element('body');
    const title = element('h1', 'Repeat');
    const section = element('h2', 'Repeat');
    const excluded = element('h3', 'Outline exclusion');
    excluded.setAttribute('data-df-no-outline', 'true');
    const crossLink = element('a', nested ? 'Back to home' : 'Go to café');
    crossLink.href = nested ? '../index.html#repeat-2' : 'nested/index.html#caf%C3%A9%2Fmore';
    const accented = element('h2', 'Café');
    accented.id = 'café/more';
    body.append(title, section, excluded, crossLink);
    if (nested) body.append(accented);
    const image = element('img');
    image.setAttribute('src', (nested ? '../copy.png' : 'image.png') + '#view&detail');
    image.setAttribute('srcset', 'image.png 2x, missing.png 3x');
    image.setAttribute('style', 'background:url(image.png); --marker:"</script> café"');
    image.setAttribute('onload', 'sourceHandler()');
    const svg = element('svg');
    const svgImage = element('image');
    svgImage.namespaceURI = 'http://www.w3.org/2000/svg';
    svgImage.setAttribute('href', 'image.png#svg-view');
    svg.append(svgImage);
    const script = element('script', 'sourceScript()');
    script.remove = () => body.children.splice(body.children.indexOf(script), 1);
    body.append(element('p', 'df-export-asset-0-ref &lt;/script&gt; café'), image, svg, script);
    if (committedImport && nested) body.append(element('p', 'Rendered chart data from import'));
    if (stepCount) {
      const options = Array.from({ length: stepCount }, (_, i) => [`step-${i}`, `Step ${i + 1}`, [i % 2], '']);
      const controls = element('div', 'Step 1');
      controls.setAttribute('data-df-reader-steps', JSON.stringify([0, 0, options]));
      const path = element('path');
      path.setAttribute('d', 'M 0 0' + ' l 2 2'.repeat(300));
      path.setAttribute('data-df-reader-step-svg', JSON.stringify([0, options.map((_, i) => [i, '.opacity', String(i % 2)])]));
      svg.append(path);
      const alternate = element('div');
      alternate.setAttribute('hidden', '');
      alternate.setAttribute('data-df-reader-step-detail', '0:1');
      const detailImage = element('img');
      detailImage.setAttribute('src', nested ? '../copy.png' : 'image.png');
      alternate.append(detailImage);
      body.append(controls, alternate);
    }
    return {
      title: 'An example', issues: staleImport && nested ? [{ code: 'saved-import', target: 'shared', message: 'stale' }] : [],
      htmlAttributes: [], body, imports: [],
      committed: options.interactive ? {
        views: [['tabs', { value: nested ? 'results' : 'overview' }]],
        imports: committedImport && nested ? [['shared', { name: 'private.csv', revision: [revision],
          bytes: Buffer.byteLength(importText), target: '["source","alias"]' }]] : []
      } : undefined,
      importPayloads: new Map([['shared', importText]]),
      styles: [{ href: 'base.css' }, { text: overrideCSS }, { text: css, media: 'print' }]
    };
  };
  const signal = new AbortController();
  const prepared = await runtime._exportPackage.prepare([
    file('project/index.html', 'home'),
    file('project/nested/index.html', 'nested'),
    file('project/omitted.html', 'omitted'),
    file('project/site.js', 'window.DocFormSite = {"pages":[{"title":"Included group","pages":["index.html","nested/index.html"]},{"title":"Omitted group","pages":["omitted.html"]}],"assets":{"data":{"runs":{"output":"runs.js"},"alias":{"output":"alias.js"},"omitted":{"output":"unused.js"}}}};'),
    asset('runs.js', wrapper('runs', 'runs.js')),
    asset('alias.js', wrapper('alias', 'alias.js')),
    asset('base.css', sharedCSS),
    asset('nested/base.css', sharedCSS),
    asset('font.woff2', 'font bytes'),
    asset('nested/font.woff2', 'font bytes'),
    asset('image.png', 'shared image'),
    asset('copy.png', 'shared image'),
    asset('nested/image.png', 'local image'),
    asset('detail.png', 'detail image')
  ]);
  const selected = prepared.tree[0].children.map(page => page.id);
  const phases = [];
  await assert.rejects(prepared.build(selected, { signal: signal.signal, onProgress(event) {
    phases.push(event.phase);
    if (event.phase === 'serialize') signal.abort();
  } }), { name: 'AbortError' });
  assert.deepEqual(phases, ['capture', 'capture', 'assets', 'assets', 'links', 'links', 'serialize']);

  css = 'p::before{content:"</script> café"}';
  const result = await prepared.build(selected);
  const html = await result.blob.text();
  assert.equal(result.bytes, result.blob.size);
  assert.equal(result.bytes, Buffer.byteLength(html));
  const serializedBundle = /<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(html)[1];
  assert.doesNotMatch(serializedBundle, /</);
  const shell = html.split('<script id="export-bundle"')[0];
  assert.match(shell, /id="export-pill"[^>]*aria-label="Reading controls"/);
  assert.match(shell, /id="export-resize"[^>]*role="separator"/);
  assert.match(shell, /Included group/);
  assert.doesNotMatch(shell, /Omitted group|Outline exclusion|Café|<details/);
  const runtimeScript = /<script>\((function reader.*?)<\/script>/s.exec(html)[1];
  assert.doesNotThrow(() => new vm.Script('(' + runtimeScript));
  const bundle = JSON.parse(serializedBundle);
  assert.equal(bundle.pages.length, 2);
  assert.equal(bundle.assets.length, 8);
  const binaryAssets = bundle.assets.filter(value => typeof value === 'string');
  assert.deepEqual(binaryAssets, [
    'data:image/png;base64,' + Buffer.from('shared image').toString('base64'),
    'data:image/png;base64,' + Buffer.from('local image').toString('base64'),
    'data:font/woff2;base64,' + Buffer.from('font bytes').toString('base64')
  ]);
  assert.doesNotMatch(html, /cancelled|sourceScript|sourceHandler/);
  assert.deepEqual(Array.from(result.issues, issue => [issue.page, issue.code, issue.target]), [
    [selected[0], 'missing-resource', 'missing.png'],
    [selected[1], 'missing-resource', 'missing.png']
  ]);
  for (const [index, page] of bundle.pages.entries()) {
    const frame = runtime._exportReader.assemble(page.markup, bundle.assets);
    const [sharedImage, localImage, font] = binaryAssets;
    const image = index === 0 ? sharedImage : localImage;
    const sheets = [...frame.matchAll(/href="(data:text\/css[^"]+)"( media="print")?/g)];
    assert.equal(sheets.length, 4);
    assert.equal(decodeSheet(sheets[0][1]), sharedCSS.replace('font.woff2', `"${font}"`));
    assert.equal(decodeSheet(sheets[1][1]), overrideCSS.replace('image.png', `"${image}"`));
    assert.equal(decodeSheet(sheets[2][1]), css);
    assert.equal(sheets[2][2], ' media="print"');
    assert.match(decodeSheet(sheets[3][1]), /^\.df-export-pop/);
    assert.ok(frame.includes(`src="${sharedImage}#view&amp;detail"`));
    assert.ok(frame.includes(`srcset="${image} 2x"`));
    assert.ok(frame.includes(`<image href="${image}#svg-view"`));
    assert.ok(frame.includes(`style="background:url(&quot;${image}&quot;); --marker:&quot;&lt;/script&gt; café&quot;"`));
    assert.ok(frame.includes('df-export-asset-0-ref &lt;/script&gt; café'));
    assert.match(frame, /<h1 id="repeat-2">Repeat<\/h1><h2 id="repeat">Repeat<\/h2>/);
    assert.match(frame, /<h3 data-df-no-outline="true">Outline exclusion<\/h3>/);
    assert.ok(frame.includes('href="' + (index === 0 ? '#page-2/caf%C3%A9%2Fmore' : '#page-1/repeat-2') + '"'));
    assert.equal(runtime._exportReader.assemble(page.markup, bundle.assets), frame);
  }
  assert.equal(await (await prepared.build(selected)).blob.text(), html);
  const one = await prepared.build([selected[0]]);
  const oneHTML = await one.blob.text();
  assert.equal(one.bytes, Buffer.byteLength(oneHTML));
  assert.ok(one.bytes < result.bytes);
  assert.equal(/<script>\((function reader.*?)<\/script>/s.exec(oneHTML)[1], runtimeScript);
  t.diagnostic(`Reader fixture: ${one.bytes} bytes for one page, ${result.bytes} bytes for two, with identical shell JavaScript.`);
  const sizes = [];
  for (const count of [2, 8, 32]) {
    stepCount = count;
    const measured = await prepared.build(selected);
    sizes.push(measured.bytes);
    const measuredHTML = await measured.blob.text();
    assert.equal(measured.bytes, Buffer.byteLength(measuredHTML));
    const serialized = /<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(measuredHTML)[1];
    const measuredBundle = JSON.parse(serialized);
    assert.equal(measuredBundle.assets.length, bundle.assets.length);
    for (const page of measuredBundle.pages) {
      const frame = runtime._exportReader.assemble(page.markup, measuredBundle.assets);
      assert.equal([...frame.matchAll(/<svg>/g)].length, 1);
      assert.equal([...frame.matchAll(/<path /g)].length, 1);
      assert.match(frame, /hidden="" data-df-reader-step-detail="0:1"><img src="data:image\/png;base64,/);
    }
  }
  const bytesPerStep = Math.round((sizes[2] - sizes[0]) / 60);
  assert.ok(bytesPerStep > 0 && bytesPerStep < 500, `${bytesPerStep} bytes per step`);
  t.diagnostic(`Two-page fixture at 2, 8 and 32 steps per page: ${sizes.join(', ')} bytes (${bytesPerStep} bytes per added step).`);

  stepCount = 0;
  const cancelInteractive = new AbortController();
  await assert.rejects(prepared.build(selected, { mode: 'interactive', signal: cancelInteractive.signal,
    onProgress(event) { if (event.phase === 'links') cancelInteractive.abort(); }
  }), { name: 'AbortError' });
  const interactive = await prepared.build(selected, { mode: 'interactive' });
  const interactiveHTML = await interactive.blob.text();
  const readBundle = html => JSON.parse(/<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(html)[1]);
  const packed = readBundle(interactiveHTML);
  assert.equal(packed.version, 1);
  assert.equal(packed.mode, 'interactive');
  assert.ok(packed.pages.every(page => page.interactive), JSON.stringify(interactive.issues));
  assert.equal(packed.shared.length, 7); // Manifest, four scripts, and two dataset revisions.
  assert.deepEqual(packed.pages[0].interactive.inlineData, packed.pages[1].interactive.inlineData);
  assert.equal(packed.shared[packed.pages[0].interactive.inlineData[0]], 'id,value\ninline-record,7');
  assert.equal(packed.pages[0].interactive.data[0][1], packed.pages[1].interactive.data[0][1]);
  assert.deepEqual(packed.pages.map(page => page.interactive.data.map(([name]) => name)), [['runs'], ['alias']]);
  assert.deepEqual(packed.pages[0].interactive.modules, packed.pages[1].interactive.modules);
  assert.equal(packed.pages[0].interactive.site, packed.pages[1].interactive.site);
  assert.equal(packed.pages[1].interactive.state.views[0][1].value, 'results');
  assert.equal(packed.pages[1].interactive.url, 'file:///work/project/nested/index.html');
  assert.deepEqual(packed.pages[0].interactive.styles, ['css/tabs.css']);
  assert.doesNotMatch(interactiveHTML, /doNotPackageThisAuthorScript|sourceScript|sourceHandler/);
  assert.doesNotThrow(() => new vm.Script('(' + /<script>\((function reader.*?)<\/script>/s.exec(interactiveHTML)[1]));
  const liveHTML = runtime._exportReader.assemble(packed.pages[0].interactive.markup, packed.assets);
  assert.match(liveHTML, /data-df-chart="scatter" data-df-source="runs"><script type="application\/json">\{"x":"Run"/);
  assert.match(liveHTML, /class="df-pipe-link" href="#flow-2">Next block/);
  assert.ok(!interactive.issues.some(issue => issue.target === '#flow-2'));
  assert.match(liveHTML, /data-df-key="flow-2"><img src="data:image\/png;base64,ZGV0YWlsIGltYWdl"[^>]*>.*?#page-2\/caf%C3%A9%2Fmore[^>]*>Read the pipeline detail/);
  assert.match(liveHTML, /script-src 'nonce-df-export-nonce'/);
  assert.match(liveHTML, /href="#page-2\/caf%C3%A9%2Fmore"/);
  assert.match(liveHTML, /<section id="alternate-card"><figure><script data-df-animation="" type="application\/json">\{"steps":/);
  assert.match(liveHTML, /<template id="term-detail"><img src="data:image\/png;base64,ZGV0YWlsIGltYWdl"/);
  assert.match(liveHTML, /<a href="#page-2\/caf%C3%A9%2Fmore" data-export-destination="">Read the section<\/a><\/template>/);
  const interactiveOne = await prepared.build([selected[0]], { mode: 'interactive' });
  assert.equal(interactive.bytes, Buffer.byteLength(interactiveHTML));
  assert.deepEqual(readBundle(await interactiveOne.blob.text()).shared, packed.shared);
  const fallbackBytes = packed.pages.reduce((sum, page) =>
    sum + Buffer.byteLength(JSON.stringify(page.markup).replace(/</g, '\\u003c')), 0);
  t.diagnostic(`Interactive fixture: ${interactiveOne.bytes} bytes for one page, ${interactive.bytes} for two, ` +
    `including ${fallbackBytes} bytes of fallback markup for both pages. Shared payloads are identical.`);

  committedImport = true;
  const fallback = await prepared.build(selected, { mode: 'interactive' });
  const fallbackHTML = await fallback.blob.text();
  assert.equal(readBundle(fallbackHTML).pages[1].interactive, null);
  assert.doesNotMatch(fallbackHTML, /private\.csv/);
  assert.doesNotMatch(fallbackHTML, /private full record/);
  assert.match(fallbackHTML, /Rendered chart data from import/);
  assert.ok(fallback.issues.some(issue => issue.page === selected[1] && issue.code === 'interactive-fallback'));
  const [choice] = fallback.importChoices;
  assert.equal(choice.selected, false);
  assert.equal(choice.available, true);
  assert.equal(choice.bytes, Buffer.byteLength(importText));
  assert.deepEqual(Array.from(choice.consumers), ['#runs-figure']);
  const accepted = await prepared.build(selected, { mode: 'interactive', includeImports: [choice.id] });
  const acceptedHTML = await accepted.blob.text();
  const acceptedBundle = readBundle(acceptedHTML);
  assert.equal(accepted.importChoices[0].included, true);
  assert.equal(acceptedBundle.shared[acceptedBundle.pages[1].interactive.imports[0][1]], importText);
  assert.equal(accepted.bytes, Buffer.byteLength(acceptedHTML));
  assert.equal(fallback.bytes, Buffer.byteLength(fallbackHTML));
  assert.ok(accepted.bytes > fallback.bytes);
  const revoked = await prepared.build(selected, { mode: 'interactive', includeImports: [] });
  assert.equal(await revoked.blob.text(), fallbackHTML);
  revision++;
  const changed = await prepared.build(selected, { mode: 'interactive', includeImports: [choice.id] });
  assert.equal(changed.importChoices[0].selected, false);
  assert.equal(await changed.blob.text(), fallbackHTML);
  staleImport = true;
  const stale = await prepared.build(selected, { mode: 'interactive', includeImports: [changed.importChoices[0].id] });
  assert.equal(stale.importChoices[0].available, false);
  assert.doesNotMatch(await stale.blob.text(), /private full record/);
  t.diagnostic(`Consent preview: ${choice.bytes} import bytes, ${fallback.bytes} export bytes without inclusion, ${accepted.bytes} with inclusion.`);
});

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
    interactive: { url: 'file:///source/' + id + '.html', base: 'file:///source/', markup: ["'nonce-df-export-nonce'"],
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
  first.dispatchEvent(new Event('load'));
  assert.equal(startups[0].saved.choice, 'exported page-1');

  function go(hash) {
    location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
    current.dispatchEvent(new Event('load'));
  }

  go('#page-2');
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
