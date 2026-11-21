const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(sourceDocs = new Map()) {
  const document = {
    implementation: {
      createHTMLDocument() {
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
  const context = vm.createContext({ URL, TextEncoder, btoa, document });
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
  const css = await resources.stylesheet('../css/outer.css', 'file:///site/docs/page.html',
    (...args) => issues.push(args));
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
  const stored = new Blob(['two']);
  const resources = runtime._exportResources.setup({ file: url => url.pathname === '/site/large.png' ? stored : null });
  const issues = [];
  const result = await resources.srcset('data:image/png;base64,b25l 1x, large.png 2x, missing.png 3x',
    'file:///site/index.html', (...args) => issues.push(args));
  assert.equal(result, 'data:image/png;base64,b25l 1x, data:image/png;base64,dHdv 2x');
  assert.equal(issues[0][0], 'missing-resource');
  const remapped = await resources.css('fill:url(#paint); stroke:url(#missing)', 'file:///site/drawing.svg',
    (...args) => issues.push(args), new Map([['paint', 'export-paint']]));
  assert.equal(remapped, 'fill:url("#export-paint"); stroke:url("data:,")');
});
