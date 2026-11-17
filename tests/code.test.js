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
  for (const lang of ['js', 'python', 'html', 'css', 'sh', 'unknown']) {
    assert.equal(code.tokenize(src, lang).map((t) => t.text).join(''), src, lang);
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

test('highlight escapes markup, and dedent strips shared indentation', () => {
  assert.equal(code.highlight('a < "<b>"', 'js'), 'a <span class="df-tok-operator">&lt;</span> <span class="df-tok-string">"&lt;b&gt;"</span>');
  assert.equal(code.highlight('<b>', 'text'), '&lt;b&gt;');
  assert.equal(code.dedent('\n    if x:\n\n      y\n  '), 'if x:\n\n  y');
});
