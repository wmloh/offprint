// Ctrl+K search palette over the manifest's pages, read from a search index loaded as a script global.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] search.js needs core.js loaded before it.');
    return;
  }

  var LIMIT = 30;
  var TEXT_CAP = 4000;
  var SNIPPET = 140;
  var SKIP = 'script, style, template, noscript, nav, ' +
    'button:not(.df-step-panel button[data-df-step], .df-card-panel > .df-step-panel > .df-step-list > button[data-df-card]), ' +
    'svg, canvas, select, textarea, [hidden], ' +
    '[aria-hidden="true"], .df-math, .katex, .df-sidebar, .df-controls, .df-tooltip, .df-note-ref, ' +
    '.df-sidenote-num, .df-heading-link, .df-code-bar, [data-df-no-search]';
  var BLOCK = /^(P|LI|DIV|SECTION|ARTICLE|ASIDE|BLOCKQUOTE|PRE|TABLE|TR|TD|TH|CAPTION|FIGURE|FIGCAPTION|DL|DT|DD|UL|OL|H[1-6]|BR|HR|HEADER|FOOTER|MAIN|DETAILS|SUMMARY|BUTTON)$/;
  var hasOwn = Object.prototype.hasOwnProperty;

  function clean(text) {
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function pageRoot(doc) {
    return doc.querySelector('.df-page') || doc.querySelector('main') || doc.body;
  }

  var TERMS = '[data-df-tip], [data-df-term]';

  // One inline tip or glossary-term use: { text, tip, section } or { text, term, section }, keyed by the underlined
  // text (or data-df-term). Repeats on a page are recorded once.
  function noteTerm(el, section, list, seen) {
    var text = clean(el.textContent);
    var record = null;
    if (el.hasAttribute('data-df-tip')) {
      var tip = clean(el.getAttribute('data-df-tip'));
      if (text && tip) record = { text: text, tip: tip, section: section };
    } else {
      var name = el.getAttribute('data-df-term');
      var key = DocForm.termKey(name && name.trim() ? name : text);
      if (text && key) record = { text: text, term: key, section: section };
    }
    if (!record) return;
    var id = JSON.stringify([record.text, record.tip || '', record.term || '', section]);
    if (seen[id]) return;
    seen[id] = true;
    list.push(record);
  }

  // Splits a page into its intro and h2/h3 sections of plain text, plus the inline tips and glossary terms used in
  // them. Headings without ids get the ids nav.js would give them, so index links match the live page.
  function extract(doc, title) {
    var main = pageRoot(doc);
    var used = new Set(Array.prototype.map.call(doc.querySelectorAll('[id]'), function (el) { return el.id; }));
    Array.prototype.forEach.call(main.querySelectorAll('h2, h3'), function (h) {
      if (!h.id && !h.closest('.df-sidebar, [data-df-no-outline]')) h.id = DocForm.uniqueSlug(DocForm.slug(h.textContent), used);
    });
    var h1 = main.querySelector('h1');
    var titleEl = doc.querySelector('title');
    var pageTitle = clean(title || (h1 && h1.textContent) || (titleEl && titleEl.textContent) || '');
    var sections = [{ id: '', title: pageTitle, level: 1, text: '' }];
    var parts = [[]];
    var terms = [];
    var seen = {};
    var walker = doc.createTreeWalker(main, 5, {
      acceptNode: function (node) {
        if (node.nodeType === 1) {
          if (node.matches(SKIP) || node.tagName === 'H1' && node === h1) return 2;
          if (/^H[23]$/.test(node.tagName) && node.id && !node.closest('[data-df-no-outline]')) {
            sections.push({ id: node.id, title: clean(node.textContent), level: node.tagName === 'H2' ? 2 : 3, text: '' });
            parts.push([]);
            return 2;
          }
          if (node.matches(TERMS)) noteTerm(node, sections[sections.length - 1].id, terms, seen);
          if (BLOCK.test(node.tagName)) parts[parts.length - 1].push(' ');
          return 3;
        }
        return 1;
      }
    });
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (node.nodeType === 3) parts[parts.length - 1].push(node.nodeValue);
    }
    sections.forEach(function (section, i) {
      var text = clean(parts[i].join(''));
      section.text = text.length > TEXT_CAP ? text.slice(0, TEXT_CAP).replace(/\s+\S*$/, '') : text;
    });
    return { title: pageTitle, sections: sections.filter(function (s, i) { return i === 0 || s.title; }), terms: terms };
  }

  function tokens(query) {
    var seen = {};
    return clean(query).toLowerCase().split(' ').filter(function (t) {
      if (!t || hasOwn.call(seen, t)) return false;
      seen[t] = true;
      return true;
    });
  }

  function wordStart(text, at) {
    return at === 0 || !/[\p{L}\p{N}]/u.test(text.charAt(at - 1));
  }

  // Score of one token in one field: a whole-word start beats a mid-word match.
  function fieldScore(text, token, weight) {
    var at = text.indexOf(token);
    if (at < 0) return 0;
    var best = wordStart(text, at) ? 2 : 1;
    while (best < 2 && (at = text.indexOf(token, at + 1)) >= 0) {
      if (wordStart(text, at)) best = 2;
    }
    return weight * best;
  }

  function count(text, token) {
    var n = 0;
    for (var at = text.indexOf(token); at >= 0 && n < 5; at = text.indexOf(token, at + token.length)) n++;
    return n;
  }

  // Ranks entries { page, title, text } for a query. Every token must appear somewhere; section titles weigh most,
  // then page titles, then body text (with a small bonus for repeats), plus a bonus when the whole query appears.
  function rank(entries, query, limit) {
    var words = tokens(query);
    if (!words.length) return [];
    var phrase = words.join(' ');
    var out = [];
    entries.forEach(function (entry, index) {
      var title = String(entry.title || '').toLowerCase();
      var page = String(entry.page || '').toLowerCase();
      var text = String(entry.text || '').toLowerCase();
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var s = fieldScore(title, w, 10) + fieldScore(page, w, 3) + fieldScore(text, w, 1);
        if (!s) return;
        score += s + Math.min(count(text, w), 5) * 0.2;
      }
      if (words.length > 1) {
        if (title.indexOf(phrase) >= 0) score += 15;
        else if (text.indexOf(phrase) >= 0) score += 4;
      }
      if (title === phrase) score += 10;
      out.push({ entry: entry, score: score, index: index });
    });
    out.sort(function (a, b) { return b.score - a.score || a.index - b.index; });
    return out.slice(0, limit || LIMIT);
  }

  // Splits text into [{ text, hit }] pieces with every token occurrence marked.
  function highlight(text, words) {
    text = String(text);
    var lower = text.toLowerCase();
    var marks = [];
    words.forEach(function (w) {
      for (var at = lower.indexOf(w); at >= 0 && w; at = lower.indexOf(w, at + w.length)) marks.push([at, at + w.length]);
    });
    marks.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var out = [];
    var pos = 0;
    marks.forEach(function (m) {
      if (m[1] <= pos) return;
      var start = Math.max(m[0], pos);
      if (start > pos) out.push({ text: text.slice(pos, start), hit: false });
      out.push({ text: text.slice(start, m[1]), hit: true });
      pos = m[1];
    });
    if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
    return out;
  }

  // A window of body text around the first token match, cut at word boundaries.
  function snippet(text, words, size) {
    text = String(text || '');
    size = size || SNIPPET;
    if (text.length <= size) return text;
    var lower = text.toLowerCase();
    var at = -1;
    words.forEach(function (w) {
      var i = lower.indexOf(w);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    });
    var start = at < 0 ? 0 : Math.max(0, at - Math.round(size / 3));
    var end = Math.min(text.length, start + size);
    start = Math.max(0, end - size);
    var piece = text.slice(start, end);
    if (start > 0) piece = '…' + piece.replace(/^\S*\s/, '');
    if (end < text.length) piece = piece.replace(/\s\S*$/, '') + '…';
    return piece;
  }

  function pageKey(href) {
    return String(href).split('#')[0].split('?')[0].replace(/\/index\.html?$/i, '/');
  }

  // Index loading -----------------------------------------------------------

  var waiting = null;
  var failed = false;

  function index() {
    var value = root.DocFormSearch;
    return value && Array.isArray(value.pages) ? value : null;
  }

  function load(callback) {
    if (index() || failed) return callback(index());
    var src = DocForm.site && DocForm.site.search;
    if (!src) return callback(null);
    if (waiting) return waiting.push(callback);
    waiting = [callback];
    var script = document.createElement('script');
    script.src = src;
    var done = function () {
      if (!index()) {
        failed = true;
        DocForm.warnOnce('search-index', 'Search index "' + src + '" did not load or does not set window.DocFormSearch.');
      }
      var list = waiting;
      waiting = null;
      list.forEach(function (fn) { fn(index()); });
    };
    script.onload = done;
    script.onerror = done;
    document.head.appendChild(script);
  }

  function base() {
    var site = DocForm.site || {};
    return site.provided ? site.base : root.location.href;
  }

  // Search entries: the live current page plus every other page in the index.
  function entries(data) {
    var here = pageKey(root.location.href);
    var site = DocForm.site || {};
    var current = null;
    (site.order || []).forEach(function (page) {
      if (!current && page.href && pageKey(page.href) === here) current = page.title;
    });
    var out = [];
    var live = extract(document, current);
    live.sections.forEach(function (s) {
      out.push({ page: live.title, title: s.title, level: s.level, text: s.text, href: s.id ? '#' + s.id : '#', current: true });
    });
    if (!data) return out;
    data.pages.forEach(function (page) {
      var href = DocForm.resolvePath(page.path, base());
      if (!href || pageKey(href) === here) return;
      (page.sections || []).forEach(function (s) {
        out.push({
          page: page.title,
          title: s.title || page.title,
          level: s.level || 1,
          text: s.text || '',
          href: s.id ? href.split('#')[0] + '#' + encodeURIComponent(s.id) : href,
          current: false
        });
      });
    });
    return out;
  }

  // Looks up the index section for a URL, for previews of links to other pages: callback({ page, title, text }|null).
  function find(href, callback) {
    load(function (data) {
      if (!data) return callback(null);
      var key = pageKey(href);
      var hash = String(href).split('#')[1] || '';
      try {
        hash = decodeURIComponent(hash);
      } catch (e) {
        // Keep the raw hash.
      }
      for (var i = 0; i < data.pages.length; i++) {
        var page = data.pages[i];
        var url = DocForm.resolvePath(page.path, base());
        if (!url || pageKey(url) !== key) continue;
        var sections = page.sections || [];
        for (var j = 0; j < sections.length; j++) {
          if ((sections[j].id || '') === hash) {
            return callback({ page: page.title, title: sections[j].title || page.title, text: sections[j].text || '' });
          }
        }
        return callback({ page: page.title, title: page.title, text: sections.length ? sections[0].text || '' : '' });
      }
      callback(null);
    });
  }

  // Palette -----------------------------------------------------------------

  var ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/>' +
    '<path d="M10.5 10.5l3.5 3.5"/></svg>';
  var ui = null;

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function marked(el, text, words) {
    highlight(text, words).forEach(function (piece) {
      el.appendChild(piece.hit ? make('mark', null, piece.text) : document.createTextNode(piece.text));
    });
    return el;
  }

  function build() {
    var dialog = make('dialog', 'df-search');
    dialog.setAttribute('aria-label', 'Search');
    var bar = make('div', 'df-search-bar');
    var icon = make('span', 'df-search-icon');
    icon.innerHTML = ICON;
    var input = make('input', 'df-search-input');
    input.type = 'search';
    input.placeholder = 'Search pages and sections';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'df-search-results');
    input.setAttribute('aria-autocomplete', 'list');
    var list = make('ul', 'df-search-results');
    list.id = 'df-search-results';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Results');
    var status = make('div', 'df-search-status');
    status.setAttribute('aria-live', 'polite');
    var foot = make('div', 'df-search-foot');
    foot.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span>' +
      '<span><kbd>Esc</kbd> close</span>';
    bar.appendChild(icon);
    bar.appendChild(input);
    dialog.appendChild(bar);
    dialog.appendChild(list);
    dialog.appendChild(status);
    dialog.appendChild(foot);
    document.body.appendChild(dialog);

    var state = { dialog: dialog, input: input, list: list, status: status, items: [], active: -1, data: null };

    input.addEventListener('input', function () { update(state); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var n = state.items.length;
        if (n) select(state, (state.active + (event.key === 'ArrowDown' ? 1 : -1) + n) % n);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (state.active >= 0) go(state, state.items[state.active]);
      }
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('close', function () {
      if (state.opener && state.opener.focus && document.contains(state.opener)) state.opener.focus({ preventScroll: true });
    });
    return state;
  }

  function select(state, i) {
    state.active = i;
    Array.prototype.forEach.call(state.list.children, function (li, j) {
      li.setAttribute('aria-selected', String(j === i));
      if (j === i) {
        state.input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
    if (i < 0) state.input.removeAttribute('aria-activedescendant');
  }

  function go(state, item) {
    close();
    if (item.current) {
      var id = item.href.slice(1);
      var target = id ? document.getElementById(decodeURIComponent(id)) : null;
      if (target) {
        if (root.history && root.history.pushState) root.history.pushState(null, '', item.href);
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        root.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    root.location.href = item.href;
  }

  // With an empty query, the palette lists the manifest's pages, or this page's sections without a manifest.
  function defaults(all) {
    var site = DocForm.site || {};
    var here = pageKey(root.location.href);
    if (site.order && site.order.length) {
      return site.order.map(function (page) {
        var current = pageKey(page.href) === here;
        return { page: page.title, title: page.title, level: 1, text: '', href: current ? '#' : page.href, current: current };
      });
    }
    return all.filter(function (e) { return e.current; });
  }

  function update(state) {
    // Extracting the live page walks the whole document, so it happens once per opening, not per keystroke.
    var all = state.all || (state.all = entries(state.data));
    var query = state.input.value;
    var words = tokens(query);
    var shown = words.length ? rank(all, query).map(function (r) { return r.entry; }) : defaults(all);
    state.items = shown;
    state.list.textContent = '';
    shown.forEach(function (item, i) {
      var li = make('li', 'df-search-item');
      li.id = 'df-search-item-' + i;
      li.setAttribute('role', 'option');
      var head = make('div', 'df-search-title');
      if (item.level === 3) head.classList.add('is-sub');
      marked(head, item.title, words);
      var where = make('div', 'df-search-where', item.current ? (item.level > 1 ? 'This page · ' + item.page : 'This page') : item.page);
      li.appendChild(head);
      if (item.level > 1 || !item.current) li.appendChild(where);
      if (words.length && item.text) li.appendChild(marked(make('div', 'df-search-snippet'), snippet(item.text, words), words));
      li.addEventListener('mousemove', function () { if (state.active !== i) select(state, i); });
      li.addEventListener('click', function () { go(state, item); });
      state.list.appendChild(li);
    });
    select(state, shown.length ? 0 : -1);
    var scope = state.data ? '' : ' (this page only: no search index loaded)';
    state.status.textContent = words.length ?
      (shown.length ? shown.length + (shown.length === 1 ? ' result' : ' results') : 'No results') + scope : scope.trim();
    state.status.hidden = !state.status.textContent;
  }

  function open(opener) {
    if (!ui) ui = build();
    if (ui.dialog.open) return;
    ui.opener = opener || document.activeElement;
    ui.all = null;
    ui.dialog.showModal();
    ui.input.select();
    update(ui);
    load(function (data) {
      if (ui.data === data) return;
      ui.data = data;
      ui.all = null;
      if (ui.dialog.open) update(ui);
    });
  }

  function close() {
    if (ui && ui.dialog.open) ui.dialog.close();
  }

  function toggle(opener) {
    if (ui && ui.dialog.open) close();
    else open(opener);
  }

  function isShortcut(event) {
    return !!(event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
      typeof event.key === 'string' && event.key.toLowerCase() === 'k';
  }

  // Indexed pages with resolved URLs, for other modules such as the sidebar and glossary:
  // callback([{ href, title, sections, terms }]|null). `terms` is null for an index built before terms were recorded.
  function pages(callback) {
    load(function (data) {
      if (!data) return callback(null);
      callback(data.pages.map(function (page) {
        return {
          href: DocForm.resolvePath(page.path, base()),
          title: page.title,
          sections: page.sections || [],
          terms: Array.isArray(page.terms) ? page.terms : null
        };
      }).filter(function (page) { return page.href; }));
    });
  }

  DocForm.search = {
    extract: extract,
    tokens: tokens,
    rank: rank,
    highlight: highlight,
    snippet: snippet,
    isShortcut: isShortcut,
    load: load,
    find: find,
    pages: pages,
    open: open,
    close: close,
    toggle: toggle,
    icon: ICON
  };

  DocForm.register('search', function () {
    document.addEventListener('keydown', function (event) {
      if (!isShortcut(event) || event.isComposing) return;
      event.preventDefault();
      toggle();
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
