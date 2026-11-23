const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseHTML, inspect, ParseError } = require('../offprint/tools/refresh-assets.js');

const docs = path.join(__dirname, '../docs');

function tree(node) {
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
  if (node.nodeType === 8) return '#comment';
  return node.localName + (node.childNodes.length ? '(' + node.childNodes.map(tree).join(' ') + ')' : '');
}

const body = source => tree(parseHTML('<!doctype html><title>t</title><body>' + source).body);

// The committed outputs were written by tools/assets.html in a browser. Each one whose recorded inputs and
// configuration still match must be reproduced byte for byte; refresh the others with that page to check them too.
test('the CLI reproduces the browser-made docs search index and data wrappers byte for byte', async t => {
  const { manifest, jobs } = await inspect(docs);
  assert.equal(manifest, 'assets/site.js');
  const metadata = text => {
    const start = /(?:= |value: )\{/.exec(text);
    return JSON.stringify(JSON.parse(text.slice(start.index + start[0].length - 1, text.lastIndexOf('\n}') + 2)).metadata);
  };
  let compared = 0;
  for (const job of jobs) {
    assert.deepEqual([job.output, job.errors.length], [job.output, 0]);
    if (metadata(job.existing) !== metadata(job.script)) {
      t.diagnostic('Skipped ' + job.output + ': its inputs changed since the browser built it.');
      continue;
    }
    assert.equal(job.script, job.existing, job.output);
    compared++;
  }
  assert.ok(compared > 0);
});

test('the parser builds the browser tree for optional end tags, implied table sections, and entities', () => {
  assert.equal(body('<p>a<p>b<div>c</div>'), 'body(p("a") p("b") div("c"))');
  assert.equal(body('<ul><li>a<li>b <em>c</em></ul>'), 'body(ul(li("a") li("b " em("c"))))');
  assert.equal(body('<dl><dt>a<dd>b<dt>c</dl>'), 'body(dl(dt("a") dd("b") dt("c")))');
  assert.equal(body('<table><tr><td>a<td>b<tr><th>c</table>'),
    'body(table(tbody(tr(td("a") td("b")) tr(th("c")))))');
  assert.equal(body('<table>\n<thead><tr><th>h\n<tbody><tr><td><p>x</table>'),
    'body(table("\\n" thead(tr(th("h\\n"))) tbody(tr(td(p("x"))))))');
  assert.equal(body('<table><col><tr><td>a</table>'), 'body(table(colgroup(col) tbody(tr(td("a")))))');
  assert.equal(body('<select><option>a<option>b</select>'), 'body(select(option("a") option("b")))');
  assert.equal(body('<pre>\ncode</pre><textarea>\n&lt;b&gt;</textarea>'), 'body(pre("code") textarea("<b>"))');
  assert.equal(body('a &amp; b &copy; &#169; &#xA9; &notin; R&D 5 < 6'), 'body("a & b © © © ∉ R&D 5 < 6")');
  assert.equal(body('<svg viewBox="0 0 1 1"><path d="M0 0"/><title>t</title></svg>x'),
    'body(svg(path title("t")) "x")');
  assert.equal(body('a<!-- c -->b'), 'body("a" #comment "b")');
  assert.equal(parseHTML('<div class="x" data-flag">a</div>').body.firstChild.hasAttribute('data-flag"'), true);
  const doc = parseHTML('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>A &amp; B</title></head>' +
    '<body data-op-autolink><main class="op-page"><h1>A</h1></main></body>\n</html>\n');
  assert.equal(doc.querySelector('title').textContent, 'A & B');
  assert.equal(doc.body.getAttribute('data-op-autolink'), '');
  assert.equal(tree(doc.body), 'body(main(h1("A")) "\\n\\n")');
});

test('the parser refuses markup whose browser tree it would not reproduce', () => {
  for (const [source, message] of [
    ['<p><b>a</p>', /<b> is still open/],
    ['<b><i>a</b></i>', /does not match/],
    ['<a href=x>a<a href=y>b</a></a>', /Nested <a>/],
    ['<table>text<tr><td>a</table>', /Text directly inside <table>/],
    ['<table><div>a</div></table>', /directly inside <table>/],
    ['<div/>', /not self-closing/],
    ['</span>', /does not match an open element/],
    ['</p>', /without an open <p>/],
    ['&copy x', /Ambiguous character reference/],
    ['&bogus;', /Unknown character reference/],
    ['&#128;', /Invalid character reference/],
    ['<svg><div>a</div></svg>', /leaves the figure/],
    ['<iframe></iframe>', /not supported/]
  ]) {
    assert.throws(() => body(source), error => error instanceof ParseError && message.test(error.message), source);
  }
});

test('the CLI writes stale outputs, reports them in check mode, and writes nothing when one is blocked', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offprint-refresh-'));
  try {
    const write = (name, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    };
    write('site.js', 'window.OffPrintSite = ' + JSON.stringify({ title: 'Site', pages: ['index.html'],
      assets: { search: { output: 'out/search.js' }, data: { Values: { source: 'values.csv', output: 'out/values.js' } } } }) + ';');
    write('index.html', '<!doctype html><title>Home</title><script src="site.js" data-op-site></script>' +
      '<main class="op-page"><h1>Home</h1><h2>Part</h2><p>Body text.</p></main>');
    write('values.csv', 'a,b\n1,2\n');
    const run = async options => JSON.parse(JSON.stringify((await inspect(dir, options)).jobs.map(job => [job.output, job.status])));
    assert.deepEqual(await run(), [['out/search.js', 'missing'], ['out/values.js', 'missing']]);
    assert.deepEqual(await run({ search: true }), [['out/search.js', 'missing']]);
    const cli = (...args) => spawnSync(process.execPath, [path.join(__dirname, '../offprint/tools/refresh-assets.js'), dir, ...args],
      { encoding: 'utf8' });
    assert.equal(cli('--check').status, 1);
    assert.equal(fs.existsSync(path.join(dir, 'out')), false);
    const first = cli();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Updated: out\/search\.js\nUpdated: out\/values\.js/);
    assert.deepEqual(await run(), [['out/search.js', 'current'], ['out/values.js', 'current']]);
    assert.match(fs.readFileSync(path.join(dir, 'out/search.js'), 'utf8'), /"title": "Part"/);
    assert.equal(cli('--check', '--manifest=site.js').status, 0);
    write('index.html', fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('Part', 'Section'));
    write('values.csv', 'a,b\n1,2,3\n');
    const blocked = cli();
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Blocked: out\/values\.js[\s\S]*Nothing was written/);
    assert.match(fs.readFileSync(path.join(dir, 'out/search.js'), 'utf8'), /"title": "Part"/);
    assert.equal(cli('--search').status, 0);
    assert.match(fs.readFileSync(path.join(dir, 'out/search.js'), 'utf8'), /"title": "Section"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
