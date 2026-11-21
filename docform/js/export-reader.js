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

  function reader(assemble) {
    var bundle = JSON.parse(document.querySelector('#export-bundle').textContent);
    document.querySelector('#export-bundle').remove();
    var pages = new Map(bundle.pages.map(function (page) { return [page.id, page]; }));
    var host = document.querySelector('#export-page');
    var contents = document.querySelector('#export-contents');
    var previous = document.querySelector('#export-previous');
    var next = document.querySelector('#export-next');
    var status = document.querySelector('#export-status');
    var frame;
    var active;
    var ready = false;
    var focus = false;
    var hideTip = null;

    function leg(link, page, label) {
      link.hidden = !page;
      if (!page) return;
      link.href = '#' + page.id;
      link.textContent = label + ' · ' + page.title;
    }

    function destination() {
      var [page, fragment] = location.hash.slice(1).split('/');
      if (!pages.has(page)) page = host.dataset.initial;
      try { fragment = decodeURIComponent(fragment || ''); } catch (error) { fragment = ''; }
      return [page, fragment];
    }

    function scroll(fragment) {
      if (!ready) return;
      var doc = frame.contentDocument;
      var heading = fragment && (doc.getElementById(fragment) ||
        Array.from(doc.getElementsByName(fragment)).find(function (node) { return node.localName === 'a'; }));
      if (heading) {
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
      focus = false;
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
        anchor.addEventListener('focus', function () { show(anchor, cards); });
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
        if (event.key === 'Escape') hide();
      });
      view.addEventListener('scroll', function () { if (active) place(); }, { passive: true, capture: true });
      view.addEventListener('resize', function () { if (active) place(); });
      return hide;
    }

    function follow(event) {
      var link = event.target.closest?.('[data-export-destination]');
      if (!link || event.defaultPrevented) return;
      event.preventDefault();
      hideTip?.();
      contents.open = false;
      focus = true;
      var hash = link.getAttribute('href');
      if (location.hash === hash) render();
      else location.hash = hash;
    }

    function render() {
      var [page, fragment] = destination();
      if (active === page) {
        scroll(fragment);
        return;
      }
      active = page;
      ready = false;
      var record = pages.get(page);
      var index = bundle.pages.indexOf(record);
      frame = document.createElement('iframe');
      frame.title = record.title;
      frame.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      var current = frame;
      frame.addEventListener('load', function () {
        if (current !== frame || current.contentDocument?.URL !== 'about:srcdoc') return;
        var doc = current.contentDocument;
        doc.addEventListener('click', follow);
        hideTip = tips(doc);
        ready = true;
        scroll(destination()[1]);
      });
      frame.srcdoc = assemble(record.markup, bundle.assets);
      host.replaceChildren(frame);
      status.textContent = record.title;
      leg(previous, bundle.pages[index - 1], 'Previous');
      leg(next, bundle.pages[index + 1], 'Next');
      contents.querySelectorAll('a').forEach(function (link) {
        if (link.hash === '#' + page) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }

    document.addEventListener('click', follow);
    window.addEventListener('hashchange', render);
    render();
  }

  root.DocForm._exportReader = { run: reader, assemble: assemble };
})(window);
