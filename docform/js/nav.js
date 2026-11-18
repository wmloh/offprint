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
  var CARET_SMALL = SVG + ' width="10" height="10"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>';
  var MENU = SVG + ' width="18" height="18"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>';

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

  // An outline subsection list is open when the reader opened it by hand, or when its section is in view and the
  // reader has not closed it since that section came into view.
  function outlineOpen(ids, active, pinned, dismissed) {
    return ids.filter(function (id) {
      return pinned.has(id) || (id === active && id !== dismissed);
    });
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

  function renderOutline(nodes, links, groups) {
    var list = make('ul', 'df-outline');
    nodes.forEach(function (node) {
      var li = make('li', 'df-outline-item');
      var row = make('div', 'df-outline-row');
      var link = make('a', 'df-outline-link', node.item.text);
      link.href = '#' + encodeURIComponent(node.item.id);
      links[node.item.id] = link;
      row.appendChild(link);
      li.appendChild(row);
      if (node.children.length) {
        var sub = renderOutline(node.children, links, groups);
        var caret = make('button', 'df-outline-caret');
        caret.type = 'button';
        caret.innerHTML = CARET_SMALL;
        caret.setAttribute('aria-label', 'Toggle ' + node.item.text);
        sub.id = 'df-outline-' + node.item.id;
        caret.setAttribute('aria-controls', sub.id);
        row.appendChild(caret);
        li.appendChild(sub);
        groups[node.item.id] = { caret: caret, list: sub };
      }
      list.appendChild(li);
    });
    return list;
  }

  function setGroup(caret, list, open) {
    caret.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  }

  function collapser(groups) {
    var ids = Object.keys(groups);
    var pinned = new Set();
    var dismissed = null;
    var active = null;

    function apply() {
      var open = outlineOpen(ids, active, pinned, dismissed);
      ids.forEach(function (id) { setGroup(groups[id].caret, groups[id].list, open.indexOf(id) >= 0); });
    }

    ids.forEach(function (id) {
      groups[id].caret.addEventListener('click', function () {
        if (groups[id].list.hidden) {
          pinned.add(id);
          if (dismissed === id) dismissed = null;
        } else {
          pinned.delete(id);
          if (id === active) dismissed = id;
        }
        apply();
      });
    });
    apply();

    return {
      activate: function (id) {
        if (id === active) return;
        active = id;
        dismissed = null;
        apply();
      },
      openAll: function () {
        ids.forEach(function (id) { pinned.add(id); });
        apply();
      }
    };
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

  function spy(headings, links, sidebar, main, onActive) {
    if (!headings.length || typeof root.IntersectionObserver !== 'function') return false;
    var active = null;
    var pending = false;

    function update() {
      pending = false;
      var max = document.documentElement.scrollHeight - root.innerHeight;
      var index = pickActive(headings.map(function (h) { return h.el.getBoundingClientRect().top; }),
        root.innerHeight * SPY_LINE, max > 0 && root.scrollY >= max - 2);
      var link = index >= 0 ? links[headings[index].id] : null;
      onActive(index >= 0 ? headings[index].id : null);
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
    return true;
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
    var opener = button;

    function isOpen() {
      return html.classList.contains('df-nav-open');
    }

    function setOpen(open, moveFocus) {
      var changed = open !== isOpen();
      html.classList.toggle('df-nav-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      if (changed && typeof root.CustomEvent === 'function') {
        document.dispatchEvent(new root.CustomEvent('df:drawer', { detail: { open: open } }));
      }
      if (!moveFocus) return;
      if (open) sidebar.focus({ preventScroll: true });
      else opener.focus();
    }

    // Another control, such as the control pill, can open the drawer and get focus back when it closes.
    function toggle(from) {
      if (isOpen()) {
        setOpen(false, true);
      } else {
        opener = from || button;
        setOpen(true, true);
      }
    }

    setOpen(false, false);
    button.addEventListener('click', function () { toggle(button); });
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
    return { isOpen: isOpen, toggle: toggle, close: function () { setOpen(false, true); } };
  }

  DocForm.nav = {
    slugify: slugify,
    uniqueSlug: uniqueSlug,
    pageKey: pageKey,
    findCurrent: findCurrent,
    pickActive: pickActive,
    outlineTree: outlineTree,
    outlineOpen: outlineOpen,
    headingUrl: headingUrl,
    drawer: null
  };

  DocForm.register('nav', function (site) {
    var main = document.querySelector('.df-page') || document.querySelector('main') || document.body;
    var headings = collectHeadings(main);
    headings.forEach(function (h) { linkHeading(h.el); });
    var hasTree = site.provided && site.pages.length > 0;
    var sidebar = document.querySelector('.df-sidebar');
    if (!hasTree && !headings.length && !sidebar) return;

    var index = findCurrent(site.order, DocForm.page);
    var links = {};
    var groups = {};
    var parents = {};
    var tree = outlineTree(headings);
    tree.forEach(function (node) {
      node.children.forEach(function (child) { parents[child.item.id] = node.item.id; });
    });
    var outline = headings.length ? renderOutline(tree, links, groups) : null;
    var collapse = collapser(groups);

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
      var pages = renderPages(site.pages, { current: site.order[index] || null, outline: outline, groups: 0 });
      host.appendChild(pages.list);
      if (pages.found) outline = null;
    }
    if (outline) {
      host.appendChild(make('div', 'df-nav-heading', 'On this page'));
      host.appendChild(outline);
    }

    renderPager(main, site.order, index);
    var spying = spy(headings, links, sidebar, main, function (id) {
      collapse.activate(id === null ? null : parents[id] || id);
    });
    if (!spying) collapse.openAll();
    DocForm.nav.drawer = drawer(sidebar);
  });
})(typeof window !== 'undefined' ? window : globalThis);
