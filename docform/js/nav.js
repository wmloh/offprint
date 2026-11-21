(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] nav.js needs core.js loaded before it.');
    return;
  }

  var DRAWER = '(max-width: 860px), (any-hover: none)';
  var SPY_LINE = 0.3;
  var SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  var CARET = SVG + ' width="12" height="12"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>';
  var MENU = SVG + ' width="18" height="18"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>';

  var SLIDE_MS = 180;
  var SLIDE_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
  var WIDTH_KEY = 'docform-nav-width';
  var WIDTH_MIN = 200;
  var WIDTH_MAX = 480;
  var WIDTH_SHARE = 0.4;
  var WIDTH_STEP = 16;

  var slugify = DocForm.slug;
  var uniqueSlug = DocForm.uniqueSlug;

  // Compares pages by location only, so "dir/" and "dir/index.html" match and query or hash are ignored.
  function pageKey(href) {
    var url;
    try {
      url = new URL(href);
    } catch (e) {
      return null;
    }
    var path = url.pathname;
    try {
      path = decodeURI(path);
    } catch (e) {
      // Keep the encoded path.
    }
    return url.protocol + '//' + url.host + path.replace(/\/index\.html?$/i, '/');
  }

  function findCurrent(order, href) {
    var key = pageKey(href);
    if (key === null) return -1;
    for (var i = 0; i < order.length; i++) {
      if (pageKey(order[i].href) === key) return i;
    }
    return -1;
  }

  // The active heading is the last one above the spy line, or the last heading once the page is scrolled to the end.
  function pickActive(tops, line, atBottom) {
    if (!tops.length) return -1;
    if (atBottom) return tops.length - 1;
    var active = -1;
    for (var i = 0; i < tops.length && tops[i] <= line; i++) active = i;
    return active;
  }

  function sectionProgress(tops, index, line, end, atBottom) {
    if (index < 0) return 0;
    if (atBottom) return 1;
    var start = tops[index];
    var limit = index + 1 < tops.length ? tops[index + 1] : end;
    return limit > start ? Math.min(1, Math.max(0, (line - start) / (limit - start))) : 0;
  }

  function outlineSections(items) {
    return items.filter(function (item) { return item.level === 1 && item.id; });
  }

  function clampWidth(width, viewport) {
    var max = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Math.round(viewport * WIDTH_SHARE)));
    return Math.round(Math.min(max, Math.max(WIDTH_MIN, width)));
  }

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function collectHeadings(scope) {
    var used = new Set(DocForm.all('[id]').map(function (el) { return el.id; }));
    var headings = DocForm.all('h1, h2, h3', scope).filter(function (h) {
      return !h.closest('.df-sidebar') && !DocForm._component.closestFlag(h, 'no-outline', 'navigation');
    });
    // Keep generated h2 and h3 anchors compatible with existing links and search indexes.
    headings.forEach(function (h) {
      if (!h.id && h.tagName !== 'H1') h.id = uniqueSlug(slugify(h.textContent), used);
    });
    return headings.map(function (h) {
      if (!h.id) h.id = uniqueSlug(slugify(h.textContent), used);
      return { level: Number(h.tagName[1]), id: h.id, text: h.textContent.trim(), el: h };
    });
  }

  function headingUrl(href, id) {
    return String(href).split('#')[0] + '#' + encodeURIComponent(id);
  }

  var LINK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-.9.9"/>' +
    '<path d="M9.5 6.5a3 3 0 0 0-4.2 0L3.2 8.6a3 3 0 0 0 4.2 4.2l.9-.9"/></svg>';
  var DONE_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';

  // A button after the heading text copies the section's URL; if copying is blocked, the URL goes to the address bar.
  function linkHeading(h) {
    if (h.querySelector('.df-heading-link')) return;
    var button = make('button', 'df-heading-link');
    button.type = 'button';
    button.innerHTML = LINK_ICON;
    button.setAttribute('aria-label', 'Copy link to this section');
    button.title = 'Copy link';
    var timer = 0;
    button.addEventListener('click', function () {
      var url = headingUrl(root.location.href, h.id);
      DocForm.copyText(url).then(function () {
        button.classList.add('is-done');
        button.innerHTML = DONE_ICON;
        button.title = 'Link copied';
        clearTimeout(timer);
        timer = setTimeout(function () {
          button.classList.remove('is-done');
          button.innerHTML = LINK_ICON;
          button.title = 'Copy link';
        }, 1600);
      }, function () {
        if (root.history && root.history.replaceState) root.history.replaceState(null, '', url);
      });
    });
    h.appendChild(button);
  }

  function renderOutline(sections, href, links) {
    var list = make('ul', 'df-outline');
    sections.forEach(function (section) {
      var li = make('li', 'df-outline-item');
      var link = make('a', 'df-outline-link', section.text);
      link.href = headingUrl(href, section.id);
      if (links) links[section.id] = link;
      li.appendChild(link);
      list.appendChild(li);
    });
    return list;
  }

  var motions = typeof WeakMap === 'function' ? new WeakMap() : null;

  // Animates a list's height between its natural size and zero, starting from wherever a running slide had reached.
  function slide(list, open, animate) {
    var running = motions && motions.get(list);
    var from = list.hidden ? 0 : list.getBoundingClientRect().height;
    var fade = list.hidden ? 0 : Number(root.getComputedStyle(list).opacity);
    if (running) {
      running.cancel();
      motions.delete(list);
    }
    list.hidden = false;
    if (!animate || !motions || typeof list.animate !== 'function') {
      list.style.overflow = '';
      list.hidden = !open;
      return;
    }
    var to = open ? list.getBoundingClientRect().height : 0;
    list.style.overflow = 'hidden';
    var motion = list.animate([
      { height: from + 'px', opacity: fade },
      { height: to + 'px', opacity: open ? 1 : 0 }
    ], { duration: SLIDE_MS, easing: SLIDE_EASE });
    motions.set(list, motion);
    motion.onfinish = function () {
      motions.delete(list);
      list.style.overflow = '';
      list.hidden = !open;
    };
  }

  function disclosure(caret, list, open) {
    function render(animate) {
      caret.setAttribute('aria-expanded', String(open));
      slide(list, open, animate);
    }

    function toggle() {
      open = !open;
      render(true);
    }

    caret.addEventListener('click', toggle);
    render(false);
    return toggle;
  }

  function pageCaret(title, box, ctx) {
    var caret = make('button', 'df-nav-caret');
    caret.type = 'button';
    caret.innerHTML = CARET;
    caret.setAttribute('aria-label', 'Toggle ' + title);
    box.id = 'df-nav-group-' + (++ctx.groups);
    caret.setAttribute('aria-controls', box.id);
    return caret;
  }

  function renderPages(pages, ctx) {
    var list = make('ul', 'df-nav-list');
    var found = false;
    pages.forEach(function (page) {
      var li = make('li', 'df-nav-item');
      var row = make('div', 'df-nav-row');
      var isCurrent = page === ctx.current;
      var sub = page.pages.length ? renderPages(page.pages, ctx) : null;
      var entry = { page: page, li: li, row: row, box: null };
      var label;

      if (page.href) {
        label = make('a', 'df-nav-link', page.title);
        label.href = page.href;
        if (isCurrent) label.setAttribute('aria-current', 'page');
        else ctx.others.push(entry);
      } else {
        label = make(sub ? 'button' : 'span', 'df-nav-label', page.title);
        if (sub) label.type = 'button';
      }

      if (sub) {
        entry.box = make('div', 'df-nav-group');
        entry.box.appendChild(sub.list);
        var caret = pageCaret(page.title, entry.box, ctx);
        var toggle = disclosure(caret, entry.box, !page.collapsed || isCurrent || sub.found);
        if (!page.href) {
          li.classList.add('df-nav-page-group');
          label.addEventListener('click', toggle);
        }
        row.appendChild(caret);
      } else {
        row.appendChild(make('span', 'df-nav-caret-space'));
      }

      row.appendChild(label);
      li.appendChild(row);
      if (isCurrent && ctx.outline) li.appendChild(ctx.outline);
      if (entry.box) li.appendChild(entry.box);
      list.appendChild(li);
      found = found || isCurrent || sub && sub.found;
    });
    return { list: list, found: found };
  }

  // Another page's indexed headings become a collapsed outline under its entry.
  function attachOutline(entry, sections, ctx) {
    var items = outlineSections(sections).map(function (section) {
      return { id: section.id, text: section.title };
    });
    if (!items.length) return;
    var outline = renderOutline(items, entry.page.href);
    if (entry.box) {
      entry.box.insertBefore(outline, entry.box.firstChild);
      return;
    }
    entry.box = make('div', 'df-nav-group');
    entry.box.hidden = true;
    entry.box.appendChild(outline);
    var caret = pageCaret(entry.page.title, entry.box, ctx);
    entry.row.replaceChild(caret, entry.row.querySelector('.df-nav-caret-space'));
    entry.li.appendChild(entry.box);
    disclosure(caret, entry.box, false);
  }

  function outlineOthers(ctx) {
    var search = DocForm.search;
    if (!ctx.others.length || !search || typeof search.pages !== 'function') return;
    search.pages(function (indexed) {
      if (!indexed) return;
      var byKey = {};
      indexed.forEach(function (page) { byKey[pageKey(page.href)] = page; });
      ctx.others.forEach(function (entry) {
        var page = byKey[pageKey(entry.page.href)];
        if (page) attachOutline(entry, page.outline, ctx);
      });
    });
  }

  function renderPager(main, order, index) {
    if (index < 0 || DocForm._component.closestFlag(main, 'no-pager', 'navigation')) return;
    var prev = order[index - 1];
    var next = order[index + 1];
    if (!prev && !next) return;
    var pager = make('nav', 'df-pager');
    pager.setAttribute('aria-label', 'Previous and next pages');
    [[prev, 'prev', 'Previous'], [next, 'next', 'Next']].forEach(function (entry) {
      if (!entry[0]) return;
      var link = make('a', 'df-pager-link df-pager-' + entry[1]);
      link.href = entry[0].href;
      link.rel = entry[1];
      link.appendChild(make('span', 'df-pager-dir', entry[2]));
      link.appendChild(make('span', 'df-pager-title', entry[0].title));
      pager.appendChild(link);
    });
    main.appendChild(pager);
  }

  function renderRail(headings) {
    var rail = make('nav', 'df-section-rail');
    rail.setAttribute('aria-label', 'Subsections on this page');
    var list = rail.appendChild(make('ol', 'df-section-list'));
    var entries = headings.map(function (heading, i) {
      var item = list.appendChild(make('li'));
      var link = item.appendChild(make('a', 'df-section-link'));
      link.href = '#' + encodeURIComponent(heading.id);
      link.setAttribute('aria-label', (i + 1) + '. ' + heading.text);
      var ring = link.appendChild(make('span', 'df-section-ring'));
      ring.setAttribute('aria-hidden', 'true');
      ring.innerHTML = '<svg viewBox="0 0 32 32" width="32" height="32" focusable="false">' +
        '<circle class="df-section-track" cx="16" cy="16" r="13.5"/>' +
        '<circle class="df-section-progress" cx="16" cy="16" r="13.5" pathLength="100" ' +
        'stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 16 16)"/></svg>';
      ring.appendChild(make('span', 'df-section-number', String(i + 1)));
      link.appendChild(make('span', 'df-section-name', heading.text));
      return { link: link, arc: ring.querySelector('.df-section-progress'), pct: 0 };
    });
    document.body.appendChild(rail);
    var active = -1;
    var visible = false;
    return {
      list: list,
      update: function (index, fraction) {
        if (!list.clientHeight) {
          visible = false;
          return;
        }
        if (index !== active) {
          if (active >= 0) entries[active].link.removeAttribute('aria-current');
          if (index >= 0) entries[index].link.setAttribute('aria-current', 'location');
        }
        if (index >= 0 && (index !== active || !visible) && !rail.matches(':hover, :focus-within')) {
          reveal(entries[index].link, list);
        }
        active = index;
        visible = true;
        entries.forEach(function (entry, i) {
          var pct = i < index ? 100 : i === index ? Math.round(100 * fraction) : 0;
          if (entry.pct === pct) return;
          entry.pct = pct;
          entry.arc.setAttribute('stroke-dashoffset', String(100 - pct));
        });
      }
    };
  }

  function reveal(link, box) {
    if (box.scrollHeight <= box.clientHeight) return;
    var r = link.getBoundingClientRect();
    var b = box.getBoundingClientRect();
    var pad = 48;
    if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top;
    else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - b.bottom + pad;
  }

  function spy(headings, links, sidebar, main) {
    if (!headings.length) return;
    var rail = renderRail(headings);
    var sentinel = main.appendChild(make('div', 'df-outline-sentinel'));
    sentinel.setAttribute('aria-hidden', 'true');
    var section = null;
    var sectionLinks = headings.map(function (h) {
      if (h.level === 1) section = links[h.id] || null;
      return section;
    });
    var active = null;
    var pending = false;

    function update() {
      pending = false;
      var height = root.innerHeight;
      var max = document.documentElement.scrollHeight - height;
      var remaining = Math.max(0, max - root.scrollY);
      var atBottom = max > 0 && remaining <= 2;
      // Near the end, follow the visible text below the usual reading line.
      var line = max > 0 ? Math.max(height * SPY_LINE, height - remaining) : height * SPY_LINE;
      var tops = headings.map(function (h) { return h.el.getBoundingClientRect().top; });
      var index = pickActive(tops, line, atBottom);
      var link = index >= 0 ? sectionLinks[index] : null;
      rail.update(index, sectionProgress(tops, index, line, sentinel.getBoundingClientRect().top, atBottom));
      if (link === active) return;
      if (active) {
        active.classList.remove('is-active');
        active.removeAttribute('aria-current');
      }
      active = link;
      if (link) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'location');
        reveal(link, sidebar);
      }
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(update);
    }

    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('resize', schedule);
    if (typeof root.ResizeObserver === 'function') {
      var observer = new root.ResizeObserver(schedule);
      observer.observe(main);
      observer.observe(rail.list);
    }
    schedule();
  }

  function drawer(sidebar) {
    var html = document.documentElement;
    var button = make('button', 'df-nav-toggle');
    var backdrop = make('div', 'df-nav-backdrop');
    var narrow = root.matchMedia ? root.matchMedia(DRAWER) : null;

    if (!sidebar.id) sidebar.id = 'df-sidebar';
    if (!sidebar.hasAttribute('tabindex')) sidebar.tabIndex = -1;
    button.type = 'button';
    button.innerHTML = MENU;
    button.setAttribute('aria-controls', sidebar.id);
    backdrop.setAttribute('aria-hidden', 'true');
    sidebar.parentNode.insertBefore(backdrop, sidebar.nextSibling);
    sidebar.parentNode.insertBefore(button, sidebar.nextSibling);
    html.classList.add('df-has-drawer');
    var opener = button;
    var component = DocForm._boot && DocForm._component;
    var changes = component && component.signal('navigation', null, snapshot, { action: 'drawer' });

    function isOpen() {
      return html.classList.contains('df-nav-open');
    }

    function snapshot() { return Object.freeze({ open: isOpen() }); }

    function setOpen(open, moveFocus, origin) {
      var previous = snapshot();
      var changed = open !== isOpen();
      html.classList.toggle('df-nav-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      if (moveFocus && changed) {
        if (open) sidebar.focus({ preventScroll: true });
        else opener.focus();
      }
      if (changed && changes) changes.emit(snapshot(), previous, origin);
      else if (changed && typeof root.CustomEvent === 'function') {
        document.dispatchEvent(new root.CustomEvent('df:drawer', { detail: { open: open } }));
      }
      return true;
    }

    // Another control, such as the control pill, can open the drawer and get focus back when it closes.
    function mutate(fn) { return component ? component.transaction(fn) : fn(); }
    function toggle(from, origin) {
      return mutate(function () {
        if (isOpen()) return setOpen(false, true, origin);
        opener = from || button;
        return setOpen(true, true, origin);
      });
    }
    function close(moveFocus, origin) {
      return mutate(function () { return setOpen(false, moveFocus, origin); });
    }

    setOpen(false, false, 'init');
    button.addEventListener('click', function () { toggle(button, 'user'); });
    backdrop.addEventListener('click', function () { close(true, 'user'); });
    DocForm.shortcuts.register({
      id: 'navigation.close-drawer', key: 'Escape', label: 'Close navigation drawer',
      scope: function () { return isOpen() && sidebar; },
      run: function () { close(true, 'user'); }
    });
    sidebar.addEventListener('click', function (event) {
      if (isOpen() && event.target.closest('a[href]')) close(false, 'user');
    });
    if (narrow) {
      narrow.addEventListener('change', function () {
        if (!narrow.matches && isOpen()) close(false, 'user');
      });
    }
    return {
      isOpen: isOpen,
      toggle: function (from) {
        var el = from == null || !component ? from : component.target(from, 'navigation', true);
        return from != null && !el ? false : toggle(el, 'api');
      },
      close: function () { return close(true, 'api'); },
      snapshot: snapshot,
      subscribe: changes && changes.subscribe,
      _toggleFromControl: function (from) { return toggle(from, 'user'); }
    };
  }

  function loadWidth() {
    try {
      var value = parseFloat(root.localStorage.getItem(WIDTH_KEY));
      return isFinite(value) ? value : null;
    } catch (e) {
      return null;
    }
  }

  function saveWidth(value) {
    try {
      if (value === null) root.localStorage.removeItem(WIDTH_KEY);
      else root.localStorage.setItem(WIDTH_KEY, String(value));
    } catch (e) {
      // Storage can be blocked; the width then lasts only for this page view.
    }
  }

  function setWidth(width) {
    var style = document.documentElement.style;
    if (width === null) style.removeProperty('--df-sidebar-width');
    else style.setProperty('--df-sidebar-width', width + 'px');
  }

  // Restores the saved width before the first layout, so the page does not jump when nav.js initializes.
  if (typeof document !== 'undefined' && document.documentElement) {
    var savedWidth = loadWidth();
    if (savedWidth !== null) setWidth(clampWidth(savedWidth, root.innerWidth));
  }

  // A handle on the sidebar's right edge: drag or use arrow keys to resize, double-click to reset.
  function resizer(sidebar) {
    var html = document.documentElement;
    var handle = make('div', 'df-nav-resize');
    handle.tabIndex = 0;
    handle.title = 'Drag to resize, double-click to reset';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize navigation');
    handle.setAttribute('aria-controls', sidebar.id);
    handle.setAttribute('aria-valuemin', String(WIDTH_MIN));
    sidebar.parentNode.insertBefore(handle, sidebar.nextSibling);

    function sync() {
      handle.setAttribute('aria-valuemax', String(clampWidth(Infinity, root.innerWidth)));
      handle.setAttribute('aria-valuenow', String(Math.round(sidebar.getBoundingClientRect().width)));
    }

    function apply(width) {
      var value = clampWidth(width, root.innerWidth);
      setWidth(value);
      sync();
      return value;
    }

    // Modules that lay out around the sidebar, such as margin notes and bubbles, relayout on resize.
    function settled() {
      if (typeof root.Event === 'function') root.dispatchEvent(new root.Event('resize'));
    }

    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      var startX = event.clientX;
      var startWidth = sidebar.getBoundingClientRect().width;
      var width = startWidth;
      handle.setPointerCapture(event.pointerId);
      html.classList.add('df-nav-resizing');

      function move(e) {
        width = apply(startWidth + e.clientX - startX);
      }

      function end() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        html.classList.remove('df-nav-resizing');
        saveWidth(width);
        settled();
      }

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });

    handle.addEventListener('keydown', function (event) {
      var width = sidebar.getBoundingClientRect().width;
      if (event.key === 'ArrowLeft') width -= WIDTH_STEP;
      else if (event.key === 'ArrowRight') width += WIDTH_STEP;
      else if (event.key === 'Home') width = WIDTH_MIN;
      else if (event.key === 'End') width = Infinity;
      else return;
      event.preventDefault();
      saveWidth(apply(width));
      settled();
    });

    handle.addEventListener('dblclick', function () {
      setWidth(null);
      saveWidth(null);
      sync();
      settled();
    });

    root.addEventListener('resize', function () {
      var saved = loadWidth();
      if (saved !== null) apply(saved);
      else sync();
    });
    sync();
  }

  DocForm.navigation = {
    slugify: slugify,
    uniqueSlug: uniqueSlug,
    pageKey: pageKey,
    findCurrent: findCurrent,
    pickActive: pickActive,
    sectionProgress: sectionProgress,
    outlineSections: outlineSections,
    clampWidth: clampWidth,
    headingUrl: headingUrl,
    drawer: null
  };

  DocForm.register('nav', function (site) {
    var main = document.querySelector('.df-page') || document.querySelector('main') || document.body;
    var anchorHeadings = collectHeadings(main);
    anchorHeadings.forEach(function (h) { linkHeading(h.el); });
    var sections = outlineSections(anchorHeadings);
    var hasTree = site.provided && site.pages.length > 0;
    var sidebar = document.querySelector('.df-sidebar');
    if (!hasTree && !sections.length && !sidebar) return;

    var index = findCurrent(site.order, DocForm.page);
    var links = Object.create(null);
    var outline = sections.length ? renderOutline(sections, '', links) : null;

    if (!sidebar) {
      sidebar = make('nav', 'df-sidebar');
      sidebar.setAttribute('aria-label', hasTree ? 'Site navigation' : 'Page outline');
      document.body.insertBefore(sidebar, document.body.firstChild);
    }
    var host = sidebar.querySelector('[data-df-nav]');
    if (!host) host = sidebar.appendChild(make('div'));
    host.classList.add('df-nav');
    host.textContent = '';

    if (hasTree) {
      if (site.title) {
        var first = site.order[0];
        var title = make(first ? 'a' : 'div', 'df-nav-title', site.title);
        if (first) title.href = first.href;
        host.appendChild(title);
      }
      var ctx = { current: site.order[index] || null, outline: outline, groups: 0, others: [] };
      var pages = renderPages(site.pages, ctx);
      host.appendChild(pages.list);
      // Waits for search.js, which may load after nav.js, to register its index API.
      setTimeout(function () { outlineOthers(ctx); }, 0);
      if (pages.found) outline = null;
    }
    if (outline) {
      host.appendChild(make('div', 'df-nav-heading', 'On this page'));
      host.appendChild(outline);
    }

    spy(anchorHeadings.filter(function (h) { return h.level < 3; }), links, sidebar, main);
    renderPager(main, site.order, index);
    DocForm.navigation.drawer = drawer(sidebar);
    resizer(sidebar);
  });
})(typeof window !== 'undefined' ? window : globalThis);
