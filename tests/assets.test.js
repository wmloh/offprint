const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');

function load() {
  const context = vm.createContext({ URL, crypto: webcrypto, TextDecoder, console: { warn() {} } });
  context.window = context;
  context.OffPrint = { _boot: { report() {}, optionLayers: () => [] } };
  for (const path of ['vendor/js-yaml/js-yaml.min.js', 'js/core.js', 'js/tooltip.js',
    'js/search.js', 'js/data.js', 'tools/asset-build.js']) {
    const file = new URL('../offprint/' + path, 'file://' + __filename);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: path });
  }
  return { build: context.OffPrint._assetBuild, runtime: context.OffPrint, context };
}

function html(text) {
  const scripts = Array.from(text.matchAll(/<script src="([^"]+)" data-op-site>/g), match => ({
    getAttribute: () => match[1]
  }));
  const body = { hasAttribute: () => false, querySelector: () => null, querySelectorAll: () => [], closest: () => null };
  return {
    body,
    querySelector: () => null,
    querySelectorAll: selector => selector === 'script[data-op-site][src]' ? scripts : [],
    createTreeWalker: () => {
      let remaining = true;
      return {
        currentNode: { nodeType: 3, nodeValue: text },
        nextNode() {
          const next = remaining;
          remaining = false;
          return next;
        }
      };
    }
  };
}

const file = text => new Blob([text]);
const paths = items => Array.from(items, item => item.output);
const statuses = report => Array.from(report.jobs, job => job.status);
const manifest = 'config/site.js';

function siteFiles(title) {
  return new Map([
    ['index.html', file(title)],
    ['docs/Chapter #1.html', file('Chapter text')],
    ['glossary/index.html', file('Terms')],
    ['input/runs.csv', file('run,time\nA,12\n')],
    ['input/values.yml', file('threshold: 3\n')]
  ]);
}

function config() {
  return {
    pages: [{ path: '../index.html', title: 'Home', pages: [{ path: '../docs/Chapter%20%231.html', title: 'Chapter' }] },
      'https://example.com/outside'],
    glossaryPage: '../glossary/',
    options: { tooltips: { terms: { volume: 'How much space a substance takes up.' }, autoLink: true } },
    assets: {
      search: { output: '../search-index.js' },
      data: {
        runs: { source: '../input/runs.csv', output: '../assets/detail/runs.js' },
        values: { source: '../input/values.yml', output: 'assets/values.js' }
      }
    }
  };
}

test('manifests are discovered by marked paths, are explicitly disambiguated, and are parsed as data', async () => {
  const { build, context } = load();
  const files = new Map([
    ['index.html', file('<script src="config/notes%20site.js" data-op-site></script><script>window.executed = true;</script>')],
    ['docs/b.html', file('<script src="../second/site.js" data-op-site></script>')],
    ['docs/c.html', file('<script src="../../escape.js" data-op-site></script>')],
    ['config/notes site.js', file('window.OffPrintSite = {"title":"Notes"}; window.executed = true;')],
    ['second/site.js', file('\ufeff window.OffPrintSite = {"title":"Other"};\n')]
  ]);
  const result = await build.discover(files, html);
  assert.deepEqual(Array.from(result.paths), ['config/notes site.js', 'second/site.js']);
  assert.match(result.diagnostics[0], /docs\/c\.html.*leaves the selected folder/);
  assert.throws(() => build.parseManifest('window.OffPrintSite = {}; window.executed = true;'));
  assert.throws(() => build.parseManifest('window.OffPrintSite = {title: "JS"};'));
  assert.equal(context.executed, undefined);
  assert.equal(build.parseManifest(await files.get('second/site.js').text()).title, 'Other');
  assert.deepEqual(Array.from((await build.discover(new Map([['nested/site.js', file('')]]), html)).paths), ['nested/site.js']);
});

