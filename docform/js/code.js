(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] code.js needs core.js loaded before it.');
    return;
  }

  function words(list) {
    var set = Object.create(null);
    list.split(' ').forEach(function (w) { set[w] = true; });
    return set;
  }

  // Classifies an identifier from the surrounding source: keyword sets, a name after a declaring keyword, or a call.
  function ident(keywords, literals, builtins, declare) {
    return function (m, src, start) {
      var word = m[0];
      var end = start + word.length;
      if (keywords[word]) return 'keyword';
      if (literals[word]) return 'literal';
      if (declare && declare.test(src.slice(Math.max(0, start - 12), start))) return 'function';
      if (/^\s*\(/.test(src.slice(end, end + 40))) return 'function';
      if (builtins && builtins[word]) return 'builtin';
      return null;
    };
  }

  var JS_STRING = /'(?:\\[\s\S]|[^\\'\n])*'?|"(?:\\[\s\S]|[^\\"\n])*"?|`(?:\\[\s\S]|[^\\`])*`?/y;
  var NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[nj]?/y;

  var LANGS = {
    js: [
      [/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, 'comment'],
      [JS_STRING, 'string'],
      [/[A-Za-z_$][\w$]*/y, ident(
        words('async await break case catch class const continue debugger default delete do else export extends ' +
          'finally for from function get if import in instanceof let new of return set static super switch throw ' +
          'try typeof var void while with yield'),
        words('true false null undefined NaN Infinity this'),
        words('Array Boolean console Date document Error JSON Map Math Number Object Promise RegExp Set String ' +
          'Symbol window'),
        /\b(?:function|class)\s+$/)],
      [NUMBER, 'number'],
      [/=>|[+\-*/%=&|^!<>?~]+/y, 'operator']
    ],
    python: [
      [/#[^\n]*/y, 'comment'],
      [/(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?)/y, 'string'],
      [/@[\w.]+/y, 'builtin'],
      [/[A-Za-z_]\w*/y, ident(
        words('and as assert async await break class continue def del elif else except finally for from global if ' +
          'import in is lambda match case nonlocal not or pass raise return try while with yield'),
        words('True False None self cls'),
        words('abs all any bool dict enumerate filter float int isinstance len list map max min open print range ' +
          'reversed round set sorted str sum super tuple type zip'),
        /\b(?:def|class)\s+$/)],
      [NUMBER, 'number'],
      [/[+\-*/%=&|^!<>~@]+/y, 'operator']
    ],
    css: [
      [/\/\*[\s\S]*?(?:\*\/|$)/y, 'comment'],
      [/'(?:\\.|[^\\'\n])*'?|"(?:\\.|[^\\"\n])*"?/y, 'string'],
      [/@[\w-]+/y, 'keyword'],
      [/!important\b/y, 'keyword'],
      [/(--?[A-Za-z_][\w-]*|[A-Za-z][\w-]*)(\s*:)(?=[^;{}]*(?:;|\}|$))/y, function (m) {
        return [{ type: 'property', text: m[1] }, { type: null, text: m[2] }];
      }],
      [/#[\da-fA-F]{3,8}\b/y, 'number'],
      [/-?(?:\d+\.?\d*|\.\d+)(?:%|[A-Za-z]+)?/y, 'number'],
      [/[\w-]+(?=\()/y, 'function'],
      [/[.#][A-Za-z_-][\w-]*/y, 'attr'],
      [/::?[A-Za-z-]+/y, 'keyword'],
      [/[A-Za-z_][\w-]*/y, null]
    ],
    shell: [
      [/(?<=^|\s)#[^\n]*/y, 'comment'],
      [/'[^']*'?|"(?:\\[\s\S]|[^\\"])*"?/y, 'string'],
      [/\$\{[^}\n]*\}?|\$\(|\$[\w@*#?$!-]/y, 'variable'],
      [/(?<=\s)--?[\w][\w-]*/y, 'attr'],
      [/[A-Za-z_][\w.-]*/y, function (m, src, start) {
        var word = m[0];
        if (SH_KEYWORDS[word]) return 'keyword';
        var before = src.slice(src.lastIndexOf('\n', start - 1) + 1, start);
        if (/^\s*$|(?:[|;&(]|\$\(|\b(?:then|do|else|sudo|time)\s)\s*$/.test(before)) return 'function';
        return null;
      }],
      [/\b\d[\d.]*\b/y, 'number'],
      [/[|&;<>]+/y, 'operator']
    ],
    html: [
      [/<!--[\s\S]*?(?:-->|$)/y, 'comment'],
      [/<![^>]*>?/y, 'keyword'],
      [/<\/?[A-Za-z](?:"[^"]*"?|'[^']*'?|[^'">])*>?/y, function (m) { return lex(m[0], TAG); }],
      [/&(?:#\d+|#x[\da-fA-F]+|\w+);/y, 'literal']
    ]
  };

  var SH_KEYWORDS = words('if then else elif fi for while until do done case esac in function return export ' +
    'local readonly source');

  var TAG = [
    [/<\/?|\/?>/y, 'punctuation'],
    [/(?<=<\/?)[\w:-]+/y, 'tag'],
    [/"[^"]*"?|'[^']*'?/y, 'string'],
    [/[^\s"'=<>/]+/y, 'attr']
  ];

  var ALIASES = {
    js: 'js', javascript: 'js', mjs: 'js', cjs: 'js', json: 'js',
    py: 'python', python: 'python',
    html: 'html', xml: 'html', svg: 'html',
    css: 'css',
    sh: 'shell', bash: 'shell', shell: 'shell', zsh: 'shell', console: 'shell'
  };

  var NAMES = { js: 'JavaScript', python: 'Python', html: 'HTML', css: 'CSS', shell: 'Shell', json: 'JSON', xml: 'XML', svg: 'SVG' };

  function push(out, type, text) {
    if (!text) return;
    var last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type: type, text: text });
  }

  // Tokenizes src with sticky-regex rules; unmatched characters become plain (type null) text.
  function lex(src, rules) {
    var out = [];
    var pos = 0;
    var plain = '';
    while (pos < src.length) {
      var matched = false;
      for (var i = 0; i < rules.length; i++) {
        var re = rules[i][0];
        re.lastIndex = pos;
        var m = re.exec(src);
        if (!m || !m[0]) continue;
        var kind = rules[i][1];
        var result = typeof kind === 'function' ? kind(m, src, pos) : kind;
        if (!Array.isArray(result)) result = [{ type: result, text: m[0] }];
        push(out, null, plain);
        plain = '';
        result.forEach(function (t) { push(out, t.type, t.text); });
        pos += m[0].length;
        matched = true;
        break;
      }
      if (!matched) plain += src[pos++];
    }
    push(out, null, plain);
    return out;
  }

  // HTML with embedded <script> and <style> bodies lexed as JavaScript and CSS.
  function lexHtml(src) {
    var out = [];
    var re = /<(script|style)\b[^>]*>/gi;
    var pos = 0;
    var m;
    while ((m = re.exec(src))) {
      var bodyStart = m.index + m[0].length;
      var close = src.toLowerCase().indexOf('</' + m[1].toLowerCase(), bodyStart);
      var bodyEnd = close < 0 ? src.length : close;
      lex(src.slice(pos, bodyStart), LANGS.html).forEach(function (t) { push(out, t.type, t.text); });
      lex(src.slice(bodyStart, bodyEnd), m[1].toLowerCase() === 'script' ? LANGS.js : LANGS.css)
        .forEach(function (t) { push(out, t.type, t.text); });
      pos = re.lastIndex = bodyEnd;
    }
    lex(src.slice(pos), LANGS.html).forEach(function (t) { push(out, t.type, t.text); });
    return out;
  }

  function language(name) {
    var key = String(name || '').trim().toLowerCase();
    return ALIASES[key] || null;
  }

  function tokenize(src, lang) {
    var key = language(lang);
    if (key === 'html') return lexHtml(String(src));
    if (key) return lex(String(src), LANGS[key]);
    return [{ type: null, text: String(src) }];
  }

  function escape(text) {
    return text.replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; });
  }

  function tokensHtml(tokens) {
    return tokens.map(function (t) {
      return t.type ? '<span class="df-tok-' + t.type + '">' + escape(t.text) + '</span>' : escape(t.text);
    }).join('');
  }

  function highlight(src, lang) {
    return tokensHtml(tokenize(src, lang));
  }

  // Splits a token stream into one token list per source line, breaking tokens that span lines.
  function tokenLines(tokens) {
    var lines = [[]];
    tokens.forEach(function (t) {
      String(t.text).split('\n').forEach(function (part, i) {
        if (i) lines.push([]);
        if (part) lines[lines.length - 1].push({ type: t.type, text: part });
      });
    });
    return lines;
  }

  function trimLines(src) {
    return String(src).replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '').split(/\r?\n/);
  }

  function indentOf(lines) {
    var indent = null;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var n = line.match(/^[ \t]*/)[0].length;
      if (indent === null || n < indent) indent = n;
    });
    return indent || 0;
  }

  // Drops a leading blank line and trailing whitespace, then removes the indentation shared by every line.
  function dedent(src) {
    var lines = trimLines(src);
    var indent = indentOf(lines);
    return lines.map(function (line) { return line.slice(indent); }).join('\n');
  }

  // "2,4-6" -> [2, 4, 5, 6]: sorted, unique, 1-based line numbers.
  function lineList(spec) {
    var out = [];
    String(spec || '').split(/[\s,]+/).forEach(function (part) {
      var m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return;
      var a = +m[1];
      var b = m[2] ? +m[2] : a;
      if (b < a) { var t = a; a = b; b = t; }
      for (var n = a; n <= b && n - a < 10000; n++) if (out.indexOf(n) < 0) out.push(n);
    });
    return out.sort(function (x, y) { return x - y; });
  }

  // A trailing comment that holds only marker numbers, such as "// (1)", "# (2) (3)", or "<!-- (4) -->".
  var MARKS = /[ \t]*(?:\/\/|#|--|;|%|\/\*|<!--)[ \t]*((?:\(\d{1,2}\)[ \t]*)+)(?:\*\/|-->)?[ \t]*$/;

  // Removes marker comments; markers[i] lists the numbers found on line i.
  function annotations(src) {
    var markers = [];
    var lines = String(src).split('\n').map(function (line) {
      var m = line.match(MARKS);
      markers.push(m ? m[1].match(/\d+/g).map(Number) : []);
      return m ? line.slice(0, m.index) : line;
    });
    return { source: lines.join('\n'), markers: markers };
  }

  // Unified-diff text: "+" added, "-" removed, "@@" hunk headers, and leading "---"/"+++" file headers.
  // One prefix character is removed from code lines.
  function diffRows(src) {
    var header = true;
    return String(src).split('\n').map(function (line) {
      if (header && /^(?:---|\+\+\+)(?:\s|$)/.test(line)) return { type: 'meta', text: line };
      header = false;
      if (/^@@/.test(line)) return { type: 'hunk', text: line };
      var c = line.charAt(0);
      if (c === '+') return { type: 'add', text: line.slice(1) };
      if (c === '-') return { type: 'del', text: line.slice(1) };
      return { type: 'same', text: c === ' ' ? line.slice(1) : line };
    });
  }

  // Line diff by longest common subsequence; removals come before additions within a change.
  function diffLines(before, after) {
    var a = String(before).split('\n');
    var b = String(after).split('\n');
    var start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    var endA = a.length;
    var endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    var n = endA - start;
    var m = endB - start;
    var w = m + 1;
    var lcs = new Uint32Array((n + 1) * w);
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = a[start + i] === b[start + j] ? lcs[(i + 1) * w + j + 1] + 1 :
          Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    var rows = a.slice(0, start).map(function (text) { return { type: 'same', text: text }; });
    i = 0;
    j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        rows.push({ type: 'same', text: a[start + i] });
        i++;
        j++;
      } else if (j >= m || (i < n && lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
        rows.push({ type: 'del', text: a[start + i++] });
      } else {
        rows.push({ type: 'add', text: b[start + j++] });
      }
    }
    return rows.concat(a.slice(endA).map(function (text) { return { type: 'same', text: text }; }));
  }

  // Highlights diff rows as two streams (old = same + removed, new = same + added) so multi-line tokens stay intact.
  function highlightRows(rows, lang) {
    var streams = { old: [], new: [] };
    rows.forEach(function (row, i) {
      if (row.type === 'same' || row.type === 'del') streams.old.push(i);
      if (row.type === 'same' || row.type === 'add') streams.new.push(i);
    });
    var html = rows.map(function (row) { return escape(row.text); });
    if (language(lang)) {
      ['old', 'new'].forEach(function (name) {
        var list = streams[name];
        var lines = tokenLines(tokenize(list.map(function (i) { return rows[i].text; }).join('\n'), lang));
        list.forEach(function (rowIndex, k) { html[rowIndex] = tokensHtml(lines[k] || []); });
      });
    }
    return html;
  }

  function langOf(pre, code) {
    var attr = DocForm.data(pre, 'lang', null) || (code && DocForm.data(code, 'lang', null));
    if (attr) return attr;
    var cls = ((code && code.className) + ' ' + pre.className).match(/\blang(?:uage)?-([\w+-]+)/);
    return cls ? cls[1] : '';
  }

  var COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/>' +
    '<path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';

  var DIFFS = typeof WeakMap === 'function' ? new WeakMap() : null;

  // Replaces the before and after blocks of a .df-diff with one pre whose rows come from the line diff.
  function buildDiff(box) {
    var pres = DocForm.all(':scope > pre', box);
    var before = box.querySelector(':scope > pre[data-df-diff="before"]') || pres[0];
    var after = box.querySelector(':scope > pre[data-df-diff="after"]') || pres.filter(function (p) { return p !== before; })[0];
    if (!before || !after || !DIFFS) {
      DocForm.warnOnce('diff-pair', 'A .df-diff needs a before and an after pre; leaving it as is.', box);
      return;
    }
    var textOf = function (pre) {
      var code = pre.querySelector(':scope > code');
      return (code || pre).textContent;
    };
    var a = trimLines(textOf(before));
    var b = trimLines(textOf(after));
    var indent = indentOf(a.concat(b));
    var cut = function (lines) { return lines.map(function (line) { return line.slice(indent); }).join('\n'); };
    var pre = document.createElement('pre');
    var lang = DocForm.data(box, 'lang', null) || langOf(after, after.querySelector(':scope > code')) ||
      langOf(before, before.querySelector(':scope > code'));
    if (lang) pre.setAttribute('data-df-lang', lang);
    var lines = DocForm.data(box, 'lines', null);
    if (lines) pre.setAttribute('data-df-lines', lines);
    DIFFS.set(pre, diffLines(cut(a), cut(b)));
    box.insertBefore(pre, before);
    before.remove();
    after.remove();
  }

  function renderRows(target, rows) {
    target.classList.add('df-code-lines');
    target.innerHTML = rows.map(function (row, i) {
      var cls = 'df-code-line' + (row.hl ? ' is-hl' : '') + (row.type && row.type !== 'same' ? ' is-' + row.type : '');
      var marks = (row.markers || []).map(function (n) {
        return '<button type="button" class="df-code-mark" data-df-mark="' + n + '" aria-label="Note ' + n + '">' +
          n + '</button>';
      }).join('');
      return '<span class="' + cls + '">' + row.html + (marks ? '<span class="df-code-marks">' + marks + '</span>' : '') +
        (i < rows.length - 1 ? '\n' : '') + '</span>';
    }).join('');
  }

  // Links each circled marker to the matching item of the annotation list: hover lights both, click scrolls to it.
  function linkNotes(wrap, pre) {
    var ref = DocForm.data(pre, 'annotate', '');
    var list = ref.charAt(0) === '#' ? document.getElementById(ref.slice(1)) : wrap.nextElementSibling;
    var marks = DocForm.all('.df-code-mark', wrap);
    if (!list || list.tagName !== 'OL') {
      if (marks.length) DocForm.warnOnce('code-notes:' + ref, 'No ordered list found for the code annotations.', pre);
      return;
    }
    list.classList.add('df-code-notes');
    var items = Array.prototype.filter.call(list.children, function (el) { return el.tagName === 'LI'; });
    var first = list.start || 1;
    var groups = {};
    marks.forEach(function (mark) {
      var n = +mark.getAttribute('data-df-mark');
      var li = items[n - first];
      if (!li) {
        mark.classList.add('is-missing');
        DocForm.warnOnce('code-note:' + n, 'Code annotation ' + n + ' has no matching list item.', pre);
        return;
      }
      var group = groups[n] || (groups[n] = { li: li, els: [li] });
      group.els.push(mark, mark.closest('.df-code-line'));
      li.setAttribute('data-df-note', n);
      mark.addEventListener('click', function () {
        li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        li.classList.remove('is-flash');
        void li.offsetWidth;
        li.classList.add('is-flash');
      });
      if (DocForm.tooltip) {
        DocForm.tooltip.attach(mark, '', '', {
          className: 'df-code-tip',
          content: function () {
            var copy = li.cloneNode(true);
            DocForm.all('[id]', copy).forEach(function (el) { el.removeAttribute('id'); });
            var box = document.createElement('div');
            while (copy.firstChild) box.appendChild(copy.firstChild);
            return box;
          }
        });
      }
    });
    Object.keys(groups).forEach(function (n) {
      var els = groups[n].els;
      var set = function (on) { return function () { els.forEach(function (el) { el.classList.toggle('is-linked', on); }); }; };
      els.forEach(function (el) {
        if (el.classList.contains('df-code-line')) return;
        el.addEventListener('mouseenter', set(true));
        el.addEventListener('mouseleave', set(false));
        el.addEventListener('focusin', set(true));
        el.addEventListener('focusout', set(false));
      });
    });
  }

  function enhance(pre) {
    if (pre.closest('.df-code') || pre.hasAttribute('data-df-no-code')) return;
    var code = pre.querySelector(':scope > code');
    var target = code || pre;
    var lang = langOf(pre, code);
    var key = language(lang);
    var diff = DIFFS && DIFFS.get(pre);
    var source = diff ? '' : dedent(target.textContent);
    var annotate = pre.hasAttribute('data-df-annotate');
    var markers = null;
    if (!diff && DocForm.flag(pre, 'diff')) diff = diffRows(source);
    if (annotate && !diff) {
      var parsed = annotations(source);
      source = parsed.source;
      markers = parsed.markers;
    }
    var marked = lineList(DocForm.data(pre, 'lines', ''));

    if (diff || markers || marked.length) {
      var rows = diff || source.split('\n').map(function (text) { return { type: 'same', text: text }; });
      var html = diff ? highlightRows(rows, lang) : tokenLines(tokenize(source, lang)).map(tokensHtml);
      rows = rows.map(function (row, i) {
        return { type: row.type, html: html[i] || '', hl: marked.indexOf(i + 1) >= 0, markers: markers && markers[i] };
      });
      if (diff) {
        // Copy gives the new version.
        source = diff.filter(function (row) { return row.type === 'same' || row.type === 'add'; })
          .map(function (row) { return row.text; }).join('\n');
        pre.classList.add('df-code-diff');
      }
      if (!code) {
        code = document.createElement('code');
        pre.textContent = '';
        pre.appendChild(code);
        target = code;
      }
      renderRows(target, rows);
    } else if (key) {
      target.innerHTML = highlight(source, key);
    } else {
      target.textContent = source;
    }

    var wrap = document.createElement('div');
    wrap.className = 'df-code';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    if (markers) linkNotes(wrap, pre);

    var bar = document.createElement('div');
    bar.className = 'df-code-bar';
    if (lang || diff) {
      var label = document.createElement('span');
      label.className = 'df-code-lang';
      label.textContent = (lang ? NAMES[lang.toLowerCase()] || NAMES[key] || lang : '') + (diff ? (lang ? ' diff' : 'Diff') : '');
      bar.appendChild(label);
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'df-code-copy';
    button.innerHTML = COPY_ICON + '<span>Copy</span>';
    button.setAttribute('aria-label', diff ? 'Copy new code' : 'Copy code');
    var text = button.lastChild;
    var timer = 0;
    button.addEventListener('click', function () {
      DocForm.copyText(source).then(function () {
        text.textContent = 'Copied';
        button.classList.add('is-done');
      }, function () {
        text.textContent = 'Press Ctrl+C';
        var range = document.createRange();
        range.selectNodeContents(target);
        var sel = root.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }).then(function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          text.textContent = 'Copy';
          button.classList.remove('is-done');
        }, 1600);
      });
    });
    bar.appendChild(button);
    wrap.appendChild(bar);
  }

  DocForm.code = {
    tokenize: tokenize,
    highlight: highlight,
    language: language,
    dedent: dedent,
    tokenLines: tokenLines,
    lineList: lineList,
    annotations: annotations,
    diffRows: diffRows,
    diffLines: diffLines
  };

  DocForm.register('code', function () {
    // Every .df-page, including bubble panels that live outside the main page.
    var pages = DocForm.all('.df-page');
    (pages.length ? DocForm.all('.df-page .df-diff') : DocForm.all('.df-diff', document.body)).forEach(buildDiff);
    (pages.length ? DocForm.all('.df-page pre') : DocForm.all('pre', document.body)).forEach(enhance);
  });
})(typeof window !== 'undefined' ? window : globalThis);
