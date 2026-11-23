#!/usr/bin/env node
// Check or refresh a site's manifest-configured search index and data wrappers from a terminal, with the same
// builder as tools/assets.html. Needs Node 18 or later and nothing else.
// Usage: node refresh-assets.js <site-folder> [--manifest=<path in the folder>] [--check] [--search]
//   Writes every missing or stale output, and nothing when any output is blocked. --check writes nothing and exits 1
//   when an output is missing, stale, or blocked. --search limits the run to the search index.
// Pages are read with a strict parser: it builds the browser's tree for well-formed HTML, including optional end
// tags and implied table sections, and stops with an error for markup whose browser tree it would not reproduce.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ENTITIES = require('./html-entities.json');
const LIBRARY = path.resolve(__dirname, '..');
const SCRIPTS = ['vendor/js-yaml/js-yaml.min.js', 'js/core.js', 'js/tooltip.js', 'js/search.js', 'js/data.js',
  'tools/asset-build.js'];

const set = text => new Set(text.split(' '));
const VOID = set('area base basefont bgsound br col embed hr img input keygen link meta param source track wbr');
const IMPLIED = set('dd dt li optgroup option p rb rp rt rtc');
const FORMATTING = set('a b big code em font i nobr s small strike strong tt u');
const HEADINGS = set('h1 h2 h3 h4 h5 h6');
const CLOSES_P = set('address article aside blockquote center details dialog dir div dl fieldset figcaption figure ' +
  'footer header hgroup main menu nav ol p search section summary ul');
const BLOCK_END = set('address article aside blockquote button center details dialog dir div dl fieldset figcaption ' +
  'figure footer header hgroup listing main menu nav ol pre search section summary ul');
const SPECIAL = set('address applet area article aside base basefont bgsound blockquote body br button caption ' +
  'center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 ' +
  'h4 h5 h6 head header hgroup hr html iframe img input keygen li link listing main marquee menu meta nav noembed ' +
  'noframes noscript object ol p param plaintext pre script search section select source style summary table tbody ' +
  'td template textarea tfoot th thead title tr track ul wbr xmp');
const HEAD_TAGS = set('base basefont bgsound link meta noframes script style template title');
const SCOPE = set('applet caption html table td th marquee object template');
const TABLE_ROWS = set('tbody thead tfoot');
const TABLE_PARTS = set('caption col colgroup tbody td tfoot th thead tr');
const TABLE_CONTEXT = set('table tbody thead tfoot tr colgroup');
const RAW = set('script style');
const UNSUPPORTED = set('frameset frame iframe noembed plaintext xmp image isindex');
const BREAKOUT = set('b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li ' +
  'listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var');
const SPACE = /^[\t\n\f\r ]*$/;

class ParseError extends Error {}

