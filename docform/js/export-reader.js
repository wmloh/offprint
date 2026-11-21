(function (root) {
  'use strict';

  function reader() {
    var templates = Array.from(document.querySelectorAll('template[data-page]'));
    var pages = new Map(templates.map(function (node) { return [node.dataset.page, node]; }));
    var host = document.querySelector('#export-page');
    var contents = document.querySelector('#export-contents');
    var previous = document.querySelector('#export-previous');
    var next = document.querySelector('#export-next');
    var status = document.querySelector('#export-status');
    var frame;
    var active;
    var ready = false;
    var focus = false;

    function leg(link, page, label) {
      link.hidden = !page;
      if (!page) return;
      link.href = '#' + page.dataset.page;
      link.textContent = label + ' · ' + page.dataset.title;
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

    function tips(doc) {
      var bank = doc.querySelector('[data-df-snapshot-tips]');
      if (!bank) return;
      var dialog = doc.createElement('dialog');
      dialog.className = 'df-export-tip';
      dialog.setAttribute('aria-label', 'Definition');
      var close = doc.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      close.autofocus = true;
      var content = doc.createElement('div');
      dialog.append(close, content);
      doc.body.append(dialog);
      var trigger;
      var svgTools = new Map();
      close.addEventListener('click', function () { dialog.close(); });
      dialog.addEventListener('close', function () {
        bank.append(...content.children);
        trigger?.focus();
      });
      doc.querySelectorAll('[data-df-snapshot-tip]').forEach(function (anchor) {
        var cards = anchor.getAttribute('data-df-snapshot-tip').split(/\s+/)
          .map(function (id) { return doc.getElementById(id); })
          .filter(function (node) { return node && bank.contains(node); });
        if (!cards.length) return;
        var button = doc.createElement('button');
        button.type = 'button';
        button.className = 'df-export-tip-button';
        button.textContent = '?';
        button.setAttribute('aria-haspopup', 'dialog');
        var label = (anchor.getAttribute('aria-label') || anchor.textContent ||
          cards[0].querySelector('.df-tooltip-title')?.textContent || '').trim();
        button.setAttribute('aria-label', label ? 'Definition for ' + label : 'Show definition');
        if (anchor instanceof doc.defaultView.SVGElement) {
          var drawing = anchor.ownerSVGElement || anchor;
          while (drawing.ownerSVGElement) drawing = drawing.ownerSVGElement;
          if (!svgTools.has(drawing)) {
            var tools = doc.createElement('span');
            drawing.after(tools);
            svgTools.set(drawing, tools);
          }
          if (label) button.textContent = label + ' ?';
          svgTools.get(drawing).append(button);
        } else anchor.after(button);
        if (anchor.getAttribute('tabindex') === '0' && !anchor.matches('a[href],a[*|href],button,summary')) {
          anchor.removeAttribute('tabindex');
        }
        button.addEventListener('click', function () {
          trigger = button;
          content.append(...cards);
          dialog.showModal();
        });
      });
    }

    function follow(event) {
      var link = event.target.closest?.('[data-export-destination]');
      if (!link || event.defaultPrevented) return;
      event.preventDefault();
      event.target.ownerDocument.querySelector('dialog.df-export-tip[open]')?.close();
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
      var template = pages.get(page);
      var index = templates.indexOf(template);
      frame = template.content.firstElementChild.cloneNode();
      var current = frame;
      frame.addEventListener('load', function () {
        if (current !== frame || current.contentDocument?.URL !== 'about:srcdoc') return;
        var doc = current.contentDocument;
        doc.addEventListener('click', follow);
        tips(doc);
        ready = true;
        scroll(destination()[1]);
      });
      host.replaceChildren(frame);
      status.textContent = template.dataset.title;
      leg(previous, templates[index - 1], 'Previous');
      leg(next, templates[index + 1], 'Next');
      contents.querySelectorAll('a').forEach(function (link) {
        if (link.hash === '#' + page) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }

    document.addEventListener('click', follow);
    window.addEventListener('hashchange', render);
    render();
  }

  root.DocForm._exportReader = reader;
})(window);
