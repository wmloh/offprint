(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] tooltip.js needs core.js loaded before it.');
    return;
  }

  var SHOW_DELAY = 120;
  var HIDE_DELAY = 120;
  var HOLD = 600;
  var HOLD_SLOP = 10;
  var GROW = 220;
  var GAP = 8;
  var MARGIN = 8;
  var FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
  var BLOCKS = 'p, li';
  var SKIP = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'kbd', 'samp', 'a', 'button', 'label', 'summary',
    'script', 'style', 'textarea', 'select', 'svg', 'math', 'nav', '[role="tooltip"]',
    '.df-math', '.katex', '.df-term', '.df-tip', '[data-df-term]', '[data-df-tip]',
    '[data-df-template]', '[data-df-bind]', '[data-df-param]', '.df-sidebar', '.df-controls', '.df-legend', '.df-bubble',
    '[data-df-no-autolink]', '[data-df-autolink="false"]'
  ].join(', ');
  var RING = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle class="df-ring-track" cx="8" cy="8" r="6"/>' +
    '<circle class="df-ring-fill" cx="8" cy="8" r="6" pathLength="1"/></svg>';
  var count = 0;
  var hasOwn = Object.prototype.hasOwnProperty;

  // "Linear map", "linear-map", and "linear_map" all name the same term.
  function termKey(text) {
    return String(text).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  }

  // Normalizes manifest glossary entries to { key: { title, text, more } }. Entries are strings or { title, text, more }.
  function glossary(raw) {
    var out = {};
    Object.keys(raw || {}).forEach(function (name) {
      var value = raw[name];
      var key = termKey(name);
      var entry = null;
      if (typeof value === 'string') entry = { title: name.trim(), text: value, more: '' };
      else if (value && typeof value === 'object' && typeof value.text === 'string') {
        entry = {
          title: typeof value.title === 'string' ? value.title : name.trim(),
          text: value.text,
          more: typeof value.more === 'string' ? value.more.trim() : ''
        };
        if (value.more != null && typeof value.more !== 'string') {
          DocForm.warnOnce('glossary-more:' + name, 'Glossary entry "' + name + '" has a non-text "more"; ignoring it.');
        }
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

  // Extended HTML for a term: data-df-more overrides the glossary, either as HTML or as "#id" of a template or hidden
  // element; an empty attribute turns the extended card off.
  function extended(entry, el) {
    var fallback = entry && entry.more ? entry.more : '';
    var attr = el.getAttribute('data-df-more');
    if (attr === null) return fallback;
    attr = attr.trim();
    if (attr.charAt(0) !== '#') return attr;
    var source = el.ownerDocument.getElementById(attr.slice(1));
    if (source) return String(source.innerHTML).trim();
    DocForm.warnOnce('more:' + attr, 'No element "' + attr + '" for data-df-more; using the glossary text.');
    return fallback;
  }

  function holdTime(el, site) {
    var value = el.getAttribute('data-df-hold');
    if (value === null) value = site && site.terms ? site.terms.hold : undefined;
    if (value === undefined || value === null) return HOLD;
    var ms = Number(value);
    if (isFinite(ms) && ms >= 0) return ms;
    DocForm.warnOnce('hold:' + value, 'Hold time "' + value + '" must be a number of milliseconds; using ' + HOLD + '.');
    return HOLD;
  }

  function escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // One case-insensitive whole-word regex for every key; longer keys come first so they win at the same start.
  function matcher(keys) {
    var list = keys.filter(Boolean).slice().sort(function (a, b) { return b.length - a.length; });
    if (!list.length) return null;
    var alts = list.map(function (key) { return key.split(' ').map(escapeRe).join('[\\s_-]+'); });
    return new RegExp('(?<![\\p{L}\\p{N}_])(?:' + alts.join('|') + ')(?![\\p{L}\\p{N}_])', 'giu');
  }

  // Non-overlapping term matches in text, scanned left to right.
  function findTerms(text, re) {
    var out = [];
    if (!re) return out;
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, key: termKey(m[0]) });
    return out;
  }

  // Whether a text node may be auto-linked: inside a paragraph or list item of the root and outside skipped contexts.
  function linkable(node, rootEl) {
    var parent = node.parentElement;
    if (!parent) return false;
    var block = parent.closest(BLOCKS);
    return !!block && rootEl.contains(block) && !parent.closest(SKIP);
  }

  // Wraps glossary terms found in the roots' text with span.df-term.df-term-auto and returns the new spans.
  function autoLink(roots, re) {
    var made = [];
    if (!re) return made;
    roots = roots.filter(function (el, i) {
      return roots.indexOf(el) === i && !roots.some(function (other) { return other !== el && other.contains(el); });
    });
    roots.forEach(function (rootEl) {
      var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        if (!linkable(node, rootEl)) return;
        var text = node.nodeValue;
        var hits = findTerms(text, re);
        if (!hits.length) return;
        var frag = document.createDocumentFragment();
        var at = 0;
        hits.forEach(function (hit) {
          if (hit.start > at) frag.appendChild(document.createTextNode(text.slice(at, hit.start)));
          var span = document.createElement('span');
          span.className = 'df-term df-term-auto';
          span.setAttribute('data-df-term', hit.key);
          span.textContent = text.slice(hit.start, hit.end);
          frag.appendChild(span);
          made.push(span);
          at = hit.end;
        });
        if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
        node.parentNode.replaceChild(frag, node);
      });
    });
    return made;
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

  function setMixed(el, text) {
    var html = content(text);
    if (html === null) el.textContent = text;
    else el.innerHTML = html;
  }

  // Author HTML with $…$ math in its text and any .df-math elements rendered.
  function rich(el, html) {
    el.innerHTML = html;
    var math = DocForm.math;
    if (!math || !math.mixed) return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (node.nodeValue.indexOf('$') < 0 || node.parentElement.closest('code, pre, script, style, .df-math')) return;
      var holder = document.createElement('span');
      holder.innerHTML = math.mixed(node.nodeValue);
      var frag = document.createDocumentFragment();
      while (holder.firstChild) frag.appendChild(holder.firstChild);
      node.parentNode.replaceChild(frag, node);
    });
    math.render(el);
  }

  // options.content (a function returning a node or HTML) fills the body lazily on first show instead of `text`.
  function card(title, text, more, options) {
    options = options || {};
    var box = document.createElement('div');
    box.className = 'df-tooltip' + (options.className ? ' ' + options.className : '');
    box.id = 'df-tip-' + (++count);
    box.setAttribute('role', 'tooltip');
    box.hidden = true;
    if (title || more) {
      var head = document.createElement('div');
      head.className = 'df-tooltip-title';
      var label = document.createElement('span');
      if (title) setMixed(label, title);
      head.appendChild(label);
      if (more) {
        var ring = document.createElement('span');
        ring.className = 'df-tooltip-ring';
        ring.title = 'Press and hold the term for more';
        ring.innerHTML = RING;
        head.appendChild(ring);
      }
      box.appendChild(head);
    }
    var body = document.createElement('div');
    body.className = 'df-tooltip-body';
    if (!options.content) setMixed(body, text);
    box.appendChild(body);
    var moreEl = null;
    if (more) {
      moreEl = document.createElement('div');
      moreEl.className = 'df-tooltip-more';
      moreEl.hidden = true;
      box.appendChild(moreEl);
    }
    document.body.appendChild(box);
    var record = { box: box, body: body, more: more, moreEl: moreEl, filled: false, content: options.content || null };
    box.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    box.addEventListener('mouseleave', function () { hide(false); });
    return record;
  }

  var active = null;
  var showTimer = 0;
  var hideTimer = 0;
  var holding = null;
  var holdEnded = 0;

  function position(item) {
    var rects = item.el.getClientRects();
    var rect = rects.length ? rects[0] : item.el.getBoundingClientRect();
    var box = item.card.box;
    var spot = place(rect, { width: box.offsetWidth, height: box.offsetHeight },
      { width: document.documentElement.clientWidth, height: root.innerHeight });
    box.style.top = spot.top + 'px';
    box.style.left = spot.left + 'px';
    box.setAttribute('data-df-side', spot.side);
  }

  function fill(record) {
    var value = record.content();
    record.content = null;
    if (value && typeof value === 'object' && value.nodeType) record.body.appendChild(value);
    else rich(record.body, value == null ? '' : String(value));
  }

  function show(item) {
    clearTimeout(hideTimer);
    if (active === item) return;
    if (item.enabled && !item.enabled()) return;
    if (active) hide(true);
    active = item;
    if (item.card.content) fill(item.card);
    item.card.box.hidden = false;
    position(item);
    item.card.box.classList.add('is-visible');
  }

  function collapse(record) {
    record.box.classList.remove('is-visible', 'is-expanded', 'is-holding');
    if (record.moreEl) record.moreEl.hidden = true;
    record.box.hidden = true;
  }

  function hide(now) {
    clearTimeout(showTimer);
    if (!active) return;
    var item = active;
    var done = function () {
      if (active !== item) return;
      if (holding && holding.item === item) cancelHold();
      collapse(item.card);
      active = null;
    };
    if (now) done();
    else hideTimer = setTimeout(done, HIDE_DELAY);
  }

  // Grows the tooltip into the extended card, animating its frame from the old size and place to the new.
  function expand(item) {
    var record = item.card;
    var box = record.box;
    if (active !== item || box.classList.contains('is-expanded')) return;
    var from = box.getBoundingClientRect();
    if (!record.filled) {
      rich(record.moreEl, record.more);
      record.filled = true;
    }
    record.moreEl.hidden = false;
    box.classList.add('is-expanded');
    position(item);
    var to = box.getBoundingClientRect();
    if (box.animate) {
      box.animate([
        { top: from.top + 'px', left: from.left + 'px', width: from.width + 'px', height: from.height + 'px', overflow: 'hidden' },
        { top: to.top + 'px', left: to.left + 'px', width: to.width + 'px', height: to.height + 'px', overflow: 'hidden' }
      ], { duration: GROW, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  }

  function startHold(item, pointer) {
    if (!item.card.more) return;
    cancelHold();
    show(item);
    var box = item.card.box;
    if (box.classList.contains('is-expanded')) return;
    box.style.setProperty('--df-hold', item.hold + 'ms');
    void box.offsetWidth;
    box.classList.add('is-holding');
    document.documentElement.classList.add('df-term-holding');
    holding = {
      item: item,
      id: pointer ? pointer.pointerId : null,
      x: pointer ? pointer.clientX : 0,
      y: pointer ? pointer.clientY : 0,
      timer: setTimeout(function () {
        cancelHold();
        expand(item);
      }, item.hold)
    };
  }

  function cancelHold() {
    if (!holding) return;
    clearTimeout(holding.timer);
    holding.item.card.box.classList.remove('is-holding');
    document.documentElement.classList.remove('df-term-holding');
    holding = null;
    holdEnded = Date.now();
  }

  function attach(el, title, text, options) {
    options = options || {};
    var record = options.card || card(title, text, options.more || '', options);
    var item = {
      el: el,
      card: record,
      hold: options.hold == null ? HOLD : options.hold,
      delay: options.delay == null ? SHOW_DELAY : options.delay,
      enabled: options.enabled || null
    };
    if (options.describe !== false) {
      // Screen readers read the description from the box, so it cannot wait for the first hover.
      if (record.content) fill(record);
      var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (ids.indexOf(record.box.id) < 0) ids.push(record.box.id);
      el.setAttribute('aria-describedby', ids.join(' '));
    }
    if (options.focusable !== false && !el.matches(FOCUSABLE)) el.tabIndex = 0;

    var later = function () {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      showTimer = setTimeout(function () { show(item); }, item.delay);
    };
    el.addEventListener('mouseenter', later);
    el.addEventListener('mouseleave', function () { hide(false); });
    el.addEventListener('focus', function () { show(item); });
    el.addEventListener('blur', function () {
      if (active === item && record.box.matches(':hover')) return;
      hide(true);
    });

    if (record.more) {
      el.classList.add('df-term-more');
      el.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        startHold(item, event);
      });
      el.addEventListener('keydown', function (event) {
        if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
        event.preventDefault();
        startHold(item, null);
      });
      el.addEventListener('keyup', function (event) {
        if (event.key === 'Enter' || event.key === ' ') cancelHold();
      });
      el.addEventListener('contextmenu', function (event) {
        if (holding || Date.now() - holdEnded < 800) event.preventDefault();
      });
    }
    return item;
  }

  DocForm.tooltip = {
    termKey: termKey,
    glossary: glossary,
    lookup: lookup,
    extended: extended,
    holdTime: holdTime,
    matcher: matcher,
    findTerms: findTerms,
    linkable: linkable,
    autoLink: autoLink,
    place: place,
    attach: attach,
    hide: function () { hide(true); }
  };

  DocForm.register('tooltip', function (site) {
    var terms = glossary(site.glossary);
    var options = site.terms || {};

    var roots = DocForm.all('[data-df-autolink]:not([data-df-autolink="false"])');
    if (options.autoLink === true) roots = DocForm.all('.df-page').concat(roots);
    var auto = new Set(autoLink(roots, matcher(Object.keys(terms))));

    DocForm.all('[data-df-tip]').forEach(function (el) {
      el.classList.add('df-tip');
      attach(el, '', el.getAttribute('data-df-tip'));
    });

    // Terms that share an entry and extended text share one tooltip box.
    var shared = new Map();
    DocForm.all('[data-df-term]').forEach(function (el) {
      el.classList.add('df-term');
      var entry = lookup(terms, el);
      if (!entry) {
        el.classList.add('df-term-missing');
        return;
      }
      var more = extended(entry, el);
      var byMore = shared.get(entry);
      if (!byMore) shared.set(entry, byMore = {});
      if (!hasOwn.call(byMore, more)) byMore[more] = card(entry.title, entry.text, more);
      attach(el, entry.title, entry.text, {
        card: byMore[more],
        hold: holdTime(el, site),
        focusable: !auto.has(el)
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && active) hide(true);
    });
    document.addEventListener('pointermove', function (event) {
      if (holding && holding.id === event.pointerId &&
        Math.hypot(event.clientX - holding.x, event.clientY - holding.y) > HOLD_SLOP) cancelHold();
    });
    document.addEventListener('pointerup', cancelHold);
    document.addEventListener('pointercancel', cancelHold);
    document.addEventListener('selectstart', function (event) {
      if (holding) event.preventDefault();
    });
    document.addEventListener('pointerdown', function (event) {
      if (!active || !active.card.box.classList.contains('is-expanded')) return;
      if (!active.card.box.contains(event.target) && !active.el.contains(event.target)) hide(true);
    });
    var follow = function () { if (active) position(active); };
    root.addEventListener('scroll', follow, { passive: true, capture: true });
    root.addEventListener('resize', follow);
  });
})(typeof window !== 'undefined' ? window : globalThis);