// Nodes: just enough DOM for the search extractor, glossary linking, and manifest discovery.
class Node {
  constructor(type, doc) { this.nodeType = type; this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() {
    const list = this.parentNode && this.parentNode.childNodes;
    return list ? list[list.indexOf(this) + 1] || null : null;
  }
  contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; }
  get textContent() {
    if (this.nodeType === 3 || this.nodeType === 8) return this.nodeValue;
    return this.childNodes.filter(n => n.nodeType !== 8).map(n => n.textContent).join('');
  }
  set textContent(value) {
    this.childNodes.forEach(n => { n.parentNode = null; });
    this.childNodes = [];
    if (value) this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
  insertBefore(node, ref) {
    const nodes = node.nodeType === 11 ? node.childNodes.slice() : [node];
    if (node.nodeType === 11) node.childNodes = [];
    nodes.forEach(n => {
      if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
      const at = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
      this.childNodes.splice(at, 0, n);
      n.parentNode = this;
    });
    return node;
  }
  appendChild(node) { return this.insertBefore(node, null); }
  replaceChild(node, old) {
    this.insertBefore(node, old);
    this.childNodes.splice(this.childNodes.indexOf(old), 1);
    old.parentNode = null;
    return old;
  }
  querySelectorAll(selector) {
    const list = parseSelector(selector);
    const out = [];
    walk(this, el => { if (test(el, list)) out.push(el); });
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class Element extends Node {
  constructor(name, doc, foreign) {
    super(1, doc);
    this.localName = name;
    this.foreign = !!foreign;
    this.attrs = new Map();
    this.content = name === 'template' && !foreign ? new Node(11, doc) : null;
  }
  get tagName() { return this.foreign ? this.localName : this.localName.toUpperCase(); }
  get attributes() { return Array.from(this.attrs, ([name, value]) => ({ name, value })); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  getAttribute(name) { name = this.foreign ? name : name.toLowerCase(); return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(this.foreign ? name : name.toLowerCase(), String(value)); }
  hasAttribute(name) { return this.attrs.has(this.foreign ? name : name.toLowerCase()); }
  removeAttribute(name) { this.attrs.delete(this.foreign ? name : name.toLowerCase()); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get classList() {
    const el = this;
    const names = () => el.className.split(/[\t\n\f\r ]+/).filter(Boolean);
    const write = list => el.setAttribute('class', list.join(' '));
    return {
      contains: name => names().includes(name),
      add: (...add) => write(names().concat(add.filter(name => !names().includes(name)))),
      remove: (...remove) => write(names().filter(name => !remove.includes(name))),
      toggle: (name, force) => {
        const on = force === undefined ? !names().includes(name) : !!force;
        write(on ? names().concat(names().includes(name) ? [] : [name]) : names().filter(other => other !== name));
        return on;
      }
    };
  }
  matches(selector) { return test(this, parseSelector(selector)); }
  closest(selector) {
    const list = parseSelector(selector);
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (test(n, list)) return n;
    return null;
  }
}

class Document extends Node {
  constructor() { super(9, null); this.implementation = { createHTMLDocument }; }
  get documentElement() { return this.childNodes.find(n => n.nodeType === 1) || null; }
  get head() { return this.documentElement && this.documentElement.children.find(n => n.localName === 'head') || null; }
  get body() { return this.documentElement && this.documentElement.children.find(n => n.localName === 'body') || null; }
  createElement(name) { return new Element(String(name).toLowerCase(), this); }
  createTextNode(text) { const n = new Node(3, this); n.nodeValue = String(text); return n; }
  createComment(text) { const n = new Node(8, this); n.nodeValue = String(text); return n; }
  createDocumentFragment() { return new Node(11, this); }
  getElementById(id) { let found = null; walk(this, el => { if (!found && el.id === id) found = el; }); return found; }
  createTreeWalker(root, show, filter) { return new TreeWalker(root, show, filter); }
}

class TreeWalker {
  constructor(root, show, filter) { this.root = root; this.show = show; this.filter = filter; this.currentNode = root; }
  accept(node) {
    if (!(this.show & (1 << (node.nodeType - 1)))) return 3;
    if (!this.filter) return 1;
    return typeof this.filter === 'function' ? this.filter(node) : this.filter.acceptNode(node);
  }
  nextNode() {
    let node = this.currentNode;
    let result = 1;
    for (;;) {
      while (result !== 2 && node.firstChild) {
        node = node.firstChild;
        result = this.accept(node);
        if (result === 1) return (this.currentNode = node);
      }
      let next = null;
      for (let n = node; n && n !== this.root; n = n.parentNode) if ((next = n.nextSibling)) break;
      if (!next) return null;
      node = next;
      result = this.accept(node);
      if (result === 1) return (this.currentNode = node);
    }
  }
}

function walk(root, fn) {
  root.childNodes.forEach(n => { if (n.nodeType === 1) { fn(n); walk(n, fn); } });
}

function createHTMLDocument() {
  const doc = new Document();
  const html = doc.createElement('html');
  doc.appendChild(html);
  Object.defineProperty(html, 'innerHTML', { set(source) { parseDocument(doc, html, source); } });
  return doc;
}

// Character references: the WHATWG named table, decimal and hex forms. Forms a browser would read differently from
// how they look, or would repair, are refused.
function decode(text, where) {
  if (text.indexOf('&') < 0) return text;
  return text.replace(/&(#[xX]?[0-9a-fA-F]*;?|[A-Za-z0-9]+;?)?/g, (match, body) => {
    if (!body) return '&';
    if (body[0] === '#') {
      const hex = /^#[xX]/.test(body);
      const digits = body.slice(hex ? 2 : 1).replace(/;$/, '');
      if (!digits || !body.endsWith(';') || !(hex ? /^[0-9a-f]+$/i : /^\d+$/).test(digits)) {
        throw new ParseError('Malformed character reference ' + match + where());
      }
      const code = parseInt(digits, hex ? 16 : 10);
      if (!code || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff || code >= 0x80 && code <= 0x9f) {
        throw new ParseError('Invalid character reference ' + match + where());
      }
      return String.fromCodePoint(code);
    }
    const name = body.replace(/;$/, '');
    if (Object.hasOwn(ENTITIES, name + ';') && body.endsWith(';')) return ENTITIES[name + ';'];
    for (let end = name.length; end > 1; end--) {
      if (Object.hasOwn(ENTITIES, name.slice(0, end))) {
        throw new ParseError('Ambiguous character reference ' + match + where() + '; end it with ";" or write &amp;');
      }
    }
    if (body.endsWith(';')) throw new ParseError('Unknown character reference ' + match + where());
    return match;
  });
}

// Tree construction for documents parsed into <html>, following the HTML standard's insertion rules for the markup
// authors write. Recovery paths that change the tree (misnested tags, stray end tags, foster parenting) are refused.
function parseDocument(doc, html, input) {
  if (input.includes('\0')) throw new ParseError('NUL characters are not supported');
  const source = input.replace(/\r\n?/g, '\n');
  html.childNodes = [];
  const stack = [html];
  let head = null;
  let body = null;
  let mode = 'before-head';
  let form = null;
  let pos = 0;

  function lineAt(at) {
    let line = 1;
    for (let i = source.indexOf('\n'); i >= 0 && i < at; i = source.indexOf('\n', i + 1)) line++;
    return line;
  }
  function fail(message, at) { throw new ParseError(message + ' (line ' + lineAt(at ?? pos) + ')'); }
  const current = () => stack[stack.length - 1];
  const named = (node, name) => node && !node.foreign && node.localName === name;
  const parentOf = node => node.content || node;

  function insertText(text, target) {
    if (!text) return;
    const parent = parentOf(target || current());
    const last = parent.lastChild;
    if (last && last.nodeType === 3) last.nodeValue += text;
    else parent.appendChild(doc.createTextNode(text));
  }
  function insert(name, attrs, foreign) {
    const el = new Element(name, doc, foreign);
    attrs.forEach(([key, value]) => { if (!el.attrs.has(key)) el.attrs.set(key, value); });
    parentOf(current()).appendChild(el);
    return el;
  }
  function inScope(name, extra) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i];
      if (named(node, name)) return true;
      if (node.foreign ? FOREIGN_SCOPE.has(node.localName) : SCOPE.has(node.localName) || extra && extra.has(node.localName)) {
        return false;
      }
    }
    return false;
  }
  function inTableScope(name) {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (named(stack[i], name)) return true;
      if (['html', 'table', 'template'].includes(stack[i].localName) && !stack[i].foreign) return false;
    }
    return false;
  }
  // Pops through `name`; elements above it must be ones whose end tags the standard implies.
  function close(name, allowed) {
    while (!named(current(), name)) {
      const node = current();
      if (node.foreign || !IMPLIED.has(node.localName) && !(allowed && allowed.has(node.localName))) {
        fail('<' + node.localName + '> is still open where <' + name + '> ends; close it first');
      }
      stack.pop();
    }
    stack.pop();
  }
  function closeP() { if (inScope('p', BUTTON)) close('p'); }

  function readTag(start) {
    const end = source[start + 1] === '/';
    let at = start + (end ? 2 : 1);
    const nameMatch = /[^\t\n\f />]*/y;
    nameMatch.lastIndex = at;
    const raw = nameMatch.exec(source)[0];
    at += raw.length;
    const attrs = [];
    let selfClosing = false;
    for (;;) {
      while (/[\t\n\f ]/.test(source[at] || '')) at++;
      if (at >= source.length) fail('Unclosed tag <' + raw, start);
      if (source[at] === '>') { at++; break; }
      if (source[at] === '/') {
        if (source[at + 1] !== '>') fail('Unexpected "/" in <' + raw + '>', start);
        selfClosing = true;
        at += 2;
        break;
      }
      // A name may start with "=" and holds quotes or "<" as written, as in a browser.
      const attrMatch = /=?[^\t\n\f />=]*/y;
      attrMatch.lastIndex = at;
      const nameText = attrMatch.exec(source);
      at += nameText[0].length;
      while (/[\t\n\f ]/.test(source[at] || '')) at++;
      let value = '';
      if (source[at] === '=') {
        at++;
        while (/[\t\n\f ]/.test(source[at] || '')) at++;
        const quote = source[at];
        if (quote === '"' || quote === "'") {
          const close = source.indexOf(quote, at + 1);
          if (close < 0) fail('Unclosed attribute value in <' + raw + '>', start);
          value = source.slice(at + 1, close);
          at = close + 1;
        } else {
          const unquoted = /[^\t\n\f >]*/y;
          unquoted.lastIndex = at;
          value = unquoted.exec(source)[0];
          if (!value) fail('Missing attribute value in <' + raw + '>', start);
          at += value.length;
        }
      }
      attrs.push([nameText[0], decode(value, () => ' in an attribute of <' + raw + '> (line ' + lineAt(start) + ')')]);
    }
    if (end && attrs.length) fail('Attributes on end tag </' + raw + '>', start);
    return { end, raw, name: raw.toLowerCase(), attrs, selfClosing, next: at };
  }

  // Raw text (script, style) and escapable raw text (title, textarea) end at the first matching end tag.
  function readText(name, escapable, at) {
    const re = new RegExp('</' + name + '(?=[\\t\\n\\f />])', 'ig');
    re.lastIndex = at;
    const match = re.exec(source);
    if (!match) fail('Unclosed <' + name + '>', at);
    let text = source.slice(at, match.index);
    if (name === 'script' && /<!--/.test(text)) fail('"<!--" inside <script> is not supported', at);
    if (escapable) text = decode(text, () => ' in <' + name + '> (line ' + lineAt(at) + ')');
    const tag = readTag(match.index);
    return { text, next: tag.next };
  }

  function htmlAttrs(attrs) { return attrs.map(([key, value]) => [key.toLowerCase(), value]); }

  function startForeign(tag) {
    const el = insert(tag.raw, tag.attrs, true);
    if (!tag.selfClosing) stack.push(el);
  }

  function foreignToken(token) {
    const node = current();
    if (token.type === 'text') return insertText(token.text);
    if (token.type === 'start') {
      if (node.localName === 'foreignObject' || TEXT_INTEGRATION.has(node.localName) &&
        !['mglyph', 'malignmark'].includes(token.name)) {
        fail('Elements inside <' + node.localName + '> are not supported', token.at);
      }
      if (BREAKOUT.has(token.name) || token.name === 'font' && token.attrs.some(([key]) => /^(color|face|size)$/i.test(key))) {
        fail('<' + token.name + '> inside <svg> or <math> leaves the figure; close the figure first', token.at);
      }
      return startForeign(token.tag);
    }
    if (node.localName.toLowerCase() !== token.name) fail('</' + token.name + '> does not match <' + node.localName + '>', token.at);
    stack.pop();
  }

  function headToken(token) {
    if (named(current(), 'noscript')) {
      if (token.type === 'text' && SPACE.test(token.text)) return insertText(token.text);
      if (token.type === 'start' && ['link', 'meta', 'style'].includes(token.name)) return element(token);
      if (token.type === 'end' && token.name === 'noscript') { stack.pop(); return; }
      fail('Only <link>, <meta>, and <style> are supported in a <noscript> in <head>', token.at);
    }
    if (token.type === 'start' && token.name === 'template') fail('<template> in <head> is not supported', token.at);
    if (token.type === 'text') {
      const space = /^[\t\n\f ]*/.exec(token.text)[0];
      insertText(space);
      if (space.length === token.text.length) return;
      token = { ...token, text: token.text.slice(space.length) };
    } else if (token.type === 'start' && HEAD_TAGS.has(token.name)) {
      return element(token);
    } else if (token.type === 'start' && token.name === 'noscript') {
      return element(token);
    } else if (token.type === 'end' && token.name === 'head') {
      stack.pop();
      mode = 'after-head';
      return;
    } else if (token.type === 'start' && token.name === 'head') {
      fail('Repeated <head>', token.at);
    } else if (token.type === 'end' && !['body', 'html', 'br'].includes(token.name)) {
      fail('Unexpected </' + token.name + '> in <head>', token.at);
    }
    stack.pop();
    mode = 'after-head';
    process(token);
  }

  function afterHeadToken(token) {
    if (token.type === 'text') {
      const space = /^[\t\n\f ]*/.exec(token.text)[0];
      insertText(space);
      if (space.length === token.text.length) return;
      token = { ...token, text: token.text.slice(space.length) };
    } else if (token.type === 'start' && token.name === 'body') {
      body = insert('body', htmlAttrs(token.attrs));
      stack.push(body);
      mode = 'body';
      return;
    } else if (token.type === 'start' && (HEAD_TAGS.has(token.name) || token.name === 'head')) {
      fail('<' + token.name + '> after </head>; move it into <head>', token.at);
    } else if (token.type === 'end' && !['body', 'html', 'br'].includes(token.name)) {
      fail('Unexpected </' + token.name + '> before <body>', token.at);
    }
    body = insert('body', []);
    stack.push(body);
    mode = 'body';
    process(token);
  }

  // Elements whose start tags insert content directly.
  function element(token) {
    const name = token.name;
    const attrs = htmlAttrs(token.attrs);
    if (RAW.has(name) || name === 'title' || name === 'textarea') {
      const el = insert(name, attrs);
      const { text, next } = readText(name, !RAW.has(name), token.next);
      insertText(name === 'textarea' && text[0] === '\n' ? text.slice(1) : text, el);
      pos = next;
      return;
    }
    const el = insert(name, attrs);
    if (VOID.has(name)) return;
    if (token.selfClosing) fail('<' + token.raw + '/> is not self-closing in HTML; add </' + name + '>', token.at);
    stack.push(el);
    if (name === 'pre' || name === 'listing') {
      if (source[token.next] === '\n') pos = token.next + 1;
    }
  }

  function cellOpen() {
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i];
      if (!node.foreign && (node.localName === 'td' || node.localName === 'th')) return node.localName;
      if (!node.foreign && ['html', 'table', 'template'].includes(node.localName)) return null;
    }
    return null;
  }

  function tableToken(token) {
    const node = current();
    const where = node.localName;
    if (token.type === 'text') {
      if (!SPACE.test(token.text)) fail('Text directly inside <' + where + '>; put it in a cell or caption', token.at);
      return insertText(token.text);
    }
    const { type, name } = token;
    if (type === 'start' && ['script', 'style', 'template'].includes(name)) return element(token);
    if (type === 'start' && name === 'input' && token.attrs.some(([key, value]) => key.toLowerCase() === 'type' && value.toLowerCase() === 'hidden')) {
      return element(token);
    }
    if (where === 'colgroup') {
      if (type === 'start' && name === 'col') return element(token);
      if (type === 'end' && name === 'colgroup') { stack.pop(); return; }
      if (type === 'end' && name === 'col') fail('Unexpected </col>', token.at);
      stack.pop();
      return process(token);
    }
    if (where === 'table') {
      if (type === 'start') {
        if (name === 'caption' || name === 'colgroup' || TABLE_ROWS.has(name)) return element(token);
        if (name === 'col') { stack.push(insert('colgroup', [])); return process(token); }
        if (name === 'tr' || name === 'td' || name === 'th') { stack.push(insert('tbody', [])); return process(token); }
      } else if (name === 'table') {
        stack.pop();
        return;
      }
      fail((type === 'start' ? '<' : '</') + name + '> directly inside <table>; put it in a cell or caption', token.at);
    }
    if (TABLE_ROWS.has(where)) {
      if (type === 'start' && name === 'tr') return element(token);
      if (type === 'start' && (name === 'td' || name === 'th')) { stack.push(insert('tr', [])); return process(token); }
      if (type === 'start' && (TABLE_ROWS.has(name) || ['caption', 'col', 'colgroup'].includes(name)) ||
        type === 'end' && name === 'table') {
        stack.pop();
        return process(token);
      }
      if (type === 'end' && name === where) { stack.pop(); return; }
      fail((type === 'start' ? '<' : '</') + name + '> directly inside <' + where + '>; put it in a cell', token.at);
    }
    // A row.
    if (type === 'start' && (name === 'td' || name === 'th')) return element(token);
    if (type === 'end' && name === 'tr') { stack.pop(); return; }
    if (type === 'start' && TABLE_PARTS.has(name) || type === 'end' && (name === 'table' || TABLE_ROWS.has(name))) {
      stack.pop();
      return process(token);
    }
    fail((type === 'start' ? '<' : '</') + name + '> directly inside <tr>; put it in a cell', token.at);
  }

  function selectToken(token) {
    const { type, name } = token;
    if (token.type === 'text') return insertText(token.text);
    if (type === 'start' && name === 'option') {
      if (named(current(), 'option')) stack.pop();
      return element(token);
    }
    if (type === 'start' && name === 'optgroup') {
      if (named(current(), 'option')) stack.pop();
      if (named(current(), 'optgroup')) stack.pop();
      return element(token);
    }
    if (type === 'start' && (name === 'hr' || name === 'script' || name === 'template')) {
      if (name === 'hr') {
        if (named(current(), 'option')) stack.pop();
        if (named(current(), 'optgroup')) stack.pop();
      }
      return element(token);
    }
    if (type === 'end' && (name === 'option' || name === 'optgroup')) {
      if (name === 'optgroup' && named(current(), 'option') && named(stack[stack.length - 2], 'optgroup')) stack.pop();
      if (!named(current(), name)) fail('Unexpected </' + name + '>', token.at);
      stack.pop();
      return;
    }
    if (type === 'end' && name === 'select') return close('select');
    fail((type === 'start' ? '<' : '</') + name + '> inside <select> is not supported', token.at);
  }

  function bodyStart(token) {
    const name = token.name;
    if (UNSUPPORTED.has(name) || ['html', 'body', 'head'].includes(name)) fail('<' + name + '> is not supported here', token.at);
    if (TABLE_PARTS.has(name)) {
      const cell = cellOpen();
      if (cell || inTableScope('caption')) {
        close(cell || 'caption');
        return process(token);
      }
      fail('<' + name + '> outside a table', token.at);
    }
    if (name === 'svg' || name === 'math') return startForeign(token.tag);
    if (HEAD_TAGS.has(name)) return element(token);
    if (CLOSES_P.has(name)) { closeP(); return element(token); }
    if (HEADINGS.has(name)) {
      closeP();
      if (HEADINGS.has(current().localName)) fail('<' + name + '> inside an open heading', token.at);
      return element(token);
    }
    if (name === 'pre' || name === 'listing') { closeP(); return element(token); }
    if (name === 'form') {
      if (form) fail('Nested <form>', token.at);
      closeP();
      element(token);
      form = current();
      return;
    }
    if (name === 'li' || name === 'dd' || name === 'dt') {
      const ends = name === 'li' ? ['li'] : ['dd', 'dt'];
      for (let i = stack.length - 1; i > 0; i--) {
        const node = stack[i];
        if (!node.foreign && ends.includes(node.localName)) { close(node.localName); break; }
        if (node.foreign || SPECIAL.has(node.localName) && !['address', 'div', 'p'].includes(node.localName)) break;
      }
      closeP();
      return element(token);
    }
    if (name === 'button' && inScope('button')) fail('Nested <button>', token.at);
    if (name === 'a') {
      for (let i = stack.length - 1; i > 0 && !MARKERS.has(stack[i].localName); i--) {
        if (named(stack[i], 'a')) fail('Nested <a>', token.at);
      }
    }
    if (name === 'nobr' && inScope('nobr')) fail('Nested <nobr>', token.at);
    if (name === 'table') { closeP(); return element(token); }
    if (name === 'hr') { closeP(); return element(token); }
    if (name === 'option' || name === 'optgroup') {
      if (named(current(), 'option')) stack.pop();
      return element(token);
    }
    if (name === 'rb' || name === 'rtc' || name === 'rt' || name === 'rp') {
      if (inScope('ruby')) {
        const keep = name === 'rt' || name === 'rp' ? set('rtc') : new Set();
        while (IMPLIED.has(current().localName) && !keep.has(current().localName)) stack.pop();
      }
      return element(token);
    }
    return element(token);
  }

  function bodyEnd(token) {
    const name = token.name;
    if (name === 'body' || name === 'html') {
      if (!inScope('body')) fail('Unexpected </' + name + '>', token.at);
      mode = name === 'body' ? 'after-body' : 'after-after-body';
      return;
    }
    if (TABLE_PARTS.has(name) || name === 'table') {
      const cell = cellOpen();
      if (cell && (name === 'td' || name === 'th')) {
        if (cell !== name) fail('</' + name + '> closes a <' + cell + '>', token.at);
        return close(cell);
      }
      if (cell && (name === 'tr' || name === 'table' || TABLE_ROWS.has(name))) {
        close(cell);
        return process(token);
      }
      if (name === 'caption' && inTableScope('caption')) return close('caption');
      if (inTableScope('caption') && name === 'table') { close('caption'); return process(token); }
      fail('Unexpected </' + name + '>', token.at);
    }
    if (BLOCK_END.has(name)) {
      if (!inScope(name)) fail('Unexpected </' + name + '>', token.at);
      return close(name);
    }
    if (name === 'form') {
      if (!form || !inScope('form')) fail('Unexpected </form>', token.at);
      form = null;
      return close('form');
    }
    if (name === 'p') {
      if (!inScope('p', BUTTON)) fail('</p> without an open <p>', token.at);
      return close('p');
    }
    if (name === 'li') {
      if (!inScope('li', LIST)) fail('</li> without an open <li>', token.at);
      return close('li');
    }
    if (name === 'dd' || name === 'dt') {
      if (!inScope(name)) fail('</' + name + '> without an open <' + name + '>', token.at);
      return close(name);
    }
    if (HEADINGS.has(name) || FORMATTING.has(name)) {
      if (!named(current(), name)) fail('</' + name + '> does not match the open <' + current().localName + '>', token.at);
      stack.pop();
      return;
    }
    if (name === 'br' || VOID.has(name)) fail('End tag </' + name + '> for a void element', token.at);
    for (let i = stack.length - 1; i > 0; i--) {
      const node = stack[i];
      if (named(node, name)) return close(name);
      if (node.foreign || SPECIAL.has(node.localName) || FORMATTING.has(node.localName)) break;
    }
    fail('</' + name + '> does not match an open element', token.at);
  }

  function process(token) {
    if (token.type === 'comment') {
      const parent = mode === 'after-body' || mode === 'after-after-body' || mode === 'before-head' ? html :
        mode === 'after-head' ? html : parentOf(current());
      parent.appendChild(doc.createComment(token.text));
      return;
    }
    if (token.type === 'doctype') {
      if (mode !== 'before-head' || html.childNodes.length) fail('Misplaced doctype', token.at);
      return;
    }
    if (mode === 'before-head') {
      if (token.type === 'text') {
        const text = token.text.replace(/^[\t\n\f ]+/, '');
        if (!text) return;
        token = { ...token, text };
      } else if (token.type === 'start' && token.name === 'html') {
        return;
      } else if (token.type === 'start' && token.name === 'head') {
        head = insert('head', htmlAttrs(token.attrs));
        stack.push(head);
        mode = 'head';
        return;
      } else if (token.type === 'end' && !['head', 'body', 'html', 'br'].includes(token.name)) {
        fail('Unexpected </' + token.name + '> before <head>', token.at);
      }
      head = insert('head', []);
      stack.push(head);
      mode = 'head';
      return process(token);
    }
    if (mode === 'head') return headToken(token);
    if (mode === 'after-head') return afterHeadToken(token);
    if (mode === 'after-body' || mode === 'after-after-body') {
      if (token.type === 'text' && SPACE.test(token.text)) return insertText(token.text);
      if (token.type === 'end' && token.name === 'html') { mode = 'after-after-body'; return; }
      fail('Content after </body>', token.at);
    }
    if (current().foreign) return foreignToken(token);
    if (TABLE_CONTEXT.has(current().localName)) return tableToken(token);
    if (stack.some(node => named(node, 'select')) && ['select', 'option', 'optgroup'].includes(current().localName)) {
      return selectToken(token);
    }
    if (token.type === 'text') return insertText(token.text);
    return token.type === 'start' ? bodyStart(token) : bodyEnd(token);
  }

  while (pos < source.length) {
    const lt = source.indexOf('<', pos);
    const textEnd = lt < 0 ? source.length : lt;
    if (textEnd > pos) {
      const raw = source.slice(pos, textEnd);
      const at = pos;
      pos = textEnd;
      process({ type: 'text', text: decode(raw, () => ' (line ' + lineAt(at) + ')'), at });
      continue;
    }
    const at = pos;
    if (source.startsWith('<!--', at)) {
      const end = source.indexOf('-->', at + 4);
      const text = end < 0 ? '' : source.slice(at + 4, end);
      if (end < 0 || /^-?>|--!?$|--!>/.test(text) || text.includes('--!>')) fail('Malformed comment', at);
      pos = end + 3;
      process({ type: 'comment', text, at });
      continue;
    }
    if (/^<!doctype[\t\n\f ]/i.test(source.slice(at, at + 10))) {
      const end = source.indexOf('>', at);
      if (end < 0 || !/^<!doctype[\t\n\f ]+html[\t\n\f ]*>$/i.test(source.slice(at, end + 1))) fail('Use <!doctype html>', at);
      pos = end + 1;
      process({ type: 'doctype', at });
      continue;
    }
    if (current().foreign && source.startsWith('<![CDATA[', at)) {
      const end = source.indexOf(']]>', at);
      if (end < 0) fail('Unclosed CDATA section', at);
      pos = end + 3;
      process({ type: 'text', text: source.slice(at + 9, end), at });
      continue;
    }
    if (/^<\/?[A-Za-z]/.test(source.slice(at, at + 3))) {
      const tag = readTag(at);
      pos = tag.next;
      process({ type: tag.end ? 'end' : 'start', name: tag.name, raw: tag.raw, attrs: tag.attrs,
        selfClosing: tag.selfClosing, next: tag.next, tag, at });
      continue;
    }
    if (/^<[!?/]/.test(source.slice(at, at + 2))) fail('Unsupported markup ' + JSON.stringify(source.slice(at, at + 12)), at);
    pos = at + 1;
    process({ type: 'text', text: '<', at });
  }

  if (mode === 'before-head') { head = insert('head', []); stack.push(head); mode = 'head'; }
  if (mode === 'head') { stack.pop(); mode = 'after-head'; }
  if (mode === 'after-head') { body = insert('body', []); stack.push(body); }
}

