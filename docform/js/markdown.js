// Safe Markdown rendering for data views: CommonMark-style blocks, GFM tables and task lists, and inline marks.
// Raw HTML stays text, and links and images keep only relative, http(s), or mailto targets.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] markdown.js needs core.js loaded before it.');
    return;
  }

  var FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
  var HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
  var RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  var QUOTE = /^ {0,3}> ?/;
  var ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/;
  var DELIMITER = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;
  var PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  // Relative targets and http, https, or mailto URLs; anything else (javascript:, data:, ...) is dropped.
  function safeUrl(url, image) {
    var t = String(url).replace(/[\u0000- \u007f]/g, '');
    var scheme = /^([a-z][a-z\d+.-]*):/i.exec(t);
    if (!scheme) return true;
    return image ? /^https?$/i.test(scheme[1]) : /^(?:https?|mailto)$/i.test(scheme[1]);
  }

  // [text](url "title") or ![alt](url "title") at i: { end, label, url, title } or null.
  function linkAt(src, i) {
    var depth = 0;
    var j = i;
    for (; j < src.length; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '[') depth++;
      else if (src[j] === ']' && --depth === 0) break;
    }
    if (j >= src.length || src[j + 1] !== '(') return null;
    var m = /^\(\s*(<[^<>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+("[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/.exec(src.slice(j + 1));
    if (!m) return null;
    var url = m[1].replace(/^<|>$/g, '');
    return { end: j + 1 + m[0].length, label: src.slice(i + 1, j), url: url, title: m[2] ? m[2].slice(1, -1) : null };
  }

  // A closing run of marker at or after from that is not preceded by whitespace; -1 when absent.
  function closer(src, marker, from) {
    for (var k = src.indexOf(marker, from); k >= 0; k = src.indexOf(marker, k + 1)) {
      if (src[k - 1] === '\\' || /\s/.test(src[k - 1] || ' ')) continue;
      if (marker.charAt(0) === '_' && /[\p{L}\p{N}]/u.test(src[k + marker.length] || '')) continue;
      if (marker.length === 1 && src[k + 1] === marker) { k++; continue; }
      return k;
    }
    return -1;
  }

  function inline(src, parent) {
    var text = '';
    var flush = function () {
      if (text) parent.appendChild(document.createTextNode(text));
      text = '';
    };
    var add = function (node) { flush(); parent.appendChild(node); };
    var i = 0;
    while (i < src.length) {
      var c = src[i];
      if (c === '\\' && src[i + 1] === '\n') { add(make('br')); i += 2; continue; }
      if (c === '\\' && PUNCTUATION.test(src[i + 1] || '')) { text += src[i + 1]; i += 2; continue; }
      if (c === '\n') {
        if (/ {2,}$/.test(text)) { text = text.replace(/ +$/, ''); add(make('br')); }
        else text = text.replace(/ +$/, '') + '\n';
        i++;
        continue;
      }
      if (c === '`') {
        var run = /^`+/.exec(src.slice(i))[0];
        var end = src.indexOf(run, i + run.length);
        while (end >= 0 && src[end + run.length] === '`') end = src.indexOf(run, end + run.length + 1);
        if (end < 0) { text += run; i += run.length; continue; }
        var code = src.slice(i + run.length, end).replace(/\n/g, ' ');
        if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
        add(make('code', null, code));
        i = end + run.length;
        continue;
      }
      if (c === '!' && src[i + 1] === '[') {
        var image = linkAt(src, i + 1);
        if (image) {
          if (safeUrl(image.url, true)) {
            var img = make('img');
            img.src = image.url;
            img.alt = image.label;
            if (image.title) img.title = image.title;
            img.loading = 'lazy';
            add(img);
          } else text += image.label;
          i = image.end;
          continue;
        }
      }
      if (c === '[') {
        var link = linkAt(src, i);
        if (link) {
          var target = safeUrl(link.url) ? make('a') : make('span');
          if (target.tagName === 'A') target.href = link.url;
          if (link.title) target.title = link.title;
          inline(link.label, target);
          add(target);
          i = link.end;
          continue;
        }
      }
      if (c === '<') {
        var auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(src.slice(i));
        if (auto) {
          var a = make('a', null, auto[1].replace(/^mailto:/i, ''));
          a.href = auto[1];
          add(a);
          i += auto[0].length;
          continue;
        }
      }
      var marker = /^(\*\*|__|~~|\*|_)/.exec(src.slice(i));
      if (marker && !/\s/.test(src[i + marker[0].length] || ' ') &&
          !(marker[0].charAt(0) === '_' && /[\p{L}\p{N}]/u.test(src[i - 1] || ''))) {
        var close = closer(src, marker[0], i + marker[0].length + 1);
        if (close > 0) {
          var mark = make(marker[0] === '~~' ? 'del' : marker[0].length === 2 ? 'strong' : 'em');
          inline(src.slice(i + marker[0].length, close), mark);
          add(mark);
          i = close + marker[0].length;
          continue;
        }
      }
      text += c;
      i++;
    }
    flush();
    return parent;
  }

  function cellsOf(line) {
    var t = line.trim().replace(/^\|/, '');
    if (/(?:^|[^\\])\|$/.test(t)) t = t.slice(0, -1);
    var cells = [];
    var cell = '';
    for (var i = 0; i < t.length; i++) {
      if (t[i] === '\\' && t[i + 1] === '|') { cell += '|'; i++; }
      else if (t[i] === '|') { cells.push(cell.trim()); cell = ''; }
      else cell += t[i];
    }
    cells.push(cell.trim());
    return cells;
  }

  function buildTable(head, delimiter, rows) {
    var aligns = cellsOf(delimiter).map(function (d) {
      return /^:-+:$/.test(d) ? 'center' : /-:$/.test(d) ? 'right' : /^:/.test(d) ? 'left' : '';
    });
    var table = make('table');
    var tr = table.createTHead().insertRow();
    var add = function (row, cells, tag) {
      aligns.forEach(function (align, k) {
        var cell = row.appendChild(make(tag));
        if (tag === 'th') cell.setAttribute('scope', 'col');
        if (align) cell.style.textAlign = align;
        inline(cells[k] || '', cell);
      });
    };
    add(tr, cellsOf(head), 'th');
    var body = table.appendChild(make('tbody'));
    rows.forEach(function (line) { add(body.insertRow(), cellsOf(line), 'td'); });
    return table;
  }

  function startsBlock(line, next) {
    return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line) && /\S/.test(line.replace(ITEM, '')) ||
      line.indexOf('|') >= 0 && next !== undefined && DELIMITER.test(next) && next.indexOf('-') >= 0;
  }

  // Appends the blocks of lines to parent. Tight list items take their paragraphs inline.
  function blocks(lines, parent, tight) {
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }
      var m;
      if ((m = FENCE.exec(line))) {
        var fence = m[1];
        var body = [];
        var indent = /^ */.exec(line)[0].length;
        for (i++; i < lines.length && !new RegExp('^ {0,3}' + fence.charAt(0) + '{' + fence.length + ',}\\s*$').test(lines[i]); i++) {
          body.push(lines[i].replace(new RegExp('^ {0,' + indent + '}'), ''));
        }
        i++;
        var pre = make('pre');
        if (m[2]) pre.setAttribute('data-df-lang', m[2]);
        pre.appendChild(make('code', null, body.join('\n')));
        parent.appendChild(pre);
        continue;
      }
      if (/^(?: {4}|\t)/.test(line) && !tight) {
        var code = [];
        while (i < lines.length && (/^(?: {4}|\t)/.test(lines[i]) || !lines[i].trim())) code.push(lines[i++].replace(/^(?: {4}|\t)/, ''));
        while (code.length && !code[code.length - 1].trim()) code.pop();
        var block = make('pre');
        block.appendChild(make('code', null, code.join('\n')));
        parent.appendChild(block);
        continue;
      }
      if ((m = HEADING.exec(line))) {
        var level = m[1].length;
        var heading = make('div', 'df-md-heading df-md-h' + level);
        heading.setAttribute('role', 'heading');
        heading.setAttribute('aria-level', String(level));
        parent.appendChild(inline(m[2] || '', heading));
        i++;
        continue;
      }
      if (RULE.test(line)) { parent.appendChild(make('hr')); i++; continue; }
      if (QUOTE.test(line)) {
        var quoted = [];
        while (i < lines.length && lines[i].trim() && (QUOTE.test(lines[i]) || !startsBlock(lines[i], lines[i + 1]))) {
          quoted.push(lines[i++].replace(QUOTE, ''));
        }
        blocks(quoted, parent.appendChild(make('blockquote')), false);
        continue;
      }
      if (ITEM.test(line)) {
        i = list(lines, i, parent);
        continue;
      }
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && DELIMITER.test(lines[i + 1]) && lines[i + 1].indexOf('-') >= 0) {
        var rows = [];
        var j = i + 2;
        while (j < lines.length && lines[j].trim() && lines[j].indexOf('|') >= 0) rows.push(lines[j++]);
        parent.appendChild(buildTable(line, lines[i + 1], rows));
        i = j;
        continue;
      }
      var para = [line.trim()];
      for (i++; i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1]); i++) para.push(lines[i].replace(/^\s+/, ''));
      var text = para.join('\n');
      if (tight) inline(text, parent);
      else parent.appendChild(inline(text, make('p')));
    }
    return parent;
  }

  // One list starting at lines[i]; returns the index after it.
  function list(lines, i, parent) {
    var first = ITEM.exec(lines[i]);
    var ordered = /\d/.test(first[2]);
    var bullet = first[2].slice(-1);
    var el = make(ordered ? 'ol' : 'ul');
    if (ordered && parseInt(first[2], 10) !== 1) el.start = parseInt(first[2], 10);
    var items = [];
    var loose = false;
    var sameList = function (m) { return !!m && /\d/.test(m[2]) === ordered && m[2].slice(-1) === bullet; };
    while (i < lines.length) {
      var m = ITEM.exec(lines[i]);
      if (!sameList(m)) break;
      var width = m[0].length + (m[3] ? 0 : 1);
      var body = [lines[i].slice(m[0].length)];
      var blank = false;
      for (i++; i < lines.length; i++) {
        var line = lines[i];
        if (!line.trim()) { blank = true; body.push(''); continue; }
        var indent = /^ */.exec(line)[0].length;
        if (indent >= width) { if (blank) loose = true; body.push(line.slice(width)); blank = false; continue; }
        if (blank || startsBlock(line, lines[i + 1])) break;
        body.push(line.trim());
      }
      while (body.length && !body[body.length - 1].trim()) body.pop();
      if (blank && i < lines.length && sameList(ITEM.exec(lines[i]))) loose = true;
      items.push(body);
    }
    items.forEach(function (body) {
      var li = el.appendChild(make('li'));
      var task = /^\[([ xX])\][ \t]+/.exec(body[0]);
      if (task) {
        var box = make('input');
        box.type = 'checkbox';
        box.disabled = true;
        box.checked = task[1] !== ' ';
        li.className = 'df-md-task';
        li.appendChild(box);
        body[0] = body[0].slice(task[0].length);
      }
      blocks(body, li, !loose);
    });
    parent.appendChild(el);
    return i;
  }

  function render(text) {
    var out = make('div', 'df-markdown');
    var lines = String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    return blocks(lines, out, false);
  }

  DocForm._markdown = { render: render, safeUrl: safeUrl };
})(typeof window !== 'undefined' ? window : globalThis);
