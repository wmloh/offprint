// Site glossary page: the manifest glossary merged with inline tips from the search index, listed alphabetically with
// letter jumps and links to the pages that use each term.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] glossary.js needs core.js loaded before it.');
    return;
  }

  var OTHER = '#';
  var hasOwn = Object.prototype.hasOwnProperty;

  function clean(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  }

  function same(text) {
    return clean(text).toLowerCase();
  }

  // The letter a term is listed under: its first letter without accents, or "#" for digits, symbols, and math.
  function letter(title) {
    var c = clean(title).normalize('NFD').charAt(0).toUpperCase();
    return /\p{L}/u.test(c) ? c : OTHER;
  }

  function compare(a, b) {
    var la = letter(a.title);
    var lb = letter(b.title);
    if (la !== lb) {
      if (la === OTHER || lb === OTHER) return la === OTHER ? 1 : -1;
      return la.localeCompare(lb);
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }

  function pageHref(page) {
    return String(page.href || '').split('#')[0];
  }

  // Merges the normalized manifest glossary ({ key: { title, text, more } }) with indexed pages
  // ([{ href, title, sections, terms }], or null without an index) into sorted entries:
  // { key, title, text, more, manifest, variants: [{ text, pages: [{ title, href }] }],
  //   uses: [{ title, href, intro, sections: [{ id, title, href }] }] }.
  // Inline tips are keyed by their underlined text, case-insensitively. A manifest definition always comes first;
  // an inline-only term takes the first definition found. Other differing definitions become variants.
  function merge(terms, pages) {
    var byKey = {};
    var list = [];

    function entry(key, title) {
      if (!hasOwn.call(byKey, key)) {
        byKey[key] = { key: key, title: title, text: '', more: '', manifest: false, variants: [], uses: [], norm: null };
        list.push(byKey[key]);
      }
      return byKey[key];
    }

    function define(e, text, page) {
      var norm = same(text);
      if (e.norm === null) {
        e.text = clean(text);
        e.norm = norm;
        return;
      }
      if (norm === e.norm) return;
      var variant = null;
      for (var i = 0; i < e.variants.length; i++) {
        if (same(e.variants[i].text) === norm) variant = e.variants[i];
      }
      if (!variant) e.variants.push(variant = { text: clean(text), pages: [] });
      var href = pageHref(page);
      if (!variant.pages.some(function (p) { return p.href === href; })) variant.pages.push({ title: page.title, href: href });
    }

    function use(e, page, section) {
      var href = pageHref(page);
      var group = null;
      for (var i = 0; i < e.uses.length; i++) {
        if (e.uses[i].href === href) group = e.uses[i];
      }
      if (!group) e.uses.push(group = { title: page.title, href: href, intro: false, sections: [] });
      if (!section) {
        group.intro = true;
        return;
      }
      if (group.sections.some(function (s) { return s.id === section; })) return;
      var title = section;
      (page.sections || []).forEach(function (s) {
        if (s.id === section && s.title) title = s.title;
      });
      group.sections.push({ id: section, title: title, href: href + '#' + encodeURIComponent(section) });
    }

    Object.keys(terms || {}).forEach(function (key) {
      var source = terms[key];
      var e = entry(key, source.title);
      e.manifest = true;
      e.more = source.more || '';
      define(e, source.text, null);
    });

    (pages || []).forEach(function (page) {
      (page.terms || []).forEach(function (record) {
        if (!record || typeof record.text !== 'string') return;
        if (typeof record.tip === 'string') {
          var key = DocForm.termKey(record.text);
          if (!key) return;
          var e = entry(key, clean(record.text));
          define(e, record.tip, page);
          use(e, page, record.section || '');
        } else if (typeof record.term === 'string') {
          // data-df-term only reads the manifest, so a use of any other name is a missing term.
          var known = byKey[DocForm.termKey(record.term)];
          if (known && known.manifest) use(known, page, record.section || '');
        }
      });
    });

    list.forEach(function (e) { delete e.norm; });
    return list.sort(compare);
  }

  // Sorted entries grouped as [{ letter, entries }].
  function groups(entries) {
    var out = [];
    entries.forEach(function (e) {
      var l = letter(e.title);
      if (!out.length || out[out.length - 1].letter !== l) out.push({ letter: l, entries: [] });
      out[out.length - 1].entries.push(e);
    });
    return out;
  }

  // The letters of the jump bar: A to Z, then other letters in use, then "#" when used.
  function jumps(list) {
    var present = list.map(function (g) { return g.letter; });
    var out = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    present.forEach(function (l) {
      if (l !== OTHER && out.indexOf(l) < 0) out.push(l);
    });
    if (present.indexOf(OTHER) >= 0) out.push(OTHER);
    return out.map(function (l) { return { letter: l, present: present.indexOf(l) >= 0 }; });
  }

  // A short notice when the list cannot include inline tips and back-links, or null.
  function notice(pages) {
    if (!pages) {
      return 'Showing the manifest glossary only: no search index is loaded. Build one with ' +
        'docform/tools/search-index.html to add definitions written on pages and links to where each term is used.';
    }
    if (pages.length && pages.every(function (p) { return !p.terms; })) {
      return 'Showing the manifest glossary only: the search index has no glossary data. Build it again with ' +
        'docform/tools/search-index.html to add definitions written on pages and links to where each term is used.';
    }
    return null;
  }

  // Rendering ---------------------------------------------------------------

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function mixed(el, text) {
    var tooltip = DocForm.tooltip;
    if (tooltip && tooltip.mixed) tooltip.mixed(el, text);
    else el.textContent = text;
    return el;
  }

  function link(href, text) {
    var a = make('a', null, text);
    a.href = href;
    return a;
  }

  function usesLine(uses) {
    var p = make('p', 'df-glossary-uses');
    p.appendChild(make('span', 'df-glossary-label', 'Used on'));
    p.appendChild(document.createTextNode(' '));
    uses.forEach(function (group, i) {
      if (i) p.appendChild(document.createTextNode('; '));
      p.appendChild(link(group.href, group.title));
      if (!group.sections.length) return;
      p.appendChild(document.createTextNode(' ('));
      group.sections.forEach(function (s, j) {
        if (j) p.appendChild(document.createTextNode(', '));
        p.appendChild(link(s.href, s.title));
      });
      p.appendChild(document.createTextNode(')'));
    });
    return p;
  }

  function variantsBlock(variants) {
    var box = make('div', 'df-glossary-variants');
    box.appendChild(make('span', 'df-glossary-label', 'Also defined as'));
    var ul = make('ul');
    variants.forEach(function (v) {
      var li = make('li');
      mixed(li.appendChild(make('span', 'df-glossary-variant')), v.text);
      li.appendChild(document.createTextNode(' on '));
      v.pages.forEach(function (page, i) {
        if (i) li.appendChild(document.createTextNode(', '));
        li.appendChild(link(page.href, page.title));
      });
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  function render(el, entries, message) {
    var used = new Set(DocForm.all('[id]').filter(function (node) { return !el.contains(node); })
      .map(function (node) { return node.id; }));
    el.classList.add('df-glossary');
    el.setAttribute('data-df-no-autolink', '');
    el.setAttribute('data-df-no-outline', '');
    el.textContent = '';
    if (message) {
      var note = el.appendChild(make('p', 'df-glossary-notice', message));
      note.setAttribute('role', 'note');
    }
    if (!entries.length) {
      el.appendChild(make('p', 'df-glossary-empty', 'No glossary terms yet.'));
      return;
    }
    var list = groups(entries);
    var ids = {};
    list.forEach(function (g) {
      ids[g.letter] = DocForm.uniqueSlug('glossary-' + (g.letter === OTHER ? 'other' : DocForm.slug(g.letter) || 'letter'), used);
    });

    var bar = el.appendChild(make('nav', 'df-glossary-jumps'));
    bar.setAttribute('aria-label', 'Glossary letters');
    jumps(list).forEach(function (j) {
      if (j.present) {
        var a = bar.appendChild(link('#' + ids[j.letter], j.letter));
        a.className = 'df-glossary-jump';
        if (j.letter === OTHER) a.setAttribute('aria-label', 'Other terms');
      } else {
        var span = bar.appendChild(make('span', 'df-glossary-jump is-empty', j.letter));
        span.setAttribute('aria-hidden', 'true');
      }
    });

    list.forEach(function (g) {
      var section = el.appendChild(make('section', 'df-glossary-group'));
      var heading = section.appendChild(make('h2', 'df-glossary-letter', g.letter === OTHER ? 'Other' : g.letter));
      heading.id = ids[g.letter];
      var dl = section.appendChild(make('dl', 'df-glossary-list'));
      g.entries.forEach(function (e) {
        var dt = mixed(dl.appendChild(make('dt', 'df-glossary-term')), e.title);
        dt.id = DocForm.uniqueSlug('term-' + (DocForm.slug(e.key) || 'entry'), used);
        var dd = dl.appendChild(make('dd', 'df-glossary-entry'));
        mixed(dd.appendChild(make('p', 'df-glossary-text')), e.text);
        if (e.more && DocForm.tooltip && DocForm.tooltip.rich) DocForm.tooltip.rich(dd.appendChild(make('div', 'df-glossary-more')), e.more);
        if (e.variants.length) dd.appendChild(variantsBlock(e.variants));
        if (e.uses.length) dd.appendChild(usesLine(e.uses));
      });
    });
  }

  DocForm.glossary = {
    merge: merge,
    groups: groups,
    jumps: jumps,
    letter: letter,
    notice: notice,
    render: render
  };

  DocForm.register('glossary', function (site) {
    var holders = DocForm.all('[data-df-glossary]');
    if (!holders.length) return;
    if (!DocForm.tooltip) DocForm.warnOnce('glossary-tooltip', 'glossary.js needs tooltip.js for the manifest glossary.');
    var terms = DocForm.tooltip ? DocForm.tooltip.glossary(site.glossary) : {};
    var draw = function (pages) {
      var entries = merge(terms, pages);
      var message = notice(pages);
      holders.forEach(function (el) { render(el, entries, message); });
      // A link to a letter or term arrives before the list exists, so the browser could not scroll to it.
      var target = null;
      try {
        target = document.getElementById(decodeURIComponent(String(root.location.hash).slice(1)));
      } catch (e) {
        // Keep the page where it is.
      }
      if (target && holders.some(function (el) { return el.contains(target); })) target.scrollIntoView({ block: 'start' });
    };
    if (DocForm.search) DocForm.search.pages(draw);
    else draw(null);
  });
})(typeof window !== 'undefined' ? window : globalThis);