const BUTTON = set('button');
const LIST = set('ol ul');
const MARKERS = set('td th caption template applet object marquee html');
const FOREIGN_SCOPE = set('mi mo mn ms mtext annotation-xml foreignObject desc title');
const TEXT_INTEGRATION = set('mi mo mn ms mtext');

// Selectors: tag, #id, .class, [attr], [attr="v"], :not(...), and descendant and child combinators.
function splitSelector(text, sep) {
  const out = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of text) {
    if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && !depth) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

const selectorCache = new Map();
function parseSelector(selector) {
  if (selectorCache.has(selector)) return selectorCache.get(selector);
  const list = splitSelector(selector, ',').map(complex => {
    const parts = [];
    let combinator = null;
    for (const token of splitSelector(complex.replace(/\s*>\s*/g, ' > '), ' ')) {
      if (token === '>') { combinator = '>'; continue; }
      parts.push({ compound: compound(token), combinator });
      combinator = ' ';
    }
    return parts;
  });
  selectorCache.set(selector, list);
  return list;
}

function compound(token) {
  const tests = [];
  const re = /^(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([^\]=~|^$*\s]+)(?:=(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\]]+)))?\]|:not\(((?:[^()]|\([^()]*\))*)\)/g;
  let m;
  let used = 0;
  while ((m = re.exec(token)) && m[0]) {
    if (m.index !== used) throw Error('Unsupported selector ' + token);
    used = re.lastIndex;
    if (m[1]) { const tag = m[1].toLowerCase(); if (tag !== '*') tests.push(el => el.localName.toLowerCase() === tag); }
    else if (m[2]) { const id = m[2]; tests.push(el => el.id === id); }
    else if (m[3]) { const cls = m[3]; tests.push(el => el.classList.contains(cls)); }
    else if (m[4]) {
      const name = m[4];
      const value = m[5] !== undefined ? m[5].replace(/\\(.)/g, '$1') : m[6] ?? m[7];
      tests.push(el => el.hasAttribute(name) && (value === undefined || el.getAttribute(name) === value));
    } else { const inner = parseSelector(m[8]); tests.push(el => !test(el, inner)); }
  }
  if (used !== token.length) throw Error('Unsupported selector ' + token);
  return el => tests.every(t => t(el));
}

