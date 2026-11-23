// Optional syntax colouring over native single-line and multiline text fields.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  var component = OffPrint._component;
  var mirrors = new WeakMap();
  var selector = 'input[data-op-editable], textarea[data-op-editable]';

  function mount(target) {
    var field = component.target(target, 'editable-text', true);
    if (!field) return null;
    var block = field.tagName === 'TEXTAREA';
    if (!block && !(field.tagName === 'INPUT' && field.type === 'text')) {
      component.issue('editable-text', field, 'Unsupported editable text field.',
        'Use an input of type text or a textarea.');
      return null;
    }
    field.setAttribute('data-op-editable', '');
    if (mirrors.has(field)) return field;
    var lang = field.getAttribute('data-op-lang');
    if (!lang) return field;
    var code = OffPrint._code;
    if (!code || !code.language(lang)) {
      component.issue('editable-text', field, 'Syntax highlighting is unavailable for "' + lang + '".',
        'Enable the code feature and use a supported language.');
      return field;
    }

    var frame = document.createElement('span');
    var mirror = document.createElement('span');
    var text = document.createElement('span');
    frame.className = block ? 'op-editor op-editor-block' : 'op-editor';
    mirror.className = 'op-editor-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    mirror.appendChild(text);
    field.before(frame);
    frame.append(mirror, field);

    function align() {
      mirror.style.width = field.clientWidth + 'px';
      mirror.style.height = field.clientHeight + 'px';
      mirror.style.left = field.clientLeft + 'px';
      mirror.style.top = field.clientTop + 'px';
      text.style.transform = 'translate(' + -field.scrollLeft + 'px,' + -field.scrollTop + 'px)';
    }

    function render() {
      var value = field.value;
      text.innerHTML = code.highlight(value, lang) + (block && value.endsWith('\n') ? '\u200b' : '');
      align();
    }

    mirrors.set(field, render);
    field.addEventListener('input', render);
    field.addEventListener('change', render);
    field.addEventListener('focus', render);
    field.addEventListener('scroll', align, { passive: true });
    field.addEventListener('compositionstart', function () { frame.classList.add('op-editor-composing'); });
    field.addEventListener('compositionend', function () {
      render();
      frame.classList.remove('op-editor-composing');
    });
    if (root.ResizeObserver) new root.ResizeObserver(align).observe(field);
    render();
    return field;
  }

  function refresh(target) {
    var field = component.target(target, 'editable-text', true);
    var render = field && mirrors.get(field);
    if (render) render();
  }

  OffPrint._editableText = { mount: mount, refresh: refresh };

  OffPrint.register('editable-text', function () {
    OffPrint._all(selector).forEach(mount);
    document.addEventListener('reset', function (event) {
      var fields = Array.from(event.target.elements || []).filter(function (field) { return mirrors.has(field); });
      if (fields.length) root.setTimeout(function () { fields.forEach(refresh); }, 0);
    }, true);
  });
})(typeof window !== 'undefined' ? window : globalThis);
