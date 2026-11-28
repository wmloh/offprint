const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { isCurrent } = require('../../scripts/build-export-library.js');
const { load, file } = require('../support/export-runtime');

test('the shipped export bundle matches the library styles and fonts', () => {
  assert.ok(isCurrent(), 'Run node scripts/build-export-library.js to refresh the export bundle.');
});

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
    file('docs/assets/site.js', 'window.OffPrintSite = ' + JSON.stringify(manifest) + ';'),
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
  await resources.stylesheet('offprint.css', entry, report);
  await resources.stylesheet('vendor/katex/katex.min.css', entry, report);
  const font = fs.readFileSync(new URL('../../offprint/vendor/katex/fonts/KaTeX_Main-Regular.woff2',
    'file://' + __filename));
  assert.ok(resources.assets.includes('data:font/woff2;base64,' + font.toString('base64')));
  assert.deepEqual(issues, []);
  await assert.rejects(prepared.build([nested.children[1].id]), error => {
    assert.equal(error.issues[0].code, 'unavailable-page');
    return true;
  });
  await assert.rejects(runtime._exportPackage.prepare(files.map(item =>
    file(item.webkitRelativePath.replace('docs/', 'wrong/'), 'home'))),
  error => error.folder === 'documents' && /does not contain the open OffPrint page/.test(error.message));
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
    file('project/site.js', 'window.OffPrintSite = ' + JSON.stringify(manifest) + ';'),
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