function test(el, list) {
  return list.some(parts => matchFrom(el, parts, parts.length - 1));
}

function matchFrom(el, parts, i) {
  if (!parts[i].compound(el)) return false;
  if (i === 0) return true;
  for (let n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) {
    if (matchFrom(n, parts, i - 1)) return true;
    if (parts[i].combinator === '>') return false;
  }
  return false;
}

function parseHTML(source) {
  const doc = createHTMLDocument();
  doc.documentElement.innerHTML = source;
  return doc;
}

// The shipped builder, run with the parser above and without a page. The boot stub gives data-op-* flags the same
// meaning as in tools/assets.html.
function builder() {
  const issues = [];
  const context = vm.createContext({ URL, crypto: webcrypto, TextDecoder, console: { warn() {} } });
  context.window = context;
  context.addEventListener = () => {};
  context.location = { href: 'file:///offprint/tools/assets.html' };
  context.document = createHTMLDocument();
  context.document.addEventListener = () => {};
  context.document.readyState = 'loading';
  context.OffPrint = { _boot: {
    report(code, feature, host, message) { issues.push(message); },
    optionLayers() { return []; },
    merge(...layers) { return Object.assign({}, ...layers); }
  } };
  for (const file of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(LIBRARY, file), 'utf8'), context, { filename: file });
  }
  return { build: context.OffPrint._assetBuild, issues };
}

