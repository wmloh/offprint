(function (root) {
  'use strict';

  function assemble(markup, assets) {
    var sheets = new Map();

    function assetURL(reference) {
      var [id, suffix] = reference;
      var asset = assets[id];
      if (typeof asset === 'string') return asset + suffix;
      if (!sheets.has(id)) {
        var bytes = new TextEncoder().encode(expand(asset, true));
        var chunks = [];
        for (var offset = 0; offset < bytes.length; offset += 8192) {
          chunks.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 8192)));
        }
        sheets.set(id, 'data:text/css;charset=utf-8;base64,' + btoa(chunks.join('')));
      }
      return sheets.get(id) + suffix;
    }

    function expand(parts, css) {
      return parts.map(function (part) {
        if (typeof part === 'string') return part;
        var url = assetURL(part);
        if (!css) return url;
        return '"' + url.replace(/["\\\n\r\f]/g, function (character) {
          return '\\' + character.codePointAt(0).toString(16) + ' ';
        }) + '"';
      }).join('');
    }

    return markup.map(function (part) {
      if (typeof part === 'string') return part;
      var [css, value] = part;
      return expand(value, css).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
    }).join('');
  }

  function figureSteps(doc, saved, onChange) {
    var tracks = new Map();
    for (var node of doc.querySelectorAll('[data-df-reader-step-svg]')) {
      var [id, changes] = JSON.parse(node.getAttribute('data-df-reader-step-svg'));
      if (!tracks.has(id)) tracks.set(id, []);
      tracks.get(id).push([node, changes]);
    }
    var details = new Map();
    for (var node of doc.querySelectorAll('[data-df-reader-step-detail]')) {
      var [id, slot] = node.getAttribute('data-df-reader-step-detail').split(':').map(Number);
      if (!details.has(id)) details.set(id, new Map());
      details.get(id).set(slot, node);
    }
    var reveals = new Map();

    function mount(host) {
      var [id, initial, steps] = JSON.parse(host.getAttribute('data-df-reader-steps'));
      var drawing = tracks.get(id) || [];
      var notes = details.get(id) || new Map();
      if (!steps.length) return;
      var previous = doc.createElement('button');
      previous.type = 'button';
      previous.textContent = 'Previous';
      var next = doc.createElement('button');
      next.type = 'button';
      next.textContent = 'Next';
      var select = doc.createElement('select');
      select.setAttribute('aria-label', 'Figure step');
      steps.forEach(function ([key, label]) {
        var option = doc.createElement('option');
        option.value = key;
        option.textContent = label;
        select.append(option);
      });
      var caption = doc.createElement('p');
      caption.className = 'df-anim-caption';
      caption.setAttribute('aria-live', 'polite');
      var index;

      function choose(at) {
        if (at < 0 || at >= steps.length || at === index) return;
        onChange?.();
        index = at;
        var [key, , slots, text] = steps[at];
        saved.set(id, at);
        select.value = key;
        previous.setAttribute('aria-disabled', String(at === 0));
        next.setAttribute('aria-disabled', String(at === steps.length - 1));
        caption.textContent = text;
        caption.hidden = !text;
        var selected = new Set(slots);
        notes.forEach(function (node, slot) { node.hidden = !selected.has(slot); });
        drawing.forEach(function ([node, changes]) {
          var state = new Map();
          for (var [step, prop, value] of changes) {
            if (step <= at) state.set(prop, value);
          }
          state.forEach(function (value, prop) {
            if (prop.startsWith('.')) node.style.setProperty(prop.slice(1), value);
            else node.setAttribute(prop, value);
          });
        });
      }

      notes.forEach(function (node, slot) {
        reveals.set(node, function () {
          if (node.hidden) choose(steps.findIndex(function (step) { return step[2].includes(slot); }));
        });
      });
      var group = doc.createElement('div');
      group.className = 'df-reader-step-controls';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Figure steps');
      group.append(previous, select, next);
      previous.addEventListener('click', function () { choose(index - 1); });
      next.addEventListener('click', function () { choose(index + 1); });
      select.addEventListener('change', function () { choose(select.selectedIndex); });
      host.replaceChildren(group, caption);
      choose(saved.get(id) ?? initial);
    }

    doc.querySelectorAll('[data-df-reader-steps]').forEach(mount);
    return function reveal(target) {
      var ancestors = [];
      for (var node = target; node; node = node.parentElement) {
        if (reveals.has(node)) ancestors.push(node);
      }
      ancestors.reverse().forEach(function (node) { reveals.get(node)(); });
    };
  }

  function headings(doc) {
    var main = doc.querySelector('.df-page') || doc.querySelector('main') || doc.body;
    return Array.from(main.querySelectorAll('h1,h2,h3')).filter(function (heading) {
      return !heading.closest('[data-df-no-outline=""],[data-df-no-outline="true"],[data-df-snapshot-tips]');
    });
  }

  function controls(host, headings, tips, navigate) {
    var html = document.documentElement;
    var pill = document.querySelector('#export-pill');
    var pager = document.querySelector('#export-pager');
    var sidebar = document.querySelector('#export-sidebar');
    var toc = document.querySelector('#export-contents');
    var close = document.querySelector('#export-close');
    var separator = document.querySelector('#export-resize');
    var edge = document.querySelector('#export-edge');
    var shade = document.querySelector('#export-shade');
    var compact = matchMedia('(max-width: 859px), (hover: none)');
    var mode = 'shown';
    var drawer = false;
    var peek = false;
    var width = 260;
    var focused = false;
    var theme;
    var view;
    var remote;
    var sections = [];
    var blocks = [];
    var outline;
    var updateID = 0;
    var currentSection;
    var jumpOrigin;

    function make(tag, text) {
      var node = document.createElement(tag);
      if (text) node.textContent = text;
      return node;
    }

    var bank = make('div');
    bank.hidden = true;
    bank.setAttribute('data-df-snapshot-tips', '');
    document.body.append(bank);
    function hint(node, id, label, key) {
      var card = make('div');
      card.id = 'export-hint-' + id;
      card.className = 'df-tooltip';
      card.setAttribute('role', 'tooltip');
      bank.append(card);
      node.setAttribute('data-df-snapshot-tip', card.id);
      if (key) node.setAttribute('aria-keyshortcuts', key);
      function name(text) {
        node.setAttribute('aria-label', text);
        card.textContent = text + (key ? ' (' + key + ')' : '');
      }
      name(label);
      return name;
    }

    function icon(node, drawing) {
      node.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + drawing + '</svg>';
    }

    function button(id, label, key, drawing, action) {
      var el = make('button');
      el.type = 'button';
      icon(el, drawing);
      var name = hint(el, id, label, key);
      el.addEventListener('click', action);
      pill.append(el);
      return [el, name];
    }

    var [navButton, navName] = button('nav', 'Navigation', 'N', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/>', toggleNav);
    navButton.setAttribute('aria-controls', sidebar.id);
    var [focusButton] = button('focus', 'Focus mode', 'F', '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/><circle cx="12" cy="12" r="2"/>', toggleFocus);
    focusButton.setAttribute('aria-pressed', 'false');
    var [themeButton, themeName] = button('theme', 'Switch theme', 'T', '<path d="M20 15a8 8 0 0 1-11-11 8.5 8.5 0 1 0 11 11Z"/>', toggleTheme);
    var [backHeading] = button('back-heading', 'Previous heading', 'K', '<path d="m6 14 6-6 6 6"/>', function () { jump(-1); });
    var [nextHeading] = button('next-heading', 'Next heading', 'J', '<path d="m6 10 6 6 6-6"/>', function () { jump(1); });
    var progress = make('span');
    progress.className = 'export-progress';
    progress.tabIndex = 0;
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuenow', '0');
    icon(progress, '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9" pathLength="100" stroke-dasharray="0 100"/>');
    var ring = progress.querySelector('circle:last-child');
    hint(progress, 'progress', 'Reading progress');
    pill.append(progress);

    var pageLinks = Array.from(pager.querySelectorAll('a'), function (link, index) {
      icon(link, index ? '<path d="m10 6 6 6-6 6"/>' : '<path d="m14 6-6 6 6 6"/>');
      return [link, hint(link, link.id, index ? 'Next page' : 'Previous page')];
    });
    var progressHint = document.getElementById('export-hint-progress');
    var hideTip = tips(document);

    function layout() {
      var mobile = compact.matches;
      var shown = mobile ? drawer : mode === 'shown' || (mode === 'auto' && peek);
      var modal = mobile && drawer;
      sidebar.hidden = !shown;
      close.hidden = shade.hidden = !modal;
      host.inert = pill.inert = pager.inert = modal;
      html.toggleAttribute('data-drawer', modal);
      if (modal) {
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-label', 'Navigation');
        sidebar.setAttribute('aria-modal', 'true');
      } else {
        for (var attr of ['role', 'aria-label', 'aria-modal']) sidebar.removeAttribute(attr);
      }
      separator.hidden = mobile || !shown;
      edge.hidden = mobile || mode !== 'auto' || shown;
      html.style.setProperty('--nav-slot', !mobile && shown ? 'var(--nav-width)' : '0px');
      navButton.setAttribute('aria-expanded', String(shown));
      navName(mobile ? 'Open navigation' : 'Navigation · ' + (mode === 'auto' ? 'auto-hide' : mode));
      schedule();
    }

    function closeDrawer(restoreFocus) {
      if (!drawer) return;
      drawer = false;
      layout();
      if (restoreFocus) navButton.focus();
    }

    function toggleNav() {
      hideTip?.();
      if (compact.matches) {
        drawer = true;
        layout();
        close.focus();
      } else {
        var returnFocus = sidebar.contains(document.activeElement) || document.activeElement === separator;
        mode = { shown: 'hidden', hidden: 'auto', auto: 'shown' }[mode];
        peek = false;
        layout();
        if (returnFocus && sidebar.hidden) navButton.focus();
      }
    }

    function setWidth(value) {
      var max = Math.min(480, Math.round(innerWidth * .4));
      width = Math.max(200, Math.min(value, max));
      html.style.setProperty('--nav-width', width + 'px');
      separator.setAttribute('aria-valuemin', '200');
      separator.setAttribute('aria-valuemax', String(max));
      separator.setAttribute('aria-valuenow', String(width));
    }

    function stopPeeking() {
      if (!peek || sidebar.contains(document.activeElement) || document.activeElement === separator ||
          sidebar.matches(':hover') || separator.matches(':hover')) return;
      peek = false;
      layout();
    }

    edge.addEventListener('pointerenter', function () { peek = true; layout(); });
    navButton.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' || compact.matches || mode === 'hidden') return;
      event.preventDefault();
      if (mode === 'auto') { peek = true; layout(); }
      (toc.querySelector('[aria-current="page"]') || toc.querySelector('a'))?.focus();
    });
    for (var el of [sidebar, separator]) {
      el.addEventListener('pointerleave', function () { requestAnimationFrame(stopPeeking); });
      el.addEventListener('focusout', function () { requestAnimationFrame(stopPeeking); });
    }
    separator.addEventListener('pointerdown', function (event) {
      separator.setPointerCapture(event.pointerId);
    });
    separator.addEventListener('pointermove', function (event) {
      if (separator.hasPointerCapture(event.pointerId)) setWidth(event.clientX);
    });
    separator.addEventListener('lostpointercapture', stopPeeking);
    separator.addEventListener('dblclick', function () { setWidth(260); });
    separator.addEventListener('keydown', function (event) {
      var values = { ArrowLeft: width - 16, ArrowRight: width + 16, Home: 200, End: 480 };
      if (!Object.hasOwn(values, event.key)) return;
      event.preventDefault();
      setWidth(values[event.key]);
    });
    compact.addEventListener('change', function () {
      var restore = sidebar.contains(document.activeElement) || document.activeElement === separator;
      var closeFocused = document.activeElement === close;
      drawer = peek = false;
      layout();
      if (closeFocused || restore && (sidebar.hidden || document.activeElement === separator)) navButton.focus();
    });
    window.addEventListener('resize', function () { if (!compact.matches) setWidth(width); });
    close.addEventListener('click', function () { closeDrawer(true); });
    shade.addEventListener('click', function () { closeDrawer(true); });

    function applyTheme() {
      html.setAttribute('data-df-theme', theme);
      view?.document.documentElement.setAttribute('data-df-theme', theme);
      remote?.send({ type: 'theme', value: theme });
      themeName(theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      icon(themeButton, theme === 'dark' ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2"/>' :
        '<path d="M20 15a8 8 0 0 1-11-11 8.5 8.5 0 1 0 11 11Z"/>');
    }

    function toggleTheme() {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme();
    }

    function toggleFocus() {
      if (focusButton.hidden) return;
      focused = !focused;
      focusButton.setAttribute('aria-pressed', String(focused));
      remote?.send({ type: 'focus', value: focused });
      update();
    }

    function visible(section) {
      return section.node.getClientRects().length > 0;
    }

    function update() {
      if (!view) return;
      var scroller = view.document.scrollingElement;
      var height = scroller.clientHeight;
      var max = scroller.scrollHeight - height;
      var bottom = max > 0 && scroller.scrollTop >= max - 2;
      var percent = max > 0 ? Math.round(100 * Math.max(0, Math.min(1, scroller.scrollTop / max))) : 100;
      progress.setAttribute('aria-valuenow', String(percent));
      ring.setAttribute('stroke-dasharray', percent + ' 100');
      progressHint.textContent = 'Reading progress · ' + percent + '%';
      var sectionAtTop;
      var sectionAtCentre;
      var lastVisible;
      sections.forEach(function (section) {
        var shown = visible(section);
        section.item.hidden = !shown;
        if (!shown) return;
        var top = section.node.getBoundingClientRect().top;
        if (top <= height * .25) sectionAtTop = section;
        if (top <= height * .5) sectionAtCentre = section;
        lastVisible = section;
      });
      if (bottom) sectionAtTop = sectionAtCentre = lastVisible;
      if (currentSection !== sectionAtTop) {
        currentSection?.link.removeAttribute('aria-current');
        currentSection = sectionAtTop;
        currentSection?.link.setAttribute('aria-current', 'location');
      }
      var index = sections.indexOf(sectionAtCentre);
      blocks.forEach(function (block) {
        var dim = false;
        if (focused && !block.title && (index < block.first || index > block.last)) {
          var rect = block.node.getBoundingClientRect();
          dim = rect.bottom <= height * .2 || rect.top >= height * .8;
        }
        block.node.classList.toggle('df-reader-dim', dim);
      });
    }

    function schedule() {
      if (updateID) return;
      updateID = requestAnimationFrame(function () { updateID = 0; update(); });
    }

    function updateRemote(message) {
      if (remote.anchor && remote.readings?.some(function (top, index) {
        return top !== null && message.readings[index] !== null && top !== message.readings[index];
      })) remote.anchor = null;
      remote.readings = message.readings;
      var at = -1;
      sections.forEach(function (section, index) {
        var top = message.readings[index];
        section.item.hidden = top === null;
        if (top !== null && (message.bottom || top <= message.height * .25)) at = index;
      });
      currentSection?.link.removeAttribute('aria-current');
      currentSection = sections[at];
      currentSection?.link.setAttribute('aria-current', 'location');
      var percent = Math.max(0, Math.min(100, message.percent));
      progress.setAttribute('aria-valuenow', String(percent));
      ring.setAttribute('stroke-dasharray', percent + ' 100');
      progressHint.textContent = 'Reading progress · ' + percent + '%';
    }

    function addSection(id, label, level, page) {
      var item = make('li');
      var link = make('a', label || id);
      link.href = '#' + page + '/' + encodeURIComponent(id);
      link.dataset.level = level;
      link.setAttribute('data-export-destination', '');
      item.append(link);
      outline?.append(item);
      return { item: item, link: link };
    }

    function jump(direction) {
      if (remote) {
        var readings = remote.readings || [];
        var anchored = sections.findIndex(function (section) { return section.link.hash === remote.anchor; });
        var at = direction > 0 ? readings.findIndex(function (top, index) {
          return top !== null && (anchored >= 0 ? index > anchored : top > 4);
        }) : readings.findLastIndex(function (top, index) {
          return top !== null && (anchored >= 0 ? index < anchored : top < -4);
        });
        if (at >= 0) navigate(sections[at].link.hash);
        return;
      }
      if (!view) return;
      var candidates = sections.filter(visible);
      var anchored = jumpOrigin?.top === view.scrollY ? candidates.findIndex(function (section) {
        return section.link.hash === jumpOrigin.hash;
      }) : -1;
      var target;
      if (anchored >= 0) target = candidates[anchored + direction];
      else {
        if (direction < 0) candidates.reverse();
        target = candidates.find(function (section) {
          var margin = parseFloat(view.getComputedStyle(section.node).scrollMarginTop) || 0;
          return direction * (section.node.getBoundingClientRect().top - margin) > 4;
        });
      }
      if (target) navigate(target.link.hash);
    }

    function keys(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      var key = event.key.toLowerCase();
      if (drawer) {
        if (key === 'escape' || key === 'n') {
          event.preventDefault();
          closeDrawer(true);
        }
        return;
      }
      if (key === 'escape' && peek) {
        if (sidebar.contains(document.activeElement) || document.activeElement === separator) navButton.focus();
        peek = false;
        layout();
        return;
      }
      if (event.target.closest?.('input,select,textarea,[contenteditable]')) return;
      var action = { n: toggleNav, f: toggleFocus, t: toggleTheme,
        j: function () { jump(1); }, k: function () { jump(-1); } }[key];
      if (typeof action !== 'function' || key.length !== 1) return;
      event.preventDefault();
      if (!event.repeat) action();
    }

    document.addEventListener('keydown', keys);
    sidebar.addEventListener('keydown', function (event) {
      if (!drawer || event.key !== 'Tab') return;
      var last = Array.from(toc.querySelectorAll('a')).findLast(function (link) { return link.getClientRects().length; });
      if (event.shiftKey ? event.target === close : event.target === last) {
        event.preventDefault();
        (event.shiftKey ? last : close)?.focus();
      }
    });
    var observer = new ResizeObserver(schedule);
    setWidth(width);
    layout();

    return {
      follow: function (restoreFocus) { hideTip?.(); closeDrawer(restoreFocus); },
      page: function (page, adjacent) {
        view = remote = null;
        observer.disconnect();
        jumpOrigin = null;
        currentSection = null;
        outline?.remove();
        for (var control of [focusButton, backHeading, nextHeading]) control.hidden = true;
        progress.setAttribute('aria-valuenow', '0');
        ring.setAttribute('stroke-dasharray', '0 100');
        progressHint.textContent = 'Reading progress · 0%';
        toc.querySelectorAll('a').forEach(function (link) {
          if (link.hash === '#' + page) {
            link.setAttribute('aria-current', 'page');
            outline = make('ul');
            outline.className = 'export-outline';
            link.after(outline);
          } else link.removeAttribute('aria-current');
        });
        pageLinks.forEach(function ([link, name], index) {
          var record = adjacent[index];
          link.hidden = !record;
          if (record) {
            link.href = '#' + record.id;
            name((index ? 'Next: ' : 'Previous: ') + record.title);
          }
        });
        pager.hidden = adjacent.every(function (record) { return !record; });
      },
      mount: function (doc, page) {
        view = doc.defaultView;
        theme ??= doc.documentElement.getAttribute('data-df-theme') === 'dark' ||
          (doc.documentElement.getAttribute('data-df-theme') !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        applyTheme();
        sections = headings(doc).filter(function (node) { return node.id; }).map(function (node) {
          return { ...addSection(node.id, node.textContent.trim().replace(/\s+/g, ' '), node.localName[1], page), node: node };
        });
        if (!sections.length) outline?.remove();
        for (var control of [focusButton, backHeading, nextHeading]) control.hidden = !sections.length;
        var main = doc.querySelector('.df-page') || doc.querySelector('main') || doc.body;
        var last = -1;
        blocks = Array.from(main.children).filter(function (node) { return !node.matches('[data-df-snapshot-tips],.df-export-pop'); })
          .map(function (node) {
            var first;
            sections.forEach(function (section, index) {
              if (node.contains(section.node)) { first ??= index; last = index; }
            });
            return { node: node, first: first ?? last, last: last, title: node.matches('h1,header') || !!node.querySelector('h1') };
          });
        doc.addEventListener('keydown', keys);
        view.addEventListener('scroll', schedule, { passive: true });
        view.addEventListener('resize', schedule);
        observer.observe(main);
        schedule();
      },
      mountRemote: function (data, page, send) {
        remote = { send: send };
        theme ??= data.theme === 'dark' ||
          (data.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        applyTheme();
        send({ type: 'focus', value: focused });
        sections = data.headings.map(function ([id, label, level]) { return addSection(id, label, level, page); });
        if (!sections.length) outline?.remove();
        for (var control of [focusButton, backHeading, nextHeading]) control.hidden = !sections.length;
      },
      remoteProgress: function (message) { updateRemote(message); },
      remoteKey: function (key) {
        if (drawer) {
          if (key === 'n') closeDrawer(true);
          return;
        }
        ({ n: toggleNav, f: toggleFocus, t: toggleTheme,
          j: function () { jump(1); }, k: function () { jump(-1); } })[key]();
      },
      scrolled: function (hash) {
        if (remote) { remote.anchor = hash; return; }
        jumpOrigin = { hash: hash, top: view.scrollY };
        schedule();
      },
      update: schedule
    };
  }

  async function startInteractive(doc, payload, shared, nonce, saved, signal) {
    var view = doc.defaultView;
    var paths = new Map(payload.modules);
    var author = payload.author;
    var authorPhase = !!author;
    function failedAuthor(event) {
      if (authorPhase) authorFailure ||= event.type === 'error' ? 'An author script failed.' : 'An author script rejected a promise.';
    }
    var authorFailure;
    if (author) {
      view.addEventListener('error', failedAuthor);
      view.addEventListener('unhandledrejection', failedAuthor);
      signal.addEventListener('abort', function () {
        view.removeEventListener('error', failedAuthor);
        view.removeEventListener('unhandledrejection', failedAuthor);
      }, { once: true });
      var files = new Map(author.files.map(function ([url, kind, value]) {
        return [url, [kind, kind === 'text' ? shared[value] : value]];
      }));
      function readFile(path, kind) {
        var file = files.get(new URL(path, payload.base).href);
        if (file?.[0] !== kind) throw Error('The author file is unavailable: ' + path);
        return file[1];
      }
      view.DocFormExportFiles = Object.freeze({
        text: function (path) { return readFile(path, 'text'); },
        url: function (path) { return readFile(path, 'url'); }
      });
    }
    var styles = new Set(payload.styles);
    var data = new Map(payload.data);
    var library = new URL('.', payload.entryURL).href;
    if (payload.inlineData?.length) {
      for (var definition of doc.querySelectorAll('[data-df-export-data]')) {
        var text = shared[payload.inlineData[Number(definition.getAttribute('data-df-export-data'))]];
        if (typeof text !== 'string') throw Error('An authored dataset could not be restored.');
        definition.textContent = text;
        definition.removeAttribute('data-df-export-data');
      }
    }

    function execute(path, entry) {
      signal.throwIfAborted();
      return executeCode(paths.get(path), entry);
    }

    function executeCode(index, entry) {
      var code = shared[index];
      if (typeof code !== 'string') return false;
      var script = doc.createElement('script');
      if (entry && payload.profile !== null) script.setAttribute('data-df-profile', payload.profile);
      var failed = false;
      function scriptError(event) { if (event instanceof view.ErrorEvent || !author) failed = true; }
      if (author) {
        return new Promise(function (resolve) {
          var url = view.URL.createObjectURL(new view.Blob([code], { type: 'text/javascript' }));
          function finish(ok) {
            view.removeEventListener('error', scriptError);
            signal.removeEventListener('abort', abort);
            script.remove();
            view.URL.revokeObjectURL(url);
            resolve(ok && !failed);
          }
          function abort() { finish(false); }
          signal.addEventListener('abort', abort, { once: true });
          view.addEventListener('error', scriptError);
          script.addEventListener('load', function () { finish(true); }, { once: true });
          script.addEventListener('error', abort, { once: true });
          script.src = url;
          doc.head.append(script);
        });
      }
      script.nonce = nonce;
      script.textContent = code;
      view.addEventListener('error', scriptError);
      try { doc.head.append(script); }
      finally {
        view.removeEventListener('error', scriptError);
        script.remove();
      }
      return !failed;
    }

    var release;
    var authored = author && new Promise(function (resolve) { release = resolve; });
    if (payload.site !== null) view.DocFormSite = structuredClone(shared[payload.site]);
    view.DocFormExportContext = {
      interactive: true, entryURL: payload.entryURL, pageURL: payload.url, siteURL: payload.siteURL,
      freshView: !saved,
      combinedStyles: payload.combined, features: payload.features, identities: payload.identities,
      hasData: function (name) { return data.has(name); },
      loadModule: function (url, css) {
        var path = url.startsWith(library) && url.slice(library.length);
        if (author) return authored.then(function (ok) { return ok && (css ? styles.has(path) : execute(path)); });
        return css ? styles.has(path) : execute(path);
      },
      loadAsset: function (kind, url, name) {
        signal.throwIfAborted();
        if (kind !== 'data' || !data.has(name)) return false;
        (view.DocFormData ||= Object.create(null))[name] = structuredClone(shared[data.get(name)]);
        return true;
      }
    };
    async function runAuthors(scripts) {
      for (var [name, index] of scripts) {
        signal.throwIfAborted();
        if (!await executeCode(index)) throw Error('Author script failed: ' + name);
      }
    }
    if (author) {
      try {
        await runAuthors(author.before);
        if (!await execute('docform.js', true) || !view.DocForm?.ready) throw Error('DocForm could not start.');
        await runAuthors(author.after);
        doc.dispatchEvent(new view.Event('DOMContentLoaded', { bubbles: true }));
        release(true);
      } catch (error) {
        release(false);
        throw error;
      }
    } else if (!execute('docform.js', true) || !view.DocForm?.ready) {
      throw Error('DocForm could not start.');
    }
    var runtime = await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { finish(Error('DocForm startup timed out.')); }, 8000);
      function abort() { finish(signal.reason); }
      function finish(error, runtime) {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(runtime);
      }
      signal.addEventListener('abort', abort, { once: true });
      view.DocForm.ready(function (runtime) { finish(null, runtime); });
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    if (author) {
      authorPhase = false;
      var issue = runtime.diagnostics.list().find(function (issue) { return ['setup-failed', 'ready-failed'].includes(issue.code); });
      if (authorFailure || issue) throw Error(authorFailure || issue.message);
    }
    if (!runtime._site || !runtime._readerState ||
        payload.features.some(function (feature) { return !runtime._boot.enabled(feature); }) ||
        runtime.diagnostics.list().some(function (issue) {
          return ['asset', 'data-wrapper', 'feature-init'].includes(issue.code);
        })) {
      throw Error('A required DocForm feature could not initialize.');
    }
    var chartDataIssue = runtime.diagnostics.list().find(function (issue) {
      return issue.code === 'data-input' && issue.feature === 'chart';
    });
    if (chartDataIssue) throw Error('A chart could not load its data. ' + chartDataIssue.message);
    var state = saved?.record ? saved : { record: saved, status: 'saved',
      payloads: new Map((payload.imports || []).map(function ([key, index]) { return [key, shared[index]]; })) };
    if (state.record) {
      var result = runtime._readerState.replay(state);
      if (result.status === 'stale' || result.issues.length) throw Error('The committed view could not be restored.');
    }
    if (runtime._zoom) signal.addEventListener('abort', runtime._zoom.dispose, { once: true });
    return runtime._readerState;
  }

  function authorFrame(session, startInteractive, headings) {
    // Keep the bootstrap nonce out of the DOM seen by any later script.
    document.currentScript.remove();
    document.querySelector('meta[http-equiv="Content-Security-Policy"]').remove();
    var channel = new MessageChannel();
    var port = channel.port1;
    var send = port.postMessage.bind(port);
    var controller = new AbortController();
    var state;
    var sections;
    var focus = false;
    var mount;

    function inspect() {
      var scroller = document.scrollingElement;
      var height = scroller.clientHeight;
      var max = scroller.scrollHeight - height;
      var readings = sections.map(function (node) {
        return node.getClientRects().length ? node.getBoundingClientRect().top : null;
      });
      var at = readings.findLastIndex(function (top) { return top !== null && top <= height * .5; });
      if (max > 0 && scroller.scrollTop >= max - 2) at = readings.findLastIndex(function (top) { return top !== null; });
      for (var [node, first, last] of mount) {
        var rect = node.getBoundingClientRect();
        node.classList.toggle('df-reader-dim', focus && (at < first || at > last) &&
          (rect.bottom <= height * .2 || rect.top >= height * .8));
      }
      send({ type: 'progress', readings: readings, height: height,
        percent: max > 0 ? Math.round(100 * scroller.scrollTop / max) : 100,
        bottom: max > 0 && scroller.scrollTop >= max - 2 });
    }

    function scroll(fragment, takeFocus) {
      var target = fragment && (document.getElementById(fragment) ||
        Array.from(document.getElementsByName(fragment)).find(function (node) { return node.localName === 'a'; }));
      if (target) target.scrollIntoView({ behavior: 'instant' });
      else scrollTo({ left: 0, top: 0, behavior: 'instant' });
      if (takeFocus) {
        target ||= document.body;
        if (!target.hasAttribute('tabindex') && target.tabIndex < 0) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
      inspect();
    }

    async function init(data) {
      state = await startInteractive(document, data.payload, data.shared, null, data.saved, controller.signal);
      var main = document.querySelector('.df-page') || document.querySelector('main') || document.body;
      sections = headings(document).filter(function (node) { return node.id; });
      var last = -1;
      mount = Array.from(main.children).filter(function (node) { return !node.matches('h1,header') && !node.querySelector('h1'); })
        .map(function (node) {
          var first;
          sections.forEach(function (section, index) {
            if (node.contains(section)) { first ??= index; last = index; }
          });
          return [node, first ?? last, last];
        });
      send({ type: 'ready', headings: sections.map(function (node) {
        return [node.id, node.textContent.trim().replace(/\s+/g, ' '), Number(node.localName[1])];
      }), theme: document.documentElement.getAttribute('data-df-theme') });
      var raf;
      function schedule() {
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; inspect(); });
      }
      var observer = new ResizeObserver(schedule);
      observer.observe(main);
      addEventListener('scroll', schedule, { passive: true });
      addEventListener('resize', schedule);
      document.addEventListener('click', function (event) {
        var link = event.target.closest?.('a[href],area[href]');
        if (!link || event.defaultPrevented) return;
        event.preventDefault();
        var href = link.getAttribute('data-export-destination') || link.getAttribute('href');
        if (href) send({ type: 'link', href: href });
      });
      document.addEventListener('keydown', function (event) {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
            event.target.closest?.('input,select,textarea,[contenteditable]')) return;
        var key = event.key.toLowerCase();
        if (!['n', 'f', 't', 'j', 'k'].includes(key)) return;
        event.preventDefault();
        if (!event.repeat) send({ type: 'key', key: key });
      });
      addEventListener('error', function (event) {
        if (event instanceof ErrorEvent) send({ type: 'failure', reason: 'A page script failed.' });
      });
      addEventListener('unhandledrejection', function () {
        send({ type: 'failure', reason: 'A page script rejected a promise.' });
      });
      inspect();
    }

    port.onmessage = async function (event) {
      var data = event.data;
      try {
        switch (data.type) {
          case 'init': await init(data); break;
          case 'theme': document.documentElement.setAttribute('data-df-theme', data.value); break;
          case 'focus': focus = data.value; inspect(); break;
          case 'scroll': scroll(data.fragment, data.focus); break;
          case 'capture': send({ type: 'state', value: state.capture() }); break;
        }
      } catch (error) {
        send({ type: 'failure', reason: String(error?.message || error).slice(0, 300) });
      }
    };
    addEventListener('pagehide', function () { controller.abort(); port.close(); }, { once: true });
    parent.postMessage({ type: 'docform-author-connect', session: session }, '*', [channel.port2]);
  }

  function reader(assemble, figureSteps, headings, controls, startInteractive, fileKey, authorFrame) {
    var bundle = JSON.parse(document.querySelector('#export-bundle').textContent);
    document.querySelector('#export-bundle').remove();
    var pages = new Map(bundle.pages.map(function (page) { return [page.id, page]; }));
    var host = document.querySelector('#export-page');
    var frame;
    var active;
    var ready = false;
    var focusHash;
    var hideTip = null;
    var revealStep = null;
    var pageSteps = new Map();
    var interactive = bundle.mode === 'interactive';
    var status = interactive && document.querySelector('#export-status');
    var committed = new Map();
    var sourcePages = new Map(interactive && fileKey ? bundle.pages.map(function (page) {
      return [fileKey(new URL(page.url), true), page.id];
    }) : []);
    var running, pageState, isolated;
    var chrome = controls(host, headings, tips, navigate);

    function destination() {
      var [page, fragment] = location.hash.slice(1).split('/');
      if (!pages.has(page)) page = host.dataset.initial;
      try { fragment = decodeURIComponent(fragment || ''); } catch (error) { fragment = ''; }
      return [page, fragment];
    }

    function scroll(fragment) {
      if (!ready) return;
      var focus = focusHash === location.hash;
      if (isolated) {
        isolated.send({ type: 'scroll', fragment: fragment, focus: focus });
        focusHash = null;
        chrome.scrolled(location.hash);
        return;
      }
      var doc = frame.contentDocument;
      var heading = fragment && (doc.getElementById(fragment) ||
        Array.from(doc.getElementsByName(fragment)).find(function (node) { return node.localName === 'a'; }));
      if (heading) {
        revealStep?.(heading);
        heading.scrollIntoView({ behavior: 'instant' });
        if (focus) {
          if (!heading.hasAttribute('tabindex') && heading.tabIndex < 0) heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      } else {
        frame.contentWindow.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        if (focus) {
          doc.body.tabIndex = -1;
          doc.body.focus({ preventScroll: true });
        }
      }
      focusHash = null;
      chrome.scrolled(location.hash);
    }

    // Shows an anchor's captured tooltip cards beside it on hover, keyboard focus, or tap, like the live page.
    function tips(doc) {
      var bank = doc.querySelector('[data-df-snapshot-tips]');
      if (!bank) return null;
      var view = doc.defaultView;
      var pop = doc.createElement('div');
      pop.className = 'df-export-pop';
      pop.hidden = true;
      doc.body.append(pop);
      var active = null;
      var timer = 0;
      var touched = false;

      function place() {
        var rects = active.getClientRects();
        var rect = rects.length ? rects[0] : active.getBoundingClientRect();
        var width = doc.documentElement.clientWidth;
        var height = view.innerHeight;
        var below = rect.bottom + 8;
        var above = rect.top - 8 - pop.offsetHeight;
        var top = below + pop.offsetHeight <= height - 8 || above < 8 ? below : above;
        var left = rect.left + rect.width / 2 - pop.offsetWidth / 2;
        pop.style.top = Math.round(top) + 'px';
        pop.style.left = Math.round(Math.max(8, Math.min(left, width - 8 - pop.offsetWidth))) + 'px';
      }

      function show(anchor, cards) {
        clearTimeout(timer);
        if (active === anchor) return;
        hide();
        active = anchor;
        pop.append(...cards);
        pop.classList.toggle('is-wide', cards.some(function (card) { return card.querySelector('.df-tooltip-more'); }));
        pop.hidden = false;
        place();
      }

      function hide() {
        clearTimeout(timer);
        if (!active) return;
        active = null;
        pop.hidden = true;
        bank.append(...pop.children);
      }

      function later(fn) {
        clearTimeout(timer);
        timer = setTimeout(fn, 120);
      }

      doc.querySelectorAll('[data-df-snapshot-tip]').forEach(function (anchor) {
        var ids = anchor.getAttribute('data-df-snapshot-tip');
        var cards = ids.split(/\s+/)
          .map(function (id) { return doc.getElementById(id); })
          .filter(function (node) { return node && bank.contains(node); });
        if (!cards.length) return;
        if (!anchor.hasAttribute('aria-describedby')) anchor.setAttribute('aria-describedby', ids);
        anchor.addEventListener('mouseenter', function () { later(function () { show(anchor, cards); }); });
        anchor.addEventListener('mouseleave', function () { later(hide); });
        anchor.addEventListener('focus', function () { if (!touched) show(anchor, cards); });
        anchor.addEventListener('blur', function () {
          if (active === anchor && !pop.matches(':hover')) hide();
        });
        anchor.addEventListener('click', function () {
          if (!touched || anchor.closest('a[href]')) return;
          if (active === anchor) hide();
          else show(anchor, cards);
        });
      });
      pop.addEventListener('mouseenter', function () { clearTimeout(timer); });
      pop.addEventListener('mouseleave', function () { later(hide); });
      doc.addEventListener('pointerdown', function (event) {
        touched = event.pointerType !== 'mouse';
        if (active && !active.contains(event.target) && !pop.contains(event.target)) hide();
      }, true);
      doc.addEventListener('keydown', function (event) {
        touched = false;
        if (event.key === 'Escape') hide();
      });
      view.addEventListener('scroll', function () { if (active) place(); }, { passive: true, capture: true });
      view.addEventListener('resize', function () { if (active) place(); });
      return hide;
    }

    function navigate(hash) {
      hideTip?.();
      chrome.follow();
      focusHash = hash;
      if (location.hash === hash) render();
      else location.hash = hash;
    }

    function follow(event) {
      var link = event.target.closest?.('[data-export-destination],a[href],area[href]');
      if (!link || event.defaultPrevented) return;
      var route = link.getAttribute('data-export-destination');
      if (route !== null) {
        route ||= link.getAttribute('href');
        event.preventDefault();
        if (route?.startsWith('#') && pages.has(route.slice(1).split('/')[0])) navigate(route);
      } else if (pageState && link.ownerDocument === frame.contentDocument) {
        var value = link.getAttribute('href') || link.getAttribute('xlink:href');
        if (!value) return;
        var payload = pages.get(active).interactive;
        try {
          var local = value.trim().startsWith('#');
          var url = new URL(value, local ? payload.url : payload.base);
          var page = local ? active : sourcePages.get(fileKey(url, true));
          if (page) {
            event.preventDefault();
            var fragment = decodeURIComponent(url.hash.slice(1));
            navigate('#' + page + (fragment ? '/' + encodeURIComponent(fragment) : ''));
            return;
          }
          if (['https:', 'http:', 'mailto:', 'tel:', 'sms:'].includes(url.protocol)) {
            link.setAttribute('href', url.href);
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            return;
          }
        } catch (error) {}
        event.preventDefault();
      }
    }

    function openAuthorFrame(current, record, payload, saved, markup, nonce, fallback) {
      var session = crypto.randomUUID();
      var port, loaded, started, headingCount, captureTimer;
      var deadline = setTimeout(function () { fallback('The author page did not finish starting.'); }, 10000);
      var targets = new Set(record.targets);
      var state = isolated = {
        send: function (data) { port?.postMessage(data); },
        capture: function () {
          if (!started) return false;
          if (!captureTimer) {
            captureTimer = setTimeout(finishCapture, 150);
            state.send({ type: 'capture' });
          }
          return true;
        },
        close: function () {
          clearTimeout(deadline);
          clearTimeout(captureTimer);
          window.removeEventListener('message', connect);
          port?.close();
        }
      };

      function finishCapture() {
        clearTimeout(captureTimer);
        captureTimer = null;
        render(true);
      }

      function init() {
        if (!loaded || !port) return;
        // Remap references so the opaque frame receives only inputs for this page.
        var shared = [];
        var indices = new Map();
        function take(index) {
          if (!indices.has(index)) {
            indices.set(index, shared.length);
            shared.push(bundle.shared[index]);
          }
          return indices.get(index);
        }
        function entries(list) {
          return list.map(function ([key, index]) { return [key, take(index)]; });
        }
        var author = payload.author;
        state.send({ type: 'init', saved: saved, shared: shared, payload: {
          ...payload, markup: undefined,
          site: payload.site === null ? null : take(payload.site),
          modules: entries(payload.modules), data: entries(payload.data), imports: entries(payload.imports),
          inlineData: payload.inlineData.map(take),
          author: { before: entries(author.before), after: entries(author.after),
            files: author.files.map(function ([url, kind, value]) {
              return [url, kind, kind === 'text' ? take(value) : bundle.assets[value[0]] + value[1]];
            }) }
        } });
      }

      function receive(event) {
        if (isolated !== state || current !== frame) return;
        var data = event.data;
        if (!data || Object.prototype.toString.call(data) !== '[object Object]' || typeof data.type !== 'string') return;
        var size = Object.keys(data).length;
        if (data.type === 'failure' && size === 2 && typeof data.reason === 'string' && data.reason.length <= 300) {
          fallback(data.reason);
        } else if (!started) {
          if (data.type !== 'ready' || size !== 3 || !Array.isArray(data.headings) || data.headings.length > 10000 ||
              ![null, 'light', 'dark'].includes(data.theme) || !data.headings.every(function (item) {
                return Array.isArray(item) && item.length === 3 && typeof item[0] === 'string' &&
                  typeof item[1] === 'string' && item[1].length <= 2000 && [1, 2, 3].includes(item[2]);
              })) return;
          headingCount = data.headings.length;
          // Only rendered headings with known destinations are offered by the outer outline.
          var retained = data.headings.map(function (item, index) { return targets.has(item[0]) ? index : -1; })
            .filter(function (index) { return index >= 0; });
          state.readings = retained;
          started = ready = true;
          clearTimeout(deadline);
          current.inert = false;
          chrome.mountRemote({ ...data, headings: retained.map(function (index) { return data.headings[index]; }) },
            record.id, state.send);
          scroll(destination()[1]);
        } else if (data.type === 'progress' && size === 5 && Array.isArray(data.readings) &&
            data.readings.length === headingCount && data.readings.every(function (value) { return value === null || Number.isFinite(value); }) &&
            Number.isFinite(data.height) && Number.isFinite(data.percent) && typeof data.bottom === 'boolean') {
          chrome.remoteProgress({ ...data, readings: state.readings.map(function (index) { return data.readings[index]; }) });
        } else if (data.type === 'key' && size === 2 && ['n', 'f', 't', 'j', 'k'].includes(data.key)) {
          chrome.remoteKey(data.key);
        } else if (data.type === 'link' && size === 2 && typeof data.href === 'string' && data.href.length <= 8192) {
          try {
            var href = data.href;
            var [page, fragment, extra] = href.slice(1).split('/');
            if (!href.startsWith('#') || !pages.has(page)) {
              var local = href.trim().startsWith('#');
              var url = new URL(href, local ? payload.url : payload.base);
              page = local ? record.id : sourcePages.get(fileKey(url, true));
              fragment = url.hash.slice(1);
              extra = undefined;
            }
            if (extra !== undefined || !pages.has(page)) return;
            var id = decodeURIComponent(fragment || '');
            if (!id || pages.get(page).targets?.includes(id)) navigate('#' + page + (id ? '/' + encodeURIComponent(id) : ''));
          } catch (error) {}
        } else if (data.type === 'state' && size === 2 && captureTimer) {
          // Session replay uses the library's existing record and import validation.
          if (data.value && typeof data.value === 'object') committed.set(record.id, data.value);
          finishCapture();
        }
      }

      function connect(event) {
        var data = event.data;
        if (current !== frame || event.source !== current.contentWindow || event.origin !== 'null' ||
            !data || data.type !== 'docform-author-connect' || data.session !== session ||
            Object.keys(data).length !== 2 || event.ports.length !== 1 || port) return;
        window.removeEventListener('message', connect);
        port = event.ports[0];
        port.onmessage = receive;
        init();
      }

      current.addEventListener('load', function () {
        if (current !== frame) return;
        if (loaded) fallback('The author page frame navigated.');
        else { loaded = true; init(); }
      });
      window.addEventListener('message', connect);
      var code = '(' + authorFrame + ')(' + JSON.stringify(session) + ',' +
        startInteractive + ',' + headings + ');';
      var end = markup.lastIndexOf('</body>');
      current.srcdoc = markup.slice(0, end) + '<script nonce="' + nonce + '">' + code + '<' + '/script>' + markup.slice(end);
    }

    function render(skipCapture) {
      var [page, fragment] = destination();
      if (active === page) {
        scroll(fragment);
        return;
      }
      if (!skipCapture && isolated?.capture()) return;
      isolated?.close();
      isolated = null;
      if (pageState) committed.set(active, pageState.capture());
      pageState = null;
      running?.abort();
      running = null;
      active = page;
      ready = false;
      hideTip?.();
      hideTip = revealStep = null;
      var record = pages.get(page);
      var index = bundle.pages.indexOf(record);
      chrome.page(page, [bundle.pages[index - 1], bundle.pages[index + 1]]);
      if (status) {
        status.hidden = true;
        status.textContent = '';
      }

      function mount(payload, reason) {
        if (reason && status) {
          status.textContent = 'Showing the Reader view for ' + record.title + '. ' + reason;
          status.hidden = false;
        }
        var current = frame = document.createElement('iframe');
        current.title = record.title;
        current.inert = !!payload;
        current.setAttribute('sandbox', payload?.author ? 'allow-scripts' :
          'allow-same-origin allow-popups allow-popups-to-escape-sandbox' + (payload ? ' allow-scripts' : ''));
        if (payload?.author) current.referrerPolicy = 'no-referrer';
        var controller = payload ? running = new AbortController() : null;
        var nonce = payload ? Array.from(crypto.getRandomValues(new Uint8Array(24)), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('') : null;

        function fallback(reason) {
          controller.abort();
          isolated?.close();
          isolated = null;
          ready = false;
          chrome.page(page, [bundle.pages[index - 1], bundle.pages[index + 1]]);
          running = null;
          mount(null, reason);
        }

        if (!payload?.author) current.addEventListener('load', async function () {
          if (current !== frame) return;
          var doc = current.contentDocument;
          if (doc?.URL !== 'about:srcdoc') {
            if (payload) fallback('The page frame could not load.');
            return;
          }
          if (payload) {
            try {
              var state = await startInteractive(doc, payload, bundle.shared, nonce,
                committed.get(page) || payload.state, controller.signal);
              if (current !== frame || controller.signal.aborted) return;
              pageState = state;
            } catch (error) {
              if (current !== frame || controller.signal.aborted) return;
              fallback(error.message);
              return;
            }
          } else {
            hideTip = tips(doc);
            if (!pageSteps.has(page)) pageSteps.set(page, new Map());
            revealStep = figureSteps(doc, pageSteps.get(page), function () { hideTip?.(); chrome.update(); });
          }
          doc.addEventListener('click', follow);
          current.inert = false;
          chrome.mount(doc, page);
          ready = true;
          scroll(destination()[1]);
        }, { once: true });
        try {
          var markup = assemble(payload?.markup || record.markup, bundle.assets);
          if (payload) markup = markup.replace("'nonce-df-export-nonce'", "'nonce-" + nonce + "'" +
            (payload.author ? ' blob:' : ''));
          if (payload?.author) openAuthorFrame(current, record, payload, committed.get(page) || payload.state, markup, nonce, fallback);
          else current.srcdoc = markup;
        } catch (error) {
          if (!payload) throw error;
          fallback('The page resources could not be assembled.');
          return;
        }
        host.replaceChildren(...(status ? [status] : []), current);
      }

      var payload = interactive && bundle.version === 1 && record.interactive;
      mount(payload, interactive && !payload ? 'Interactive content is unavailable for this page.' : null);
    }

    document.addEventListener('click', follow);
    window.addEventListener('hashchange', function () {
      chrome.follow(focusHash !== location.hash);
      render();
    });
    render();
  }

  root.DocForm._exportReader = { run: reader, assemble: assemble, figureSteps: figureSteps, headings: headings,
    controls: controls, startInteractive: startInteractive, authorFrame: authorFrame };
})(window);
