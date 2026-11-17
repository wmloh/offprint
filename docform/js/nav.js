(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] nav.js needs core.js loaded before it.');
    return;
  }

  var NARROW = '(max-width: 860px)';
  var SPY_LINE = 0.3;
  var SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  var CARET = SVG + ' width="12" height="12"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>';
  var MENU = SVG + ' width="18" height="18"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>';

  function slugify(text) {
    var slug = String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return slug || 'section';
  }

  function uniqueSlug(base, used) {
    var slug = base;
    for (var n = 2; used.has(slug); n++) slug = base + '-' + n;
    used.add(slug);
    return slug;
  }

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

  function outlineTree(items) {
    var tree = [];
    var parent = null;
    items.forEach(function (item) {
      var node = { item: item, children: [] };
      if (item.level === 3 && parent) {
        parent.children.push(node);
      } else {
        tree.push(node);
        if (item.level === 2) parent = node;
      }
    });
    return tree;
  }

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function collectHeadings(scope) {
    var used = new Set(DocForm.all('[id]').map(function (el) { return el.id; }));
    return DocForm.all('h2, h3', scope).filter(function (h) {
      return !h.closest('.df-sidebar, [data-df-no-outline]');
    }).map(function (h) {
      if (!h.id) h.id = uniqueSlug(slugify(h.textContent), used);
      return { level: h.tagName === 'H2' ? 2 : 3, id: h.id, text: h.textContent.trim(), el: h };
    });
  }

  function renderOutline(nodes, links) {
    var list = make('ul', 'df-outline');
    nodes.forEach(function (node) {
      var li = make('li', 'df-outline-item');
      var link = make('a', 'df-outline-link', node.item.text);
      link.href = '#' + encodeURIComponent(node.item.id);
      links[node.item.id] = link;
      li.appendChild(link);
      if (node.children.length) li.appendChild(renderOutline(node.children, links));
      list.appendChild(li);
    });
    return list;
  }

  function setGroup(caret, list, open) {
    caret.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  }

  function renderPages(pages, ctx) {
    var list = make('ul', 'df-nav-list');
    var found = false;
    pages.forEach(function (page) {
      var li = make('li', 'df-nav-item');
      var row = make('div', 'df-nav-row');
      var isCurrent = page === ctx.current;
      var sub = page.pages.length ? renderPages(page.pages, ctx) : null;
      var label;

      if (page.href) {
        label = make('a', 'df-nav-link', page.title);
        label.href = page.href;
        if (isCurrent) label.setAttribute('aria-current', 'page');
      } else {
        label = make(sub ? 'button' : 'span', 'df-nav-label', page.title);
        if (sub) label.type = 'button';
      }

      if (sub) {
        var caret = make('button', 'df-nav-caret');
        var groupList = sub.list;
        caret.type = 'button';
        caret.innerHTML = CARET;
        caret.setAttribute('aria-label', 'Toggle ' + page.title);
        groupList.id = 'df-nav-group-' + (++ctx.groups);
        caret.setAttribute('aria-controls', groupList.id);
        setGroup(caret, groupList, !page.collapsed || isCurrent || sub.found);
        var toggle = function () { setGroup(caret, groupList, groupList.hidden); };
        caret.addEventListener('click', toggle);
        if (!page.href) label.addEventListener('click', toggle);
        row.appendChild(caret);
      } else {
        row.appendChild(make('span', 'df-nav-caret-space'));
      }

      row.appendChild(label);
      li.appendChild(row);
      if (isCurrent && ctx.outline) li.appendChild(ctx.outline);
      if (sub) li.appendChild(sub.list);
      list.appendChild(li);
      found = found || isCurrent || sub && sub.found;
    });
    return { list: list, found: found };
  }

  function renderPager(main, order, index) {
    if (index < 0 || main.hasAttribute('data-df-no-pager')) return;
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

  function reveal(link, box) {
    if (box.scrollHeight <= box.clientHeight) return;
    var r = link.getBoundingClientRect();
    var b = box.getBoundingClientRect();
    var pad = 48;
    if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top;
    else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - b.bottom + pad;
  }

  function spy(headings, links, sidebar, main) {
    if (!headings.length || typeof root.IntersectionObserver !== 'function') return;
    var active = null;
    var pending = false;

    function update() {
      pending = false;
      var max = document.documentElement.scrollHeight - root.innerHeight;
      var index = pickActive(headings.map(function (h) { return h.el.getBoundingClientRect().top; }),
        root.innerHeight * SPY_LINE, max > 0 && root.scrollY >= max - 2);
      var link = index >= 0 ? links[headings[index].id] : null;
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

    var margin = '0px 0px -' + Math.round((1 - SPY_LINE) * 100) + '% 0px';
    var lineObserver = new IntersectionObserver(schedule, { rootMargin: margin });
    headings.forEach(function (h) { lineObserver.observe(h.el); });

    // Catches reaching the end of a page whose last headings never cross the spy line.
    var sentinel = make('div', 'df-outline-sentinel');
    sentinel.setAttribute('aria-hidden', 'true');
    main.appendChild(sentinel);
    new IntersectionObserver(schedule).observe(sentinel);
    schedule();
  }

  function drawer(sidebar) {
    var html = document.documentElement;
    var button = make('button', 'df-nav-toggle');
    var backdrop = make('div', 'df-nav-backdrop');
    var narrow = root.matchMedia ? root.matchMedia(NARROW) : null;

    if (!sidebar.id) sidebar.id = 'df-sidebar';
    if (!sidebar.hasAttribute('tabindex')) sidebar.tabIndex = -1;
    button.type = 'button';
    button.innerHTML = MENU;
    button.setAttribute('aria-controls', sidebar.id);
    backdrop.setAttribute('aria-hidden', 'true');
    sidebar.parentNode.insertBefore(backdrop, sidebar.nextSibling);
    sidebar.parentNode.insertBefore(button, sidebar.nextSibling);
    html.classList.add('df-has-drawer');

    function isOpen() {
      return html.classList.contains('df-nav-open');
    }

    function setOpen(open, moveFocus) {
      html.classList.toggle('df-nav-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      if (!moveFocus) return;
      if (open) sidebar.focus({ preventScroll: true });
      else button.focus();
    }

    setOpen(false, false);
    button.addEventListener('click', function () { setOpen(!isOpen(), true); });
    backdrop.addEventListener('click', function () { setOpen(false, true); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) setOpen(false, true);
    });
    sidebar.addEventListener('click', function (event) {
      if (isOpen() && event.target.closest('a[href]')) setOpen(false, false);
    });
    if (narrow) {
      narrow.addEventListener('change', function () {
        if (!narrow.matches && isOpen()) setOpen(false, false);
      });
    }
  }

  DocForm.nav = {
    slugify: slugify,
    uniqueSlug: uniqueSlug,
    pageKey: pageKey,
    findCurrent: findCurrent,
    pickActive: pickActive,
    outlineTree: outlineTree
  };

  DocForm.register('nav', function (site) {
    var main = document.querySelector('.df-page') || document.querySelector('main') || document.body;
    var headings = collectHeadings(main);
    var hasTree = site.provided && site.pages.length > 0;
    var sidebar = document.querySelector('.df-sidebar');
    if (!hasTree && !headings.length && !sidebar) return;

    var index = findCurrent(site.order, DocForm.page);
    var links = {};
    var outline = headings.length ? renderOutline(outlineTree(headings), links) : null;

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
      var tree = renderPages(site.pages, { current: site.order[index] || null, outline: outline, groups: 0 });
      host.appendChild(tree.list);
      if (tree.found) outline = null;
    }
    if (outline) {
      host.appendChild(make('div', 'df-nav-heading', 'On this page'));
      host.appendChild(outline);
    }

    renderPager(main, site.order, index);
    spy(headings, links, sidebar, main);
    drawer(sidebar);
  });
})(typeof window !== 'undefined' ? window : globalThis);