test('nested outputs are reproducible, independent across sites, and load through the runtime', async () => {
  const { build, runtime, context } = load();
  const site = config();
  const files = siteFiles('First site');
  const inspect = (tree = files) => build.inspect(tree, site, manifest, [], html);
  const first = await inspect();
  const [search, runs, values] = first.jobs;
  assert.deepEqual(statuses(first), ['missing', 'missing', 'missing'], first.jobs.flatMap(job => job.errors).join('\n'));
  assert.deepEqual(paths(first.jobs), ['search-index.js', 'assets/detail/runs.js', 'config/assets/values.js']);
  assert.deepEqual(paths(build.selected(first.jobs, new Set([search.output, values.output]))), [search.output, values.output]);

  for (const job of first.jobs) vm.runInContext(job.script, context);
  assert.equal(context.OffPrintSearch.version, 1);
  assert.deepEqual(Array.from(context.OffPrintSearch.pages, page => page.path),
    ['../index.html', '../docs/Chapter%20%231.html', '../glossary/index.html']);
  assert.equal(context.OffPrintSearch.metadata.inputs[0].sha256, createHash('sha256').update('First site').digest('hex'));
  assert.equal(runtime._boot.registerData('runs').snapshot().text, 'run,time\nA,12\n');
  assert.equal(runtime._boot.registerData('values').snapshot().type, 'yaml');
  runtime._search.load(index => assert.equal(index.pages[0].sections[0].text, 'First site'));
  context.OffPrintSearch.version++;
  runtime._search.load(index => assert.equal(index, null));
  context.OffPrintData.values.version++;
  context.OffPrintData.unsupported = context.OffPrintData.values;
  assert.equal(runtime._boot.registerData('unsupported'), null);

  for (const job of build.selected(first.jobs, new Set([search.output, values.output]))) files.set(job.output, file(job.script));
  assert.deepEqual(statuses(await inspect()), ['current', 'missing', 'current']);
  files.set(runs.output, file(runs.script));
  assert.deepEqual(statuses(await inspect()), ['current', 'current', 'current']);
  const second = await inspect(siteFiles('Second site'));
  assert.deepEqual(statuses(second), ['missing', 'missing', 'missing']);
  assert.notEqual(second.jobs[0].script, search.script);
  assert.equal(second.jobs[1].script, runs.script);
  assert.equal((await inspect()).jobs[0].script, search.script);
});

test('edits, deletions, parse errors and cap warnings affect the configured outputs independently', async () => {
  const { build } = load();
  const files = siteFiles('Home');
  const site = config();
  const inspect = () => build.inspect(files, site, manifest, [], html);
  for (const job of (await inspect()).jobs) files.set(job.output, file(job.script));
  site.title = 'Unrelated metadata';
  assert.deepEqual(statuses(await inspect()), ['current', 'current', 'current']);
  files.set('index.html', file('A new heading'));
  assert.deepEqual(statuses(await inspect()), ['stale', 'current', 'current']);
  files.set('index.html', file('Home'));
  site.options.tooltips.terms.volume = 'Updated definition';
  assert.deepEqual(statuses(await inspect()), ['stale', 'current', 'current']);
  files.set('input/runs.csv', file('run,time\nB,2\n'));
  assert.deepEqual(statuses(await inspect()), ['stale', 'stale', 'current']);
  files.delete('glossary/index.html');
  let report = await inspect();
  assert.deepEqual(statuses(report), ['blocked', 'stale', 'current']);
  assert.match(report.jobs[0].errors[0], /Missing input glossary\/index\.html/);
  site.assets.search.include = ['../docs/Chapter%20%231.html'];
  assert.deepEqual(statuses(await inspect()), ['stale', 'stale', 'current']);

  files.set('input/runs.csv', file('run,run\nA,B\n'));
  files.set('input/values.yml', file('k: "' + 'x'.repeat(1024 * 1024) + '"\n'));
  report = await inspect();
  assert.deepEqual(statuses(report), ['stale', 'blocked', 'stale']);
  assert.match(report.jobs[1].errors[0], /input\/runs\.csv.*fields must be unique/);
  assert.match(report.jobs[1].draft, /"draft": true/);
  assert.match(report.jobs[2].warnings[0], /size cap/);
  assert.deepEqual(paths(build.selected(report.jobs, new Set(['assets/detail/runs.js', 'config/assets/values.js']))),
    ['config/assets/values.js']);

  files.delete('input/values.yml');
  report = await inspect();
  assert.deepEqual(statuses(report), ['stale', 'blocked', 'blocked']);
  assert.match(report.jobs[2].errors[0], /Missing input input\/values\.yml/);
});

test('traversal, output collisions, and overwrites of protected files are blocked', async () => {
  const { build } = load();
  const files = siteFiles('Home');
  const site = config();
  site.assets.search.output = '../assets/detail/runs.js';
  site.assets.data.escape = { source: '../input/runs.csv', output: '../%2e%2e/config/run.js' };
  site.assets.data.html = { source: '../input/runs.csv', output: '../index.html' };
  site.assets.data.source = { source: '../input/runs.csv', output: '../input/values.yml' };
  site.assets.data.other = { source: '../input/runs.csv', output: '../second/site.js' };
  const report = await build.inspect(files, site, manifest, ['second/site.js'], html);
  assert.deepEqual(statuses(report), ['blocked', 'blocked', 'missing', 'blocked', 'blocked', 'blocked', 'blocked']);
  assert.match(report.jobs[0].errors[0], /assets\/detail\/runs\.js.*conflicts/);
  assert.match(report.jobs[3].errors[0], /leaves the selected folder/);
  for (const job of report.jobs.slice(4)) assert.match(job.errors[0], /overlaps a site input or manifest/);
});
