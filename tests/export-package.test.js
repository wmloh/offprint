const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(sourceDocs = new Map(), createExportDocument) {
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
  const context = vm.createContext({ URL, TextEncoder, atob, btoa, Blob, document });
  context.window = context;
  context.DocForm = {
    _boot: { entryURL: 'file:///work/project/docform/docform.js' },
    _pageSnapshot: { capture() { throw new Error('Unexpected page capture.'); } }
  };
  for (const path of ['js/core.js', 'tools/asset-build.js', 'js/export-resources.js',
    'js/export-reader.js', 'js/export-package.js']) {
    vm.runInContext(fs.readFileSync(new URL('../docform/' + path, 'file://' + __filename), 'utf8'),
      context, { filename: path });
  }
  return context.DocForm;
}

function file(path, text) {
  return { webkitRelativePath: path, text: async () => text };
}

function assembleValue(runtime, resources, parts, css = false) {
  return runtime._exportReader.assemble([[css, parts]], resources.assets).replaceAll('&quot;', '"');
}

const library = [file('docform/docform.js', ''), file('docform/css/base.css', 'base')];

test('prepares nested manifest groups in reading order and marks missing pages', async () => {
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
    file('project/docs/index.html', 'home'),
    file('project/docs/assets/site.js', 'window.DocFormSite = ' + JSON.stringify(manifest) + ';'),
    file('project/docs/guide/Chapter #1.html', 'chapter'),
    file('project/docs/guide/glossary/index.html', 'glossary')
  ];
  await assert.rejects(runtime._exportPackage.prepare(files), error => {
    assert.match(error.message, /Choose the DocForm library folder/);
    return error.folder === 'library';
  });
  await assert.rejects(runtime._exportPackage.prepare(files, {
    library: [file('other/docform.js', '')]
  }), error => error.folder === 'library' && /DocForm library used by this page/.test(error.message));
  const prepared = await runtime._exportPackage.prepare(files, { library });
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
  runtime._exportResources.setup = folder => {
    assert.equal(folder.file(new URL('file:///work/project/docform/css/base.css')), library[1]);
    assert.equal(folder.file(new URL('file:///work/project/docs/index.html'), true), files[0]);
    return setup(folder);
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
  await assert.rejects(prepared.build([nested.children[1].id]), error => {
    assert.equal(error.issues[0].code, 'unavailable-page');
    return true;
  });
  await assert.rejects(runtime._exportPackage.prepare(files.map(item =>
    file(item.webkitRelativePath.replace('project/', 'wrong/'), 'home')), { library }),
  error => error.folder === 'documents' && /does not contain the open DocForm page/.test(error.message));
});

test('a standalone page supplies its own title and single selectable page', async () => {
  const runtime = load(new Map([['only', { title: 'An example' }]]));
  runtime._page = 'file:///work/project/An%20example.html';
  runtime._site = { provided: false };
  const prepared = await runtime._exportPackage.prepare([file('project/An example.html', 'only')], { library });
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
  ], { library });
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

test('a cancelled export can be rebuilt with a fresh bundle and exact download size', async () => {
  function element(tag, text = '') {
    const attributes = new Map();
    return {
      children: [], dataset: {}, matches: () => false, querySelectorAll: () => [], contains: () => true,
      hasAttribute(name) { return attributes.has(name); },
      setAttribute(name, value) { attributes.set(name, { name, value }); },
      getAttributeNode(name) { return attributes.get(name); },
      get attributes() { return attributes.values(); },
      set id(value) { this.setAttribute('id', value); },
      set type(value) { this.setAttribute('type', value); },
      set rel(value) { this.setAttribute('rel', value); },
      set media(value) { this.setAttribute('media', value); },
      append(...children) { this.children.push(...children); },
      prepend(child) { this.children.unshift(child); },
      get outerHTML() {
        const attrs = Array.from(attributes.values(), attr => ` ${attr.name}="${attr.value}"`).join('');
        return `<${tag}${attrs}>${this.textContent || text}${this.children.map(child => child.outerHTML).join('')}</${tag}>`;
      }
    };
  }
  function exportDocument(title) {
    const html = element('html');
    const head = element('head');
    const body = element('body');
    body.replaceWith = () => {};
    head.append(element('title', title));
    html.append(head, body);
    return { documentElement: html, head, body, createElement: element, importNode: node => node,
      getElementById: () => null, querySelectorAll: () => [] };
  }
  const runtime = load(new Map([['only', { title: 'An example' }]]), exportDocument);
  runtime._page = 'file:///work/project/index.html';
  runtime._site = { provided: false };
  let css = 'p::before{content:"cancelled"}';
  runtime._pageSnapshot.capture = async () => ({
    title: 'An example', issues: [], htmlAttributes: [], body: element('body'), imports: [],
    styles: [{ text: css }, { text: css, media: 'print' }]
  });
  const signal = new AbortController();
  const prepared = await runtime._exportPackage.prepare([file('project/index.html', 'only')], { library });
  const phases = [];
  await assert.rejects(prepared.build([prepared.active], { signal: signal.signal, onProgress(event) {
    phases.push(event.phase);
    if (event.phase === 'serialize') signal.abort();
  } }), { name: 'AbortError' });
  assert.deepEqual(phases, ['capture', 'assets', 'links', 'serialize']);

  css = 'p::before{content:"</script> café"}';
  const result = await prepared.build([prepared.active]);
  const html = await result.blob.text();
  assert.equal(result.bytes, result.blob.size);
  assert.equal(result.bytes, Buffer.byteLength(html));
  const bundle = JSON.parse(/<script id="export-bundle"[^>]*>(.*?)<\/script>/s.exec(html)[1]);
  assert.deepEqual(bundle.assets[0], [css]);
  assert.equal(bundle.assets.length, 2);
  assert.match(bundle.assets[1][0], /^\.df-export-pop/);
  assert.doesNotMatch(html, /cancelled/);
  const frame = runtime._exportReader.assemble(bundle.pages[0].markup, bundle.assets);
  const dataURL = 'data:text/css;charset=utf-8;base64,' + Buffer.from(css).toString('base64');
  assert.equal(frame.split(dataURL).length, 3);
  assert.match(frame, new RegExp(`href="${dataURL}" media="print"`));
});
