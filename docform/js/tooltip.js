(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] tooltip.js needs core.js loaded before it.');
    return;
  }

  var SHOW_DELAY = 120;
  var HIDE_DELAY = 120;
  var GAP = 8;
  var MARGIN = 8;
  var FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
  var count = 0;
  var hasOwn = Object.prototype.hasOwnProperty;

  // "Linear map", "linear-map", and "linear_map" all name the same term.
  function termKey(text) {
    return String(text).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  }

  // Normalizes manifest glossary entries to { key: { title, text } }. Entries are strings or { title, text }.
  function glossary(raw) {
    var out = {};
    Object.keys(raw || {}).forEach(function (name) {
      var value = raw[name];
      var key = termKey(name);
      var entry = null;
      if (typeof value === 'string') entry = { title: name.trim(), text: value };
      else if (value && typeof value === 'object' && typeof value.text === 'string') {
        entry = { title: typeof value.title === 'string' ? value.title : name.trim(), text: value.text };
      }
      if (!key || !entry) {
        DocForm.warnOnce('glossary:' + name, 'Glossary entry "' + name + '" needs a text definition; ignoring it.');
        return;
      }
      if (hasOwn.call(out, key)) {
        DocForm.warnOnce('glossary-dup:' + key, 'Glossary terms "' + out[key].title + '" and "' + name + '" collide; keeping the first.');
        return;
      }
      out[key] = entry;
    });
    return out;
  }

  // Looks up a term from data-df-term, or from the element text when the attribute is empty.
  function lookup(terms, el) {
    var name = el.getAttribute('data-df-term');
    if (!name || !name.trim()) name = el.textContent;
    var key = termKey(name);
    if (hasOwn.call(terms, key)) return terms[key];
    DocForm.warnOnce('term:' + key, 'Unknown glossary term "' + name.trim() + '"; add it to the manifest glossary.');
    return null;
  }

  // Places a box of `size` below the anchor rect, or above when it does not fit, kept inside the viewport.
  function place(rect, size, view) {
    var below = rect.bottom + GAP;
    var above = rect.top - GAP - size.height;
    var top = below + size.height <= view.height - MARGIN || above < MARGIN ? below : above;
    var left = rect.left + rect.width / 2 - size.width / 2;
    left = Math.max(MARGIN, Math.min(left, view.width - MARGIN - size.width));
    return { top: Math.round(top), left: Math.round(left), side: top === below ? 'below' : 'above' };
  }

  function content(text) {
    return DocForm.math && DocForm.math.mixed ? DocForm.math.mixed(text) : null;
  }

  function fill(box, title, text) {
    box.textContent = '';
    if (title) {
      var head = document.createElement('div');
      head.className = 'df-tooltip-title';
      var titleHtml = content(title);
      if (titleHtml === null) head.textContent = title;
      else head.innerHTML = titleHtml;
      box.appendChild(head);
    }
    var body = document.createElement('div');
    body.className = 'df-tooltip-body';
    var html = content(text);
    if (html === null) body.textContent = text;
    else body.innerHTML = html;
    box.appendChild(body);
  }

  var active = null;
  var showTimer = 0;
  var hideTimer = 0;

  function position(item) {
    var rects = item.el.getClientRects();
    var rect = rects.length ? rects[0] : item.el.getBoundingClientRect();
    var spot = place(rect, { width: item.box.offsetWidth, height: item.box.offsetHeight },
      { width: document.documentElement.clientWidth, height: root.innerHeight });
    item.box.style.top = spot.top + 'px';
    item.box.style.left = spot.left + 'px';
    item.box.setAttribute('data-df-side', spot.side);
  }

  function show(item) {
    clearTimeout(hideTimer);
    if (active === item) return;
    if (active) hide(true);
    active = item;
    item.box.hidden = false;
    position(item);
    item.box.classList.add('is-visible');
  }

  function hide(now) {
    clearTimeout(showTimer);
    if (!active) return;
    var item = active;
    var done = function () {
      if (active !== item) return;
      item.box.classList.remove('is-visible');
      item.box.hidden = true;
      active = null;
    };
    if (now) done();
    else hideTimer = setTimeout(done, HIDE_DELAY);
  }

  function attach(el, title, text) {
    var box = document.createElement('div');
    box.className = 'df-tooltip';
    box.id = 'df-tip-' + (++count);
    box.setAttribute('role', 'tooltip');
    box.hidden = true;
    fill(box, title, text);
    document.body.appendChild(box);

    var item = { el: el, box: box };
    var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    ids.push(box.id);
    el.setAttribute('aria-describedby', ids.join(' '));
    if (!el.matches(FOCUSABLE)) el.tabIndex = 0;

    var later = function () {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      showTimer = setTimeout(function () { show(item); }, SHOW_DELAY);
    };
    el.addEventListener('mouseenter', later);
    el.addEventListener('mouseleave', function () { hide(false); });
    el.addEventListener('focus', function () { show(item); });
    el.addEventListener('blur', function () { hide(true); });
    box.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    box.addEventListener('mouseleave', function () { hide(false); });
  }

  DocForm.tooltip = { termKey: termKey, glossary: glossary, lookup: lookup, place: place, attach: attach };

  DocForm.register('tooltip', function (site) {
    var terms = glossary(site.glossary);
    DocForm.all('[data-df-tip]').forEach(function (el) {
      el.classList.add('df-tip');
      attach(el, '', el.getAttribute('data-df-tip'));
    });
    DocForm.all('[data-df-term]').forEach(function (el) {
      el.classList.add('df-term');
      var entry = lookup(terms, el);
      if (entry) attach(el, entry.title, entry.text);
      else el.classList.add('df-term-missing');
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && active) hide(true);
    });
    var follow = function () { if (active) position(active); };
    root.addEventListener('scroll', follow, { passive: true, capture: true });
    root.addEventListener('resize', follow);
  });
})(typeof window !== 'undefined' ? window : globalThis);
