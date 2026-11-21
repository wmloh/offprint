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
    '[data-df-template]', '[data-df-bind]', '[data-df-parameter]', '.df-sidebar', '.df-controls',
    '.df-legend', '.df-bubble', '.df-tag', '[data-df-autolink="false"]'
  ].join(', ');
  var TAG_SKIP = '[role="tooltip"], .df-tooltip, [data-df-template], [data-df-autolink="false"]';
  var RING = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle class="df-ring-track" cx="8" cy="8" r="6"/>' +
    '<circle class="df-ring-fill" cx="8" cy="8" r="6" pathLength="1"/></svg>';
  var count = 0;
  var hasOwn = Object.prototype.hasOwnProperty;

  var termKey = DocForm.termKey;
  var GLOSSARY_SHAPE = DocForm.tagShapes[0];
  var boot = DocForm._boot;
  var component = DocForm._component;

  // Normalizes manifest glossary entries to { key: { title, text, more, tags } }. Entries are strings or
  // { title, text, more, tags }. With the site's tag registry, tags must name glossary tags and every entry needs one:
  // unknown tags are dropped and untagged entries are listed in one warning.
  function glossary(raw, registry) {
    var out = {};
    var untagged = [];
    Object.keys(raw || {}).forEach(function (name) {
      var value = raw[name];
      var key = termKey(name);
      var entry = null;
      if (typeof value === 'string') entry = { title: name.trim(), text: value, more: '', tags: [] };
      else if (value && typeof value === 'object' && typeof value.text === 'string') {
        entry = {
          title: typeof value.title === 'string' ? value.title : name.trim(),
          text: value.text,
          more: typeof value.more === 'string' ? value.more.trim() : '',
          tags: registry ? knownTags(DocForm.tagKeys(value.tags), registry, 'Glossary entry "' + name.trim() + '"') :
            DocForm.tagKeys(value.tags)
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
      if (!entry.tags.length) untagged.push(entry.title);
    });
    if (registry && untagged.length) {
      DocForm.warnOnce('glossary-untagged', untagged.length + ' glossary ' + (untagged.length === 1 ? 'entry has' : 'entries have') +
        ' no tags; give each a "tags" array of options.tags.glossary labels: ' + untagged.slice(0, 8).join(', ') +
        (untagged.length > 8 ? ', …' : '') + '.');
    }
    return out;
  }

  // The glossary tag keys the registry knows, warning once about any other names.
  function knownTags(keys, registry, owner) {
    var known = (registry && registry.glossary) || {};
    return keys.filter(function (key) {
      if (hasOwn.call(known, key)) return true;
      DocForm.warnOnce('tag-unknown:' + owner + ':' + key, owner + ' names unknown glossary tag "' + key +
        '"; add it to options.tags.glossary.');
      return false;
    });
  }

  // A circle glossary tag for a tooltip, glossary row, or filter, or the dashed "Untagged" fallback for a null key.
  function tagChip(key, registry, tagName) {
    var el = document.createElement(tagName || 'span');
    var tag = key === null ? null : registry.glossary[key];
    el.className = 'df-tag df-tag-glossary' + (tag ? '' : ' df-tag-untagged');
    el.setAttribute('data-df-shape', tag ? GLOSSARY_SHAPE : 'none');
    if (tag && tag.role) el.setAttribute('data-df-role', tag.role);
    else if (tag && tag.color) el.setAttribute('data-df-color', tag.color);
    el.textContent = tag ? tag.label : 'Untagged';
    return el;
  }

  // Classifies every author tag by its class shape: data-df-tag-class names a class, else the label is listed in one.
  // Unclassified tags warn and get the dashed fallback marker. Returns the unclassified tags.
  function classifyTags(scope, site) {
    var registry = (site && site.tags) || { glossary: {}, classes: {}, labels: {} };
    var missing = [];
    DocForm.all('.df-tag', scope).forEach(function (el) {
      if (el.closest('.df-tooltip') || el.classList.contains('df-tag-glossary')) return;
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      var named = el.getAttribute('data-df-tag-class');
      var owner = null;
      if (named !== null) {
        owner = named.trim().toLowerCase();
        if (!hasOwn.call(registry.classes, owner)) {
          DocForm.warnOnce('tag-class-unknown:' + owner, 'Tag "' + text + '" names unknown tag class "' + named.trim() + '"' +
            (owner === 'glossary' ? '; glossary tags are matched by their label' : '; add it to options.tags.classes') + '.', el);
          owner = null;
        }
      } else owner = registry.labels[termKey(text)] || null;
      var shape = owner === 'glossary' ? GLOSSARY_SHAPE : owner ? registry.classes[owner].shape : 'none';
      el.setAttribute('data-df-shape', shape);
      el.classList.toggle('df-tag-unclassified', !owner);
      if (owner) return;
      DocForm.warnOnce('tag-class:' + text, 'Tag "' + text + '" has no tag class; list it in options.tags.classes.<name>.tags ' +
        'or set data-df-tag-class.', el);
      missing.push(el);
    });
    return missing;
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

  // Extended HTML for a term: data-df-more-id names a template or hidden element, else data-df-more gives inline
  // HTML (an empty value turns the extended card off), else the glossary's text.
  function extended(entry, el) {
    var fallback = entry && entry.more ? entry.more : '';
    var id = el.getAttribute('data-df-more-id');
    if (id !== null) {
      var target = component.target(id.trim(), 'tooltips', true, el.ownerDocument);
      if (target) return String(target.innerHTML).trim();
    }
    var attr = el.getAttribute('data-df-more');
    return attr === null ? fallback : attr.trim();
  }

  function holdTime(el, site) {
    if (boot) {
      var valid = function (value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; };
      var fallback = component.option('tooltips', el, 'hold', HOLD, valid);
      return component.number(el, 'hold', 'tooltips', fallback, valid);
    }
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
    return !!block && rootEl.contains(block) && !parent.closest(SKIP) &&
      !component.closestFlag(parent, 'no-autolink', 'tooltips');
  }

  // Wraps glossary terms found in the roots' text with span.df-term.df-term-auto and returns the new spans.
  function autoLink(roots, re) {
    var made = [];
    if (!re) return made;
    roots = roots.filter(function (el, i) {
      return roots.indexOf(el) === i && !roots.some(function (other) { return other !== el && other.contains(el); });
    });
    roots.forEach(function (rootEl) {
      // The owner document, so the search-index builder can link terms in pages it parsed.
      var doc = rootEl.ownerDocument;
      var walker = doc.createTreeWalker(rootEl, 4);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        if (!linkable(node, rootEl)) return;
        var text = node.nodeValue;
        var hits = findTerms(text, re);
        if (!hits.length) return;
        var frag = doc.createDocumentFragment();
        var at = 0;
        hits.forEach(function (hit) {
          if (hit.start > at) frag.appendChild(doc.createTextNode(text.slice(at, hit.start)));
          var span = doc.createElement('span');
          span.className = 'df-term df-term-auto';
          span.setAttribute('data-df-term', hit.key);
          span.textContent = text.slice(hit.start, hit.end);
          frag.appendChild(span);
          made.push(span);
          at = hit.end;
        });
        if (at < text.length) frag.appendChild(doc.createTextNode(text.slice(at)));
        node.parentNode.replaceChild(frag, node);
      });
    });
    return made;
  }

  // The glossary key a tag's whole label names, or null. Tags with their own tip or term, or containing one, keep it.
  function tagTerm(el, keys) {
    if (el.hasAttribute('data-df-term') || el.hasAttribute('data-df-tip') || el.closest(TAG_SKIP) ||
      el.querySelector('[data-df-term], [data-df-tip]')) return null;
    var key = termKey(el.textContent || '');
    return key && keys.has(key) ? key : null;
  }

  // Makes each tag whose label is a glossary term that term's tooltip anchor, and returns those tags.
  function linkTags(scope, terms) {
    var keys = new Set(Object.keys(terms || {}).map(termKey));
    var made = [];
    if (!keys.size) return made;
    DocForm.all('.df-tag', scope).forEach(function (el) {
      var key = tagTerm(el, keys);
      if (!key) return;
      el.setAttribute('data-df-term', key);
      made.push(el);
    });
    return made;
  }

  // Every tag and role-legend entry must have a hover tooltip. One without its own tip, term, or glossary match
  // takes its glossary tag's tip, then its role's manifest tip; otherwise it warns and falls back to its role name or label, and is returned.
  var TAGS = '.df-tag, .df-legend-item';
  function tipTags(scope, site) {
    var tips = (site && site.roleTips) || {};
    var missing = [];
    DocForm.all(TAGS, scope).forEach(function (el) {
      if (el.hasAttribute('data-df-term') || el.hasAttribute('data-df-tip') ||
        el.querySelector('[data-df-term], [data-df-tip]')) return;
      var glossaryTag = site && site.tags && site.tags.glossary[termKey(el.textContent || '')];
      if (glossaryTag && el.classList.contains('df-tag')) {
        el.setAttribute('data-df-tip', glossaryTag.tip);
        return;
      }
      var role = (el.getAttribute('data-df-role') || '').trim().toLowerCase();
      if (role && hasOwn.call(tips, role)) {
        el.setAttribute('data-df-tip', tips[role]);
        return;
      }
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      var fallback = role ? 'Colour role: ' + role.replace(/[-_]+/g, ' ') : text;
      DocForm.warnOnce('tag-tip:' + (role || text), 'Tag "' + text + '" has no tooltip; add data-df-tip or data-df-term' +
        (role ? ', or options.roles.tips["' + role + '"]' : '') + '. Showing "' + fallback + '" instead.', el);
      if (fallback) el.setAttribute('data-df-tip', fallback);
      el.classList.add('df-tag-untipped');
      missing.push(el);
    });
    return missing;
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
  // options.tags (glossary tag keys, with options.registry) adds a line of circle tags, or "Untagged" when empty.
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
    if (options.tags) {
      var line = document.createElement('div');
      line.className = 'df-tooltip-tags';
      var registry = options.registry || { glossary: {} };
      (options.tags.length ? options.tags : [null]).forEach(function (key) { line.appendChild(tagChip(key, registry)); });
      box.appendChild(line);
    }
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
    box.classList.toggle('is-clipped', box.scrollHeight > box.clientHeight + 1);
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
    if (item.disposed || (item.enabled && !item.enabled())) return;
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
    if (active !== item) return;
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
    if (boot || typeof el === 'string') el = component.target(el, 'tooltips', true);
    if (!el) return null;
    options = options || {};
    var listeners = [];
    function listen(type, fn) {
      listeners.push([type, fn]);
      el.addEventListener(type, fn);
    }
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
    var tabindex = el.getAttribute('tabindex');
    // An anchor inside a button or link, such as a card tag, stays out of the tab order of its control.
    var nested = el.parentElement && typeof el.parentElement.closest === 'function' &&
      el.parentElement.closest('a[href], button');
    var addedTabindex = options.focusable !== false && !el.matches(FOCUSABLE) && !nested;
    if (addedTabindex) el.tabIndex = 0;

    var later = function () {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      showTimer = setTimeout(function () { show(item); }, item.delay);
    };
    listen('mouseenter', later);
    listen('mouseleave', function () { hide(false); });
    listen('focus', function () { show(item); });
    listen('blur', function () {
      if (active === item && record.box.matches(':hover')) return;
      hide(true);
    });

    var addedMore = record.more && !el.classList.contains('df-term-more');
    if (record.more) {
      el.classList.add('df-term-more');
      listen('pointerdown', function (event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        startHold(item, event);
      });
      listen('keydown', function (event) {
        if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
        event.preventDefault();
        startHold(item, null);
      });
      listen('keyup', function (event) {
        if (event.key === 'Enter' || event.key === ' ') cancelHold();
      });
      listen('contextmenu', function (event) {
        if (holding || Date.now() - holdEnded < 800) event.preventDefault();
      });
    }
    return function () {
      if (item.disposed) return;
      item.disposed = true;
      if (active === item) hide(true);
      if (holding && holding.item === item) cancelHold();
      listeners.forEach(function (entry) { el.removeEventListener(entry[0], entry[1]); });
      if (options.describe !== false) {
        var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) {
          return id && id !== record.box.id;
        });
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
        else el.removeAttribute('aria-describedby');
      }
      if (addedTabindex && el.getAttribute('tabindex') === '0') {
        if (tabindex === null) el.removeAttribute('tabindex');
        else el.setAttribute('tabindex', tabindex);
      }
      if (addedMore) el.classList.remove('df-term-more');
      if (!options.card) record.box.remove();
    };
  }

  DocForm.tooltips = {
    termKey: termKey,
    glossary: glossary,
    lookup: lookup,
    extended: extended,
    holdTime: holdTime,
    matcher: matcher,
    findTerms: findTerms,
    linkable: linkable,
    autoLink: autoLink,
    tagTerm: tagTerm,
    linkTags: linkTags,
    tipTags: tipTags,
    knownTags: knownTags,
    tagChip: tagChip,
    classifyTags: classifyTags,
    card: card,
    place: place,
    mixed: setMixed,
    rich: rich,
    attach: attach,
    hide: function () { hide(true); }
  };

  DocForm.register('tooltip', function (site) {
    var registry = site.tags || { glossary: {}, classes: {}, labels: {} };
    var terms = glossary(site.glossary, registry);
    var options = site.terms || {};

    var roots = DocForm.all('[data-df-autolink]').filter(function (el) {
      return boot ? component.flag(el, 'autolink', 'tooltips') : el.getAttribute('data-df-autolink') !== 'false';
    });
    var autoLinkPages = boot ? component.option('tooltips', null, 'autoLink', false, function (value) {
      return typeof value === 'boolean';
    }) : options.autoLink === true;
    if (autoLinkPages) roots = DocForm.all('.df-page').filter(function (el) {
      return !boot || component.flag(el, 'autolink', 'tooltips', true);
    }).concat(roots);
    var auto = new Set(linkTags(document, terms).concat(autoLink(roots, matcher(Object.keys(terms)))));
    classifyTags(document, site);
    tipTags(document, site);

    // Tips in running text are glossary entries and need at least one glossary tag from data-df-tip-tags.
    DocForm.all('[data-df-tip]').forEach(function (el) {
      el.classList.add('df-tip');
      var tags = null;
      if (DocForm.glossaryTip(el)) {
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        tags = knownTags(DocForm.tagKeys(el.getAttribute('data-df-tip-tags')), registry, 'Tip "' + text + '"');
        if (!tags.length) {
          DocForm.warnOnce('tip-untagged:' + text, 'Tip "' + text + '" has no glossary tag; add data-df-tip-tags with ' +
            'labels from options.tags.glossary.', el);
          el.classList.add('df-tip-untagged');
        }
      }
      attach(el, '', el.getAttribute('data-df-tip'), { tags: tags, registry: registry });
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
      if (!byMore) shared.set(entry, byMore = Object.create(null));
      if (!hasOwn.call(byMore, more)) byMore[more] = card(entry.title, entry.text, more, { tags: entry.tags, registry: registry });
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
