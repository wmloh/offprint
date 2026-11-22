const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A minimal DOM that serializes to HTML-like text for comparisons.
const node = (tag) => ({
  tagName: tag.toUpperCase(), children: [], attrs: {}, style: {},
  appendChild(child) { this.children.push(child); return child; },
  setAttribute(key, value) { this.attrs[key] = value; },
  set textContent(text) { this.children = [{ text }]; },
  createTHead() { return this.appendChild(node('thead')); },
  insertRow() { return this.appendChild(node('tr')); }
});
const html = (n) => {
  if ('text' in n) return n.text.replace(/</g, '&lt;');
  const props = ['className', 'href', 'src', 'alt', 'checked'].filter((k) => n[k] !== undefined).map((k) => ` ${k}=${n[k]}`);
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}=${v}`);
  const align = n.style.textAlign ? ` align=${n.style.textAlign}` : '';
  return `<${n.tagName.toLowerCase()}${props.join('')}${attrs.join('')}${align}>${n.children.map(html).join('')}</${n.tagName.toLowerCase()}>`;
};
const context = vm.createContext({ console, document: { createElement: node, createTextNode: (text) => ({ text }) } });
context.window = context;
for (const file of ['core.js', 'markdown.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8'), context);
const render = (text) => context.DocForm._markdown.render(text).children.map(html).join('');

test('blocks cover headings, paragraphs, quotes, rules, fenced code, and tables', () => {
  assert.equal(render('## Title *x*\n\nOne\ntwo  \nthree\n\n> quoted\n\n---\n```py\n<b>\n```'),
    '<div className=df-md-heading df-md-h2 role=heading aria-level=2>Title <em>x</em></div>' +
    '<p>One\ntwo<br></br>three</p><blockquote><p>quoted</p></blockquote><hr></hr>' +
    '<pre data-df-lang=py><code>&lt;b></code></pre>');
  assert.equal(render('| a | b |\n|:--|--:|\n| 1 \\| 2 | **3** |'),
    '<table><thead><tr><th scope=col align=left>a</th><th scope=col align=right>b</th></tr></thead>' +
    '<tbody><tr><td align=left>1 | 2</td><td align=right><strong>3</strong></td></tr></tbody></table>');
});

test('lists nest, number from their start, and show task boxes', () => {
  assert.equal(render('- a\n  - b\n- [x] done\n\n3. c\n4. d'),
    '<ul><li>a<ul><li>b</li></ul></li><li className=df-md-task><input checked=true></input>done</li></ul>' +
    '<ol><li>c</li><li>d</li></ol>');
});

test('inline marks, code spans, and escapes, with raw HTML kept as text and unsafe links dropped', () => {
  assert.equal(render('**b** _i_ ~~s~~ `a*b` \\*x\\* snake_case_name <i>raw</i>'),
    '<p><strong>b</strong> <em>i</em> <del>s</del> <code>a*b</code> *x* snake_case_name &lt;i>raw&lt;/i></p>');
  assert.equal(render('[ok](../a.html "T") [bad](javascript:alert(1)) <https://x.org> ![i](data:image/png;base64,AA)'),
    '<p><a href=../a.html>ok</a> <span>bad</span> <a href=https://x.org>https://x.org</a> i</p>');
});