// Site files as the browser folder picker lists them, read on demand. Folders starting with "." are left out.
function siteFiles(folder) {
  const files = new Map();
  (function read(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) read(full, prefix + entry.name + '/');
      } else if (entry.isFile()) {
        let bytes = null;
        const load = () => bytes || (bytes = fs.readFileSync(full));
        files.set(prefix + entry.name, {
          arrayBuffer: async () => { const b = load(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
          text: async () => new TextDecoder().decode(load())
        });
      }
    }
  })(folder, '');
  return files;
}

async function inspect(folder, options = {}) {
  const { build, issues } = builder();
  const files = siteFiles(folder);
  const diagnostics = [];
  let manifest = options.manifest;
  let protectedPaths = [];
  if (manifest) {
    manifest = manifest.split(path.sep).join('/');
    if (!files.has(manifest)) throw Error('No manifest at ' + manifest + ' in ' + folder + '.');
    protectedPaths = [manifest];
  } else {
    const found = await build.discover(files, parseHTML);
    diagnostics.push(...found.diagnostics);
    if (found.paths.length !== 1) {
      throw Error(found.paths.length ? 'Found several manifests (' + found.paths.join(', ') + '); pass --manifest.' :
        'No page in ' + folder + ' loads a manifest with data-op-site.');
    }
    manifest = found.paths[0];
    protectedPaths = found.paths;
  }
  const site = build.parseManifest(await files.get(manifest).text());
  if (options.search) {
    site.assets = site.assets && typeof site.assets === 'object' && !Array.isArray(site.assets) &&
      site.assets.search !== undefined ? { search: site.assets.search } : {};
  }
  const report = await build.inspect(files, site, manifest, protectedPaths, parseHTML);
  return { manifest, jobs: report.jobs, diagnostics: diagnostics.concat(report.diagnostics || [], issues) };
}

