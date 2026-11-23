// Cross-references: numbered figures, tables, and equations, filled reference links, hover previews, and citations.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] refs.js needs core.js loaded before it.');
    return;
  }

  var NAMES = { figure: 'Figure', table: 'Table', equation: 'Equation' };
  var MAX_AUTHORS = 6;
  var PREVIEW_DELAY = 250;
  var PREVIEW_BLOCKS = 3;
  var FLASH = 1400;
  var NO_PREVIEW = '.op-sidebar, .op-pager, .op-outline, .op-heading-link, .op-cite, .op-note-ref, .op-references, ' +
    '.op-tooltip, .op-controls';
  var STRIP = 'script, .op-heading-link, .op-code-copy, .op-anim-controls, .op-param input';
  var hasOwn = Object.prototype.hasOwnProperty;
  var boot = OffPrint._boot;
  var component = OffPrint._component;

  function flag(el, name) {
    return boot ? component.flag(el, name, 'references') : el.hasAttribute('data-op-' + name);
  }

  function label(kind, n) {
    return kind === 'equation' ? NAMES.equation + ' (' + n + ')' : NAMES[kind] + ' ' + n;
  }

  // Numbers items per kind in the order given: [{ kind }] -> [{ kind, n, label }].
  function numberItems(items) {
    var counts = {};
    return items.map(function (item) {
      counts[item.kind] = (counts[item.kind] || 0) + 1;
      return { kind: item.kind, n: counts[item.kind], label: label(item.kind, counts[item.kind]) };
    });
  }

  // What a numberable element is, or null. Figures and tables need a caption or an id (or data-op-number);
  // display equations need an id unless the manifest asks for all of them.
  function kindOf(el, allEquations) {
    if (flag(el, 'no-number') || el.closest('.op-tooltip')) return null;
    var asked = flag(el, 'number');
    var tag = el.tagName;
    if (tag === 'FIGURE') {
      if (el.parentElement && el.parentElement.closest('figure')) return null;
      if (!asked && !el.id && !el.querySelector(':scope > figcaption')) return null;
      var hasTable = !!el.querySelector('table');
      // Charts drawn from a table, pictures, and math outside the table make it a figure.
      var visual = el.querySelector('svg, img, canvas, video, [data-op-chart], .op-math:not(table .op-math)');
      return hasTable && !visual ? 'table' : 'figure';
    }
    if (tag === 'TABLE') {
      if (el.closest('figure')) return null;
      return asked || el.id || el.querySelector(':scope > caption') ? 'table' : null;
    }
    if (el.matches('.op-math[data-op-display]') && flag(el, 'display')) {
      if (el.closest('figure, .op-tooltip')) return null;
      return asked || el.id || allEquations ? 'equation' : null;
    }
    return null;
  }

  function addLabel(holder, text) {
    var span = document.createElement('span');
    span.className = 'op-label';
    span.textContent = text;
    var hasText = holder.textContent.trim() !== '';
    holder.insertBefore(span, holder.firstChild);
    if (hasText) span.after(' ');
  }

  function applyNumber(el, kind, n) {
    var text = label(kind, n);
    el.setAttribute('data-op-label', text);
    if (kind === 'equation') {
      // An attribute rather than a child, so re-rendering the TeX keeps it.
      el.setAttribute('data-op-equation-label', '(' + n + ')');
      return;
    }
    var caption = el.querySelector(el.tagName === 'TABLE' ? ':scope > caption' : ':scope > figcaption');
    if (!caption) {
      caption = document.createElement(el.tagName === 'TABLE' ? 'caption' : 'figcaption');
      if (el.tagName === 'TABLE') el.insertBefore(caption, el.firstChild);
      else el.appendChild(caption);
    }
    addLabel(caption, text);
  }

  function numberPage(pages, site) {
    var equations = boot ? component.option('references', null, 'equations', 'labeled', function (value) {
      return value === 'all' || value === 'labeled';
    }) : site.refs && site.refs.equations;
    var allEquations = equations === 'all';
    var found = [];
    pages.forEach(function (page) {
      OffPrint._all('figure, table, .op-math[data-op-display]', page).forEach(function (el) {
        var kind = kindOf(el, allEquations);
        if (kind) found.push({ el: el, kind: kind });
      });
    });
    numberItems(found).forEach(function (item, i) { applyNumber(found[i].el, item.kind, item.n); });
    return found.length;
  }

  // Text an empty reference link shows for its target.
  function refText(target) {
    var text = target.getAttribute('data-op-label');
    if (text) return text;
    if (/^H[1-6]$/.test(target.tagName)) return headingText(target);
    return target.getAttribute('title') || target.id;
  }

  function headingText(h) {
    var copy = h.cloneNode(true);
    OffPrint._all(STRIP, copy).forEach(function (el) { el.remove(); });
    return copy.textContent.trim();
  }

  function scrub(node) {
    node.removeAttribute && node.removeAttribute('id');
    OffPrint._all('[id]', node).forEach(function (el) { el.removeAttribute('id'); });
    OffPrint._all(STRIP, node).forEach(function (el) { el.remove(); });
    OffPrint._all('[tabindex]', node).forEach(function (el) { el.removeAttribute('tabindex'); });
    // Copies of focus-mode blocks must not inherit the page's dimming.
    [node].concat(OffPrint._all('.op-focus-block', node)).forEach(function (el) {
      if (el.classList) el.classList.remove('op-focus-block', 'op-focus-dim');
    });
    OffPrint._all('.op-term, .op-tip', node).forEach(function (el) { el.removeAttribute('aria-describedby'); });
    return node;
  }

  // A heading previews as itself plus the first few blocks of its section.
  function sectionPreview(h) {
    var box = document.createElement('div');
    box.className = 'op-peek-section';
    var title = document.createElement('div');
    title.className = 'op-peek-title';
    title.textContent = headingText(h);
    box.appendChild(title);
    var level = Number(h.tagName.charAt(1));
    var count = 0;
    for (var el = h.nextElementSibling; el && count < PREVIEW_BLOCKS; el = el.nextElementSibling) {
      var m = /^H([1-6])$/.exec(el.tagName);
      if (m && Number(m[1]) <= level) break;
      if (el.matches('script, style, template, nav')) continue;
      box.appendChild(scrub(el.cloneNode(true)));
      count++;
    }
    return box;
  }

  function preview(target) {
    if (/^H[1-6]$/.test(target.tagName)) return sectionPreview(target);
    var box = document.createElement('div');
    box.className = 'op-peek-element';
    box.appendChild(scrub(target.cloneNode(true)));
    return box;
  }

  function remotePreview(href) {
    var box = document.createElement('div');
    box.className = 'op-peek-section';
    var search = OffPrint._search;
    var fillIn = function (hit) {
      box.textContent = '';
      if (!hit) {
        box.textContent = href;
        return;
      }
      var page = document.createElement('div');
      page.className = 'op-peek-page';
      page.textContent = hit.page;
      var title = document.createElement('div');
      title.className = 'op-peek-title';
      title.textContent = hit.title;
      var text = document.createElement('p');
      text.textContent = hit.text.length > 320 ? hit.text.slice(0, 320).replace(/\s+\S*$/, '') + '…' : hit.text;
      box.appendChild(page);
      if (hit.title !== hit.page) box.appendChild(title);
      if (hit.text) box.appendChild(text);
    };
    box.textContent = 'Loading…';
    if (search && search.find) search.find(href, fillIn);
    else fillIn(null);
    return box;
  }

  function samePage(url) {
    return url.href.split('#')[0] === String(OffPrint._page || root.location.href).split('#')[0];
  }

  function flash(el) {
    el.classList.remove('op-ref-flash');
    void el.offsetWidth;
    el.classList.add('op-ref-flash');
    setTimeout(function () { el.classList.remove('op-ref-flash'); }, FLASH);
  }

  function targetOf(hash) {
    if (!hash || hash.length < 2) return null;
    var id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch (e) {
      // Keep the raw id.
    }
    return document.getElementById(id);
  }

  function linkRefs(pages, site) {
    var tooltip = OffPrint._tooltips;
    var remote = false;
    pages.forEach(function (page) {
      OffPrint._all('a[href]', page).forEach(function (a) {
        if (a.closest(NO_PREVIEW) || component.closestFlag(a, 'no-preview', 'references')) return;
        var raw = a.getAttribute('href');
        var url;
        try {
          url = new URL(raw, document.querySelector('base[href]')?.href || OffPrint._page || root.location.href);
        } catch (e) {
          return;
        }
        var empty = !a.textContent.trim() && !a.querySelector('img, svg');
        if (samePage(url) && raw.charAt(0) === '#') {
          if (url.hash.length < 2) return;
          var target = targetOf(url.hash);
          if (!target) {
            OffPrint._warnOnce('ref:' + url.hash, 'No element "' + url.hash + '" for a reference link.');
            a.classList.add('op-ref-missing');
            if (empty) a.textContent = '??';
            return;
          }
          a.classList.add('op-ref');
          if (empty) a.textContent = refText(target);
          a.addEventListener('click', function () { flash(target); });
          if (tooltip) {
            tooltip.attach(a, '', '', {
              content: function () { return preview(target); },
              className: 'op-peek',
              delay: PREVIEW_DELAY,
              describe: false,
              focusable: false
            });
          }
          return;
        }
        if (!isSitePage(url, site)) return;
        a.classList.add('op-ref', 'op-ref-page');
        remote = true;
        if (tooltip) {
          tooltip.attach(a, '', '', {
            content: function () { return remotePreview(url.href); },
            className: 'op-peek',
            delay: PREVIEW_DELAY,
            describe: false,
            focusable: false
          });
        }
      });
    });
    // Warm the search index so cross-page previews are ready by the first hover.
    if (remote && OffPrint._search && OffPrint._search.load) OffPrint._search.load(function () {});
  }

  function isSitePage(url, site) {
    var key = url.href.split('#')[0];
    return (site.order || []).some(function (page) {
      return page.href && pageKey(page.href) === pageKey(key);
    });
  }

  function pageKey(href) {
    return String(href).split('#')[0].split('?')[0].replace(/\/index\.html?$/i, '/');
  }

  // Bibliography ----------------------------------------------------------

  function citeKeys(value) {
    return String(value || '').split(/[\s,;]+/).filter(Boolean);
  }

  // Numbers bibliography keys by first citation: lists of keys in page order -> { numbers, order, missing }.
  function assignNumbers(lists, bib) {
    var numbers = Object.create(null);
    var order = [];
    var missing = [];
    lists.forEach(function (keys) {
      keys.forEach(function (key) {
        if (hasOwn.call(numbers, key)) return;
        if (!hasOwn.call(bib, key)) {
          if (missing.indexOf(key) < 0) missing.push(key);
          return;
        }
        order.push(key);
        numbers[key] = order.length;
      });
    });
    return { numbers: numbers, order: order, missing: missing };
  }

  function authorList(value) {
    if (Array.isArray(value)) return value.map(String).map(function (s) { return s.trim(); }).filter(Boolean);
    if (typeof value !== 'string') return [];
    return value.split(/\s+and\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function joinAuthors(names) {
    if (names.length > MAX_AUTHORS) return names.slice(0, MAX_AUTHORS).join(', ') + ', et al.';
    if (names.length <= 2) return names.join(' and ');
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  function sentence(text) {
    text = String(text).trim();
    return /[.?!]$/.test(text) ? text : text + '.';
  }

  // Splits an entry into display parts. Entries are strings (shown as written) or
  // { author|authors, title, year, venue|journal|booktitle|publisher, volume, pages, url, doi, note }.
  function formatEntry(entry) {
    if (typeof entry === 'string') return { text: entry.trim() };
    if (!entry || typeof entry !== 'object') return { text: '' };
    var authors = joinAuthors(authorList(entry.authors != null ? entry.authors : entry.author));
    var venue = entry.venue || entry.journal || entry.booktitle || entry.publisher || '';
    var where = [venue, entry.volume, entry.pages ? 'pp. ' + entry.pages : '', entry.year]
      .filter(function (part) { return part != null && String(part).trim() !== ''; }).map(String);
    var url = entry.url || (entry.doi ? 'https://doi.org/' + entry.doi : '');
    return {
      authors: authors ? sentence(authors) : '',
      title: entry.title ? sentence(entry.title) : '',
      venue: venue ? String(venue) : '',
      where: where.length ? sentence(where.join(', ')) : '',
      note: entry.note ? sentence(entry.note) : '',
      url: url ? String(url) : ''
    };
  }

  function citationText(entry) {
    var parts = formatEntry(entry);
    if (parts.text != null) return parts.text;
    return [parts.authors, parts.title, parts.where, parts.note].filter(Boolean).join(' ');
  }

  function entryNode(entry) {
    var parts = formatEntry(entry);
    var box = document.createElement('span');
    box.className = 'op-bib-entry';
    if (parts.text != null) {
      box.textContent = parts.text;
      return box;
    }
    var add = function (cls, text) {
      if (!text) return;
      if (box.childNodes.length) box.appendChild(document.createTextNode(' '));
      var span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      box.appendChild(span);
    };
    add('op-bib-authors', parts.authors);
    add('op-bib-title', parts.title);
    add('op-bib-where', parts.where);
    add('op-bib-note', parts.note);
    if (parts.url) {
      box.appendChild(document.createTextNode(' '));
      var link = document.createElement('a');
      link.className = 'op-bib-link';
      link.href = parts.url;
      link.textContent = parts.url.replace(/^https?:\/\//, '');
      box.appendChild(link);
    }
    return box;
  }

  function refId(key) {
    return 'ref-' + OffPrint.util.slug(key);
  }

  function renderCitations(pages, site) {
    var bib = site.bibliography || {};
    var cites = [];
    pages.forEach(function (page) { cites = cites.concat(OffPrint._all('[data-op-cite]', page)); });
    var lists = cites.map(function (el) { return citeKeys(el.getAttribute('data-op-cite')); });
    var result = assignNumbers(lists, bib);
    result.missing.forEach(function (key) {
      OffPrint._warnOnce('cite:' + key, 'Unknown citation "' + key + '"; add it to the manifest bibliography.');
    });
    var first = Object.create(null);
    var tooltip = OffPrint._tooltips;

    cites.forEach(function (el, i) {
      if (!lists[i].length) {
        if (boot) component.issue('citations', el, 'Empty citation.', 'Supply one or more keys from options.citations.entries.');
        return;
      }
      el.classList.add('op-cite');
      el.textContent = '';
      var keys = lists[i].filter(function (key, j, arr) { return arr.indexOf(key) === j; });
      keys.sort(function (a, b) { return (result.numbers[a] || Infinity) - (result.numbers[b] || Infinity); });
      el.appendChild(document.createTextNode('['));
      keys.forEach(function (key, j) {
        if (j) el.appendChild(document.createTextNode(', '));
        if (!hasOwn.call(result.numbers, key)) {
          if (boot) component.issue('citations', el, 'Unknown citation "' + key + '".',
            'Define the key in options.citations.entries.');
          var miss = document.createElement('span');
          miss.className = 'op-cite-missing';
          miss.textContent = '?';
          miss.title = 'Unknown citation "' + key + '"';
          el.appendChild(miss);
          return;
        }
        var a = document.createElement('a');
        a.className = 'op-cite-link';
        a.href = '#' + refId(key);
        a.textContent = String(result.numbers[key]);
        if (!first[key]) {
          first[key] = 'cite-' + OffPrint.util.slug(key);
          a.id = first[key];
        }
        el.appendChild(a);
        if (tooltip) {
          tooltip.attach(a, '', '', {
            content: function () { return entryNode(bib[key]); },
            className: 'op-cite-card',
            focusable: false
          });
        }
      });
      el.appendChild(document.createTextNode(']'));
    });

    var slots = [];
    pages.forEach(function (page) { slots = slots.concat(OffPrint._all('[data-op-bibliography]', page)); });
    if (!slots.length && result.order.length && pages.length) slots.push(appendSection(pages[0]));
    slots.forEach(function (slot, i) {
      slot.textContent = '';
      slot.appendChild(referenceList(result.order, bib, first, i === 0));
    });
    return result;
  }

  function referenceList(order, bib, first, withIds) {
    var list = document.createElement('ol');
    list.className = 'op-references';
    list.setAttribute('data-op-no-list-style', '');
    order.forEach(function (key) {
      var li = document.createElement('li');
      if (withIds) li.id = refId(key);
      li.appendChild(entryNode(bib[key]));
      if (withIds && first[key]) {
        var back = document.createElement('a');
        back.className = 'op-bib-back';
        back.href = '#' + first[key];
        back.textContent = '↩';
        back.setAttribute('aria-label', 'Back to the first citation');
        li.appendChild(document.createTextNode(' '));
        li.appendChild(back);
      }
      list.appendChild(li);
    });
    return list;
  }

  function appendSection(page) {
    var section = document.createElement('section');
    section.className = 'op-references-section';
    var h = document.createElement('h2');
    h.textContent = 'References';
    section.appendChild(h);
    var slot = document.createElement('div');
    slot.setAttribute('data-op-bibliography', '');
    section.appendChild(slot);
    var pager = page.querySelector(':scope > .op-pager');
    page.insertBefore(section, pager);
    return slot;
  }

  function pageRoots() {
    var pages = OffPrint._all('.op-page');
    return pages.length ? pages : [document.querySelector('main') || document.body];
  }

  OffPrint._references = {
    numberItems: numberItems,
    assignNumbers: assignNumbers,
    joinAuthors: joinAuthors,
    label: function (target) {
      var el = component.target(target, 'references', false);
      return el ? el.getAttribute('data-op-label') : null;
    }
  };
  OffPrint._citations = { citeKeys: citeKeys, formatEntry: formatEntry, citationText: citationText };
  OffPrint.register('refs', function (site) {
    var pages = pageRoots();
    numberPage(pages, site);
    if (!boot) renderCitations(pages, site);
    function link() {
      linkRefs(pageRoots(), site);
      var target = targetOf(root.location.hash);
      if (target) flash(target);
    }
    // Heading ids are assigned during navigation setup.
    if (boot) boot.after('refs', link);
    else Promise.resolve().then(link).catch(function (e) {
      OffPrint._warnOnce('init:refs', 'Module "refs" failed to link references.', e);
    });
  });
  if (boot) OffPrint.register('citations', function (site) { renderCitations(pageRoots(), site); });
})(typeof window !== 'undefined' ? window : globalThis);
