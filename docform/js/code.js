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

  function highlight(src, lang) {
    return tokenize(src, lang).map(function (t) {
      return t.type ? '<span class="df-tok-' + t.type + '">' + escape(t.text) + '</span>' : escape(t.text);
    }).join('');
  }

  // Drops a leading blank line and trailing whitespace, then removes the indentation shared by every line.
  function dedent(src) {
    var lines = String(src).replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '').split(/\r?\n/);
    var indent = null;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var n = line.match(/^[ \t]*/)[0].length;
      if (indent === null || n < indent) indent = n;
    });
    return lines.map(function (line) { return line.slice(indent || 0); }).join('\n');
  }

  function langOf(pre, code) {
    var attr = DocForm.data(pre, 'lang', null) || (code && DocForm.data(code, 'lang', null));
    if (attr) return attr;
    var cls = ((code && code.className) + ' ' + pre.className).match(/\blang(?:uage)?-([\w+-]+)/);
    return cls ? cls[1] : '';
  }

  function copyText(text) {
    if (navigator.clipboard && root.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      area.remove();
      if (ok) resolve();
      else reject(new Error('Copy was blocked.'));
    });
  }

  var COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/>' +
    '<path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';

  function enhance(pre) {
    if (pre.closest('.df-code') || pre.hasAttribute('data-df-no-code')) return;
    var code = pre.querySelector(':scope > code');
    var target = code || pre;
    var lang = langOf(pre, code);
    var source = dedent(target.textContent);
    var key = language(lang);
    if (key) target.innerHTML = highlight(source, key);
    else target.textContent = source;

    var wrap = document.createElement('div');
    wrap.className = 'df-code';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    var bar = document.createElement('div');
    bar.className = 'df-code-bar';
    if (lang) {
      var label = document.createElement('span');
      label.className = 'df-code-lang';
      label.textContent = NAMES[lang.toLowerCase()] || NAMES[key] || lang;
      bar.appendChild(label);
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'df-code-copy';
    button.innerHTML = COPY_ICON + '<span>Copy</span>';
    button.setAttribute('aria-label', 'Copy code');
    var text = button.lastChild;
    var timer = 0;
    button.addEventListener('click', function () {
      copyText(source).then(function () {
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

  DocForm.code = { tokenize: tokenize, highlight: highlight, language: language, dedent: dedent };

  DocForm.register('code', function () {
    var main = document.querySelector('.df-page') || document.body;
    DocForm.all('pre', main).forEach(enhance);
  });
})(typeof window !== 'undefined' ? window : globalThis);
