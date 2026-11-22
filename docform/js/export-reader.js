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

    function jump(direction) {
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
        view = null;
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
          var item = make('li');
          var link = make('a', node.textContent.trim().replace(/\s+/g, ' ') || node.id);
          link.href = '#' + page + '/' + encodeURIComponent(node.id);
          link.dataset.level = node.localName[1];
          link.setAttribute('data-export-destination', '');
          item.append(link);
          outline?.append(item);
          return { node: node, item: item, link: link };
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
      scrolled: function (hash) {
        jumpOrigin = { hash: hash, top: view.scrollY };
        schedule();
      },
      update: schedule
    };
  }

  async function startInteractive(doc, payload, shared, nonce, saved, signal) {
    var view = doc.defaultView;
    var paths = new Map(payload.modules);
    var styles = new Set(payload.styles);
    var data = new Map(payload.data);
    var library = new URL('.', payload.entryURL).href;

    function execute(path, entry) {
      signal.throwIfAborted();
      var code = shared[paths.get(path)];
      if (typeof code !== 'string') return false;
      var script = doc.createElement('script');
      script.nonce = nonce;
      if (entry && payload.profile !== null) script.setAttribute('data-df-profile', payload.profile);
      script.textContent = code;
      var failed = false;
      function scriptError() { failed = true; }
      view.addEventListener('error', scriptError);
      try { doc.head.append(script); }
      finally {
        view.removeEventListener('error', scriptError);
        script.remove();
      }
      return !failed;
    }

    if (payload.site !== null) view.DocFormSite = structuredClone(shared[payload.site]);
    view.DocFormExportContext = {
      interactive: true, entryURL: payload.entryURL, pageURL: payload.url, siteURL: payload.siteURL,
      combinedStyles: payload.combined, features: payload.features, identities: payload.identities,
      loadModule: function (url, css) {
        var path = url.startsWith(library) && url.slice(library.length);
        return css ? styles.has(path) : execute(path);
      },
      loadAsset: function (kind, url, name) {
        signal.throwIfAborted();
        if (kind !== 'data' || !data.has(name)) return false;
        (view.DocFormData ||= Object.create(null))[name] = structuredClone(shared[data.get(name)]);
        return true;
      }
    };
    if (!execute('docform.js', true) || !view.DocForm?.ready) throw Error('DocForm could not start.');
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
    if (!runtime._site || !runtime._readerState ||
        payload.features.some(function (feature) { return !runtime._boot.enabled(feature); }) ||
        runtime.diagnostics.list().some(function (issue) {
          return ['asset', 'data-wrapper', 'feature-init'].includes(issue.code);
        })) {
      throw Error('A required DocForm feature could not initialize.');
    }
    if (saved) {
      var result = runtime._readerState.replay({ record: saved, status: 'saved' });
      if (result.status === 'stale' || result.issues.length) throw Error('The committed view could not be restored.');
    }
    return runtime._readerState;
  }

  function reader(assemble, figureSteps, headings, controls, startInteractive, fileKey) {
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
    var running, pageState;
    var chrome = controls(host, headings, tips, navigate);

    function destination() {
      var [page, fragment] = location.hash.slice(1).split('/');
      if (!pages.has(page)) page = host.dataset.initial;
      try { fragment = decodeURIComponent(fragment || ''); } catch (error) { fragment = ''; }
      return [page, fragment];
    }

    function scroll(fragment) {
      if (!ready) return;
      var doc = frame.contentDocument;
      var focus = focusHash === location.hash;
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

    function render() {
      var [page, fragment] = destination();
      if (active === page) {
        scroll(fragment);
        return;
      }
      if (pageState) committed.set(active, pageState.capture().record);
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
        current.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox' +
          (payload ? ' allow-scripts' : ''));
        var controller = payload ? running = new AbortController() : null;
        var nonce = payload ? Array.from(crypto.getRandomValues(new Uint8Array(24)), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('') : null;

        function fallback(reason) {
          controller.abort();
          running = null;
          mount(null, reason);
        }

        current.addEventListener('load', async function () {
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
          current.srcdoc = payload ? markup.replace("'nonce-df-export-nonce'", "'nonce-" + nonce + "'") : markup;
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
    controls: controls, startInteractive: startInteractive };
})(window);
