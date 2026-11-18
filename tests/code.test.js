const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('code.js'), context);
const code = context.DocForm.code;

// Typed tokens only, as "type:text" strings.
const typed = (src, lang) => JSON.parse(JSON.stringify(
  code.tokenize(src, lang).filter((t) => t.type).map((t) => `${t.type}:${t.text}`)));

test('tokens always reassemble to the source', () => {
  const src = 'const s = `a ${b}`; // x\n<p class="y">&amp;</p>';
  const sql = "SELECT 'it''s' AS \"from\", $$x$$, [order] FROM t /* open";
  const cs = 'var p = @"C:\\x ""q"""; var r = """\nraw\n"""; char c = \'\\\'\'; // done';
  for (const lang of ['js', 'python', 'html', 'css', 'sh', 'sql', 'cs', 'unknown']) {
    for (const s of [src, sql, cs]) assert.equal(code.tokenize(s, lang).map((t) => t.text).join(''), s, lang);
  }
});

test('JavaScript', () => {
  assert.deepEqual(typed("// add\nfunction add(a, b) { return a + 0x1F; } Math.max('x', null)", 'javascript'), [
    'comment:// add', 'keyword:function', 'function:add', 'keyword:return', 'operator:+', 'number:0x1F',
    'builtin:Math', 'function:max', "string:'x'", 'literal:null'
  ]);
});

test('Python', () => {
  assert.deepEqual(typed('@cache\ndef norm(v):\n    """Doc."""\n    return sum(v) ** 0.5  # ok\nx = f"{v}" if True else None', 'py'), [
    'builtin:@cache', 'keyword:def', 'function:norm', 'string:"""Doc."""', 'keyword:return', 'function:sum',
    'operator:**', 'number:0.5', 'comment:# ok', 'operator:=', 'string:f"{v}"', 'keyword:if', 'literal:True',
    'keyword:else', 'literal:None'
  ]);
});

test('HTML with embedded script and style', () => {
  assert.deepEqual(typed('<!-- c --><a href="x" hidden>&lt;</a><script>let n = 1</script><style>p{top:0}</style>', 'html'), [
    'comment:<!-- c -->', 'punctuation:<', 'tag:a', 'attr:href', 'string:"x"', 'attr:hidden', 'punctuation:>',
    'literal:&lt;', 'punctuation:</', 'tag:a', 'punctuation:><', 'tag:script', 'punctuation:>',
    'keyword:let', 'operator:=', 'number:1', 'punctuation:</', 'tag:script', 'punctuation:><', 'tag:style',
    'punctuation:>', 'property:top', 'number:0', 'punctuation:</', 'tag:style', 'punctuation:>'
  ]);
});

test('CSS', () => {
  assert.deepEqual(typed('/* x */ .tag:hover { color: var(--red) !important; margin: .5em 2px; } @media print {}', 'css'), [
    'comment:/* x */', 'attr:.tag', 'keyword::hover', 'property:color', 'function:var', 'keyword:!important',
    'property:margin', 'number:.5em', 'number:2px', 'keyword:@media'
  ]);
});

test('Shell', () => {
  assert.deepEqual(typed('# run\nexport A="$HOME"; if [ -f x ]; then node --test | grep ok; fi', 'bash'), [
    'comment:# run', 'keyword:export', 'string:"$HOME"', 'operator:;', 'keyword:if', 'attr:-f', 'operator:;',
    'keyword:then', 'function:node', 'attr:--test', 'operator:|', 'function:grep', 'operator:;', 'keyword:fi'
  ]);
});

test('SQL queries and schemas', () => {
  assert.equal(code.language('SQL'), 'sql');
  assert.deepEqual(typed('-- totals\nCREATE TABLE sales (id varchar(8) PRIMARY KEY, amount numeric(10, 2) NOT NULL);\n' +
    "INSERT INTO sales(id) VALUES ('it''s');\n" +
    'select count(distinct s.id), "select" from sales s where s.at::date >= :day and s.amount <> 1.5e2', 'sql'), [
    'comment:-- totals', 'keyword:CREATE', 'keyword:TABLE', 'builtin:varchar', 'number:8', 'keyword:PRIMARY',
    'keyword:KEY', 'builtin:numeric', 'number:10', 'number:2', 'keyword:NOT', 'literal:NULL', 'keyword:INSERT',
    'keyword:INTO', 'keyword:VALUES', "string:'it''s'", 'keyword:select', 'function:count', 'keyword:distinct',
    'keyword:from', 'keyword:where', 'operator:::', 'builtin:date', 'operator:>=', 'variable::day', 'keyword:and',
    'operator:<>', 'number:1.5e2'
  ]);
});