function replace(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const staged = path.join(path.dirname(file), '.' + path.basename(file) + '.' + process.pid + '.tmp');
  try {
    fs.writeFileSync(staged, text);
    fs.renameSync(staged, file);
  } finally {
    fs.rmSync(staged, { force: true });
  }
}

async function main(args) {
  const known = /^--(check|search|manifest=.+)$/;
  const flags = args.filter(arg => arg.startsWith('--'));
  const folders = args.filter(arg => !arg.startsWith('--'));
  const bad = flags.find(flag => !known.test(flag));
  if (bad || folders.length !== 1) {
    throw Error((bad ? 'Unknown option ' + bad + '. ' : '') +
      'Usage: node refresh-assets.js <site-folder> [--manifest=<path>] [--check] [--search]');
  }
  const folder = path.resolve(folders[0]);
  const check = flags.includes('--check');
  const manifestFlag = flags.find(flag => flag.startsWith('--manifest='));
  const result = await inspect(folder, { manifest: manifestFlag && manifestFlag.slice(11), search: flags.includes('--search') });
  result.diagnostics.forEach(message => console.error('Note: ' + message));
  const blocked = result.jobs.filter(job => job.status === 'blocked');
  const pending = result.jobs.filter(job => job.status === 'missing' || job.status === 'stale');
  for (const job of result.jobs) {
    const label = job.output || job.label;
    const warnings = job.warnings && job.warnings.length ? ' (' + job.warnings.join(' ') + ')' : '';
    if (job.status === 'blocked') console.error('Blocked: ' + label + ' — ' + job.errors.join(' '));
    else if (job.status === 'current') console.log('Current: ' + label + warnings);
    else if (check || blocked.length) console.log((job.status === 'missing' ? 'Missing: ' : 'Stale: ') + label + warnings);
  }
  if (blocked.length) {
    if (!check && pending.length) console.error('Nothing was written because an output is blocked.');
    return 1;
  }
  if (check) return pending.length ? 1 : 0;
  for (const job of pending) {
    replace(path.join(folder, ...job.output.split('/')), job.script);
    console.log('Updated: ' + job.output + (job.warnings && job.warnings.length ? ' (' + job.warnings.join(' ') + ')' : ''));
  }
  return 0;
}

module.exports = { parseHTML, createHTMLDocument, inspect, ParseError };
if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
