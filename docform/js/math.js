(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] math.js needs core.js loaded before it.');
    return;
  }

  var SELECTOR = '.df-math';
  var RENDERED = 'df-math-rendered';
  var ERROR = 'df-math-error';
  var macroSite = null;
  var macroCopy = null;
  var component = DocForm._component;

  // One shared copy per manifest, so \gdef in one formula carries to later ones without touching the manifest.
  function macros() {
    var site = DocForm._site;
    if (!site) return {};
    if (macroSite !== site) {
      macroSite = site;
      macroCopy = {};
      Object.keys(site.macros || {}).forEach(function (key) { macroCopy[key] = String(site.macros[key]); });
    }
    return macroCopy;
  }

  function katex() {
    if (root.katex && typeof root.katex.renderToString === 'function') return root.katex;
    DocForm._warnOnce('math:katex', 'KaTeX is not loaded; include docform/vendor/katex/katex.min.js before math.js. Math stays as TeX source.');
    return null;
  }

  // Returns rendered HTML, or throws KaTeX's error for invalid TeX.
  function html(tex, display) {
    var lib = katex();
    if (!lib) throw new Error('KaTeX is not loaded.');
    return lib.renderToString(String(tex), {
      displayMode: !!display,
      macros: macros(),
      throwOnError: true
    });
  }

  function source(el) {
    if (typeof el === 'string') el = component.target(el, 'math', true);
    if (!el || typeof el.getAttribute !== 'function') return null;
    var tex = el.getAttribute('data-df-tex');
    return tex === null ? String(el.textContent || '').trim() : tex;
  }

  function renderElement(el, tex) {
    if (!katex()) return false;
    if (tex === undefined) tex = source(el);
    el.setAttribute('data-df-tex', tex);
    try {
      el.innerHTML = html(tex, DocForm._boot ? component.flag(el, 'display', 'math') : DocForm._flag(el, 'display'));
      el.classList.remove(ERROR);
      el.removeAttribute('title');
    } catch (e) {
      var message = e && e.message ? e.message : String(e);
      el.textContent = tex;
      el.classList.add(ERROR);
      el.title = message;
      if (DocForm._boot) component.issue('math', el, 'Cannot render TeX: ' + message, 'Check the TeX source and configured macros.');
      else DocForm._warnOnce('math-error:' + tex, 'Cannot render TeX "' + tex + '": ' + message);
    }
    el.classList.add(RENDERED);
    return true;
  }

  // Renders math in `scope` (default: the document) that has not been rendered yet; pass force to redo all of it.
  function render(scope, force) {
    if (typeof scope === 'string') {
      scope = component.target(scope, 'math', true);
      if (!scope) return 0;
    }
    scope = scope || document;
    var list = DocForm._all(SELECTOR, scope);
    if (scope.matches && scope.matches(SELECTOR)) list.unshift(scope);
    var count = 0;
    list.forEach(function (el) {
      if (!force && el.classList.contains(RENDERED)) return;
      if (renderElement(el)) count++;
    });
    return count;
  }

  // Replaces one element's TeX and re-renders it, for live bindings.
  function set(el, tex) {
    if (typeof el === 'string') el = component.target(el, 'math', true);
    if (!el || typeof el.getAttribute !== 'function') return false;
    return renderElement(el, String(tex));
  }

  // Splits text on unescaped $…$ into alternating text and TeX parts; \$ is a literal dollar sign.
  function split(text) {
    var parts = [];
    var buf = '';
    var tex = false;
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '\\' && text[i + 1] === '$') {
        buf += tex ? '\\$' : '$';
        i++;
      } else if (c === '$') {
        if (buf) parts.push({ tex: tex, text: buf });
        buf = '';
        tex = !tex;
      } else {
        buf += c;
      }
    }
    if (tex) buf = '$' + buf;
    if (buf) {
      var last = parts[parts.length - 1];
      if (tex && last && !last.tex) last.text += buf;
      else parts.push({ tex: false, text: buf });
    }
    return parts;
  }

  function escape(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Escaped HTML for text with inline $…$ math; TeX that fails to render stays as source.
  function mixed(text) {
    return split(text).map(function (part) {
      if (!part.tex) return escape(part.text);
      try {
        return html(part.text, false);
      } catch (e) {
        return '<span class="' + ERROR + '">' + escape(part.text) + '</span>';
      }
    }).join('');
  }

  DocForm._math = { render: render, set: set, html: html, source: source, split: split, mixed: mixed, escape: escape };

  DocForm.register('math', function () {
    render(document);
  });
})(typeof window !== 'undefined' ? window : globalThis);