test('C# gameplay and tooling code', () => {
  for (const name of ['csharp', 'cs', 'C#']) assert.equal(code.language(name), 'csharp');
  assert.deepEqual(typed('#region Movement\n[SerializeField] private float speed = 2.5f;\n' +
    'public class Mover : MonoBehaviour {\n  void Update() => Log($"v {speed}", @"C:\\logs", \'\\n\', items[0] is not null);\n}', 'cs'), [
    'keyword:#region Movement', 'builtin:SerializeField', 'keyword:private', 'keyword:float', 'operator:=',
    'number:2.5f', 'keyword:public', 'keyword:class', 'function:Mover', 'builtin:MonoBehaviour', 'keyword:void',
    'function:Update', 'operator:=>', 'function:Log', 'string:$"v {speed}"', 'string:@"C:\\logs"', "string:'\\n'",
    'number:0', 'keyword:is', 'keyword:not', 'literal:null'
  ]);
});

test('highlight escapes markup, and dedent strips shared indentation', () => {
  assert.equal(code.highlight('a < "<b>"', 'js'), 'a <span class="df-tok-operator">&lt;</span> <span class="df-tok-string">"&lt;b&gt;"</span>');
  assert.equal(code.highlight("x <> '<b>&'", 'sql'), 'x <span class="df-tok-operator">&lt;&gt;</span> <span class="df-tok-string">\'&lt;b&gt;&amp;\'</span>');
  assert.equal(code.highlight('List<int> s = "<i>";', 'c#'), '<span class="df-tok-builtin">List</span><span class="df-tok-operator">&lt;</span><span class="df-tok-keyword">int</span><span class="df-tok-operator">&gt;</span> s <span class="df-tok-operator">=</span> <span class="df-tok-string">"&lt;i&gt;"</span>;');
  assert.equal(code.highlight('<b>', 'text'), '&lt;b&gt;');
  assert.equal(code.dedent('\n    if x:\n\n      y\n  '), 'if x:\n\n  y');
});

test('line lists, token lines, and annotation markers', () => {
  assert.deepEqual([...code.lineList('4-6, 2 6 x 9-8')], [2, 4, 5, 6, 8, 9]);
  const lines = JSON.parse(JSON.stringify(code.tokenLines(code.tokenize('a = """x\ny"""', 'py'))));
  assert.deepEqual(lines.map((l) => l.map((t) => t.text).join('')), ['a = """x', 'y"""']);
  const parsed = code.annotations('x = 1  # (1)\nfoo(); // (2) (3)\n<b> <!-- (4) -->\ny = "(5)"\nz  # see (6) later');
  assert.equal(parsed.source, 'x = 1\nfoo();\n<b>\ny = "(5)"\nz  # see (6) later');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.markers)), [[1], [2, 3], [4], [], []]);
  const sql = code.annotations("SELECT id -- (1)\nFROM t; -- keep (2)\nWHERE note = '-- (3)'");
  assert.equal(sql.source, "SELECT id\nFROM t; -- keep (2)\nWHERE note = '-- (3)'");
  assert.deepEqual(JSON.parse(JSON.stringify(sql.markers)), [[1], [], []]);
  const cs = code.annotations('speed += 1f; // (4)\nvar s = @"(5)";');
  assert.equal(cs.source, 'speed += 1f;\nvar s = @"(5)";');
  assert.deepEqual(JSON.parse(JSON.stringify(cs.markers)), [[4], []]);
});

test('diff rows from prefixed text and from before and after versions', () => {
  const rows = (list) => JSON.parse(JSON.stringify(list)).map((r) => r.type[0] + r.text);
  assert.deepEqual(rows(code.diffRows('--- a.py\n+++ b.py\n@@ -1 +1 @@\n x = 1\n-y = 2\n+y = 3\n--z\nplain')),
    ['m--- a.py', 'm+++ b.py', 'h@@ -1 +1 @@', 'sx = 1', 'dy = 2', 'ay = 3', 'd-z', 'splain']);
  assert.deepEqual(rows(code.diffLines('a\nb\nc\nd', 'a\nc\nx\nd')), ['sa', 'db', 'sc', 'ax', 'sd']);
  assert.deepEqual(rows(code.diffLines('a\nb', 'z\na\nb\ny')), ['az', 'sa', 'sb', 'ay']);
  assert.deepEqual(rows(code.diffLines('old', 'new')), ['dold', 'anew']);
  // SQL comments inside a prefixed diff keep their prefix, and a string spanning lines splits into line tokens.
  assert.deepEqual(rows(code.diffRows(' -- totals\n--- old note\n+SELECT 1')), ['s-- totals', 'd-- old note', 'aSELECT 1']);
  const lines = JSON.parse(JSON.stringify(code.tokenLines(code.tokenize("SELECT 'a\nb' -- c", 'sql'))));
  assert.deepEqual(lines.map((l) => l.map((t) => `${t.type}:${t.text}`)),
    [['keyword:SELECT', 'null: ', "string:'a"], ["string:b'", 'null: ', 'comment:-- c']]);
});
