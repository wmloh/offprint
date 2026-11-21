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
  var UNTAGGED = '';
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

  // Merges the normalized manifest glossary ({ key: { title, text, more, tags } }) with indexed pages
  // ([{ href, title, sections, terms }], or null without an index) into sorted entries:
  // { key, title, text, more, manifest, tags, variants: [{ text, tags, pages: [{ title, href }] }],
  //   uses: [{ title, href, intro, sections: [{ id, title, href }] }] }.
  // Inline tips are keyed by their underlined text, case-insensitively. A manifest definition always comes first;
  // an inline-only term takes the first definition found. Other differing definitions become variants.
  // An entry's tags are every tag given anywhere for it, manifest tags first; a variant also keeps its own.
  function merge(terms, pages) {
    var byKey = {};
    var list = [];

    function entry(key, title) {
      if (!hasOwn.call(byKey, key)) {
        byKey[key] = { key: key, title: title, text: '', more: '', manifest: false, tags: [], variants: [], uses: [],
          norm: null };
        list.push(byKey[key]);
      }
      return byKey[key];
    }

    function addTags(list, tags) {
      (tags || []).forEach(function (tag) {
        if (list.indexOf(tag) < 0) list.push(tag);
      });
    }

    function define(e, text, page, tags) {
      var norm = same(text);
      addTags(e.tags, tags);
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
      if (!variant) e.variants.push(variant = { text: clean(text), tags: [], pages: [] });
      addTags(variant.tags, tags);
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
      define(e, source.text, null, source.tags);
    });

    (pages || []).forEach(function (page) {
      (page.terms || []).forEach(function (record) {
        if (!record || typeof record.text !== 'string') return;
        // An index built before glossary tags has no tags on tips and still holds tips on tags and controls, which
        // are not glossary entries; its tips are skipped until it is rebuilt.
        if (typeof record.tip === 'string') {
          if (!Array.isArray(record.tags)) return;
          var key = DocForm._termKey(record.text);
          if (!key) return;
          var e = entry(key, clean(record.text));
          define(e, record.tip, page, record.tags.map(DocForm._termKey));
          use(e, page, record.section || '');
        } else if (typeof record.term === 'string') {
          // data-df-term only reads the manifest, so a use of any other name is a missing term.
          var known = byKey[DocForm._termKey(record.term)];
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
        'docform/tools/assets.html to add definitions written on pages and links to where each term is used.';
    }
    if (pages.length && pages.every(function (p) { return !p.terms; })) {
      return 'Showing the manifest glossary only: the search index has no glossary data. Build it again with ' +
        'docform/tools/assets.html to add definitions written on pages and links to where each term is used.';
    }
    var untaggedIndex = pages.some(function (p) {
      return (p.terms || []).some(function (r) { return r && typeof r.tip === 'string' && !Array.isArray(r.tags); });
    });
    if (untaggedIndex) {
      return 'Showing the manifest glossary and term uses only: the search index was built before glossary tags, so ' +
        'definitions written on pages are left out. Build it again with docform/tools/assets.html to add them.';
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
    var tooltip = DocForm._tooltips;
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
    var targets = uses.flatMap(function (group) {
      return group.intro || !group.sections.length ? [group].concat(group.sections) : group.sections;
    });
    targets.forEach(function (target, i) {
      if (i) p.appendChild(document.createTextNode(' · '));
      p.appendChild(link(target.href, target.title));
    });
    return p;
  }

  function variantsBlock(variants, chip) {
    var box = make('div', 'df-glossary-variants');
    box.appendChild(make('span', 'df-glossary-label', 'Also defined as'));
    var ul = make('ul');
    variants.forEach(function (v) {
      var li = make('li');
      mixed(li.appendChild(make('span', 'df-glossary-variant')), v.text);
      if (chip && v.tags.length) {
        var line = li.appendChild(make('span', 'df-glossary-tags'));
        v.tags.forEach(function (key) { line.appendChild(chip(key)); });
      }
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

  // A circle tag with its registry tip as a tooltip; one shared tooltip box per tag.
  function tagWithTip(key, registry, cards, tagName) {
    var tooltip = DocForm._tooltips;
    var chip = tooltip.tagChip(key === UNTAGGED ? null : key, registry, tagName);
    var tag = key === UNTAGGED ? null : registry.glossary[key];
    var tip = tag ? tag.tip : 'No glossary tag yet. Give the term tags in the site settings or with data-df-tip-tags.';
    if (!cards[key]) cards[key] = tooltip.card('', tip, '');
    tooltip.attach(chip, '', tip, { card: cards[key], focusable: tagName !== 'button' ? false : undefined });
    return chip;
  }

  // The tag keys of entries the registry knows, with unknown keys (from an index built with older settings) dropped.
  function entryTags(entries, registry) {
    var known = registry.glossary;
    entries.forEach(function (e) {
      [e].concat(e.variants).forEach(function (item) {
        item.tags = (item.tags || []).filter(function (key) {
          if (hasOwn.call(known, key)) return true;
          DocForm._warnOnce('glossary-tag:' + key, 'Glossary tag "' + key + '" is not in options.tags.glossary; hiding it.');
          return false;
        });
      });
    });
  }

  // Whether an entry passes the tag filter: any selected tag, or "Untagged" for an entry without tags.
  function matches(entry, selected) {
    if (!selected.size) return true;
    if (!entry.tags.length) return selected.has(UNTAGGED);
    return entry.tags.some(function (tag) { return selected.has(tag); });
  }

  // Filter tags in registry order, with a count of matching entries each, plus "Untagged" when any entry has none.
  function filterTags(entries, registry) {
    var counts = Object.create(null);
    var untagged = 0;
    entries.forEach(function (e) {
      if (!e.tags.length) untagged++;
      e.tags.forEach(function (tag) { counts[tag] = (counts[tag] || 0) + 1; });
    });
    var out = Object.keys(registry.glossary).filter(function (key) { return counts[key]; })
      .map(function (key) { return { key: key, count: counts[key] }; });
    if (untagged) out.push({ key: UNTAGGED, count: untagged });
    return out;
  }

  function filterBar(el, entries, registry, cards, apply) {
    var tags = filterTags(entries, registry);
    if (!tags.length) return;
    var bar = el.appendChild(make('div', 'df-glossary-filter'));
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Filter terms by tag');
    bar.appendChild(make('span', 'df-glossary-label', 'Filter by tag'));
    var selected = new Set();
    var buttons = [];
    var status = make('span', 'df-glossary-status');
    status.setAttribute('aria-live', 'polite');
    var clear = make('button', 'df-glossary-clear', 'Show all');
    clear.type = 'button';
    clear.hidden = true;
    var update = function () {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(selected.has(b._dfTag))); });
      var shown = apply(selected);
      clear.hidden = !selected.size;
      status.textContent = selected.size ? 'Showing ' + shown + ' of ' + entries.length + ' terms' : '';
    };
    tags.forEach(function (t) {
      var button = tagWithTip(t.key, registry, cards, 'button');
      button.type = 'button';
      button.classList.add('df-glossary-chip');
      button._dfTag = t.key;
      button.appendChild(make('span', 'df-glossary-count', String(t.count)));
      button.addEventListener('click', function () {
        if (selected.has(t.key)) selected.delete(t.key);
        else selected.add(t.key);
        update();
      });
      buttons.push(bar.appendChild(button));
    });
    clear.addEventListener('click', function () {
      selected.clear();
      update();
    });
    bar.appendChild(clear);
    bar.appendChild(status);
    update();
  }

  function render(el, entries, message, registry) {
    if (typeof el === 'string') el = DocForm._component.target(el, 'glossary', true);
    if (!el) return;
    registry = registry || (DocForm._site && DocForm._site.tags) || { glossary: {} };
    var tagged = !!DocForm._tooltips && !!DocForm._tooltips.tagChip;
    if (tagged) entryTags(entries, registry);
    var cards = Object.create(null);
    var used = new Set(DocForm._all('[id]').filter(function (node) { return !el.contains(node); })
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
      ids[g.letter] = DocForm.util.uniqueSlug('glossary-' + (g.letter === OTHER ? 'other' : DocForm.util.slug(g.letter) || 'letter'), used);
    });

    var rows = [];
    var sections = {};
    var letters = {};
    if (tagged) filterBar(el, entries, registry, cards, function (selected) {
      var shown = 0;
      var visible = {};
      rows.forEach(function (row) {
        var on = matches(row.entry, selected);
        row.dt.hidden = row.dd.hidden = !on;
        if (on) {
          shown++;
          visible[row.letter] = true;
        }
      });
      Object.keys(sections).forEach(function (l) {
        sections[l].hidden = !visible[l];
        var jump = letters[l];
        if (!jump) return;
        jump.classList.toggle('is-empty', !visible[l]);
        if (visible[l]) jump.removeAttribute('tabindex');
        else jump.tabIndex = -1;
        jump.setAttribute('aria-disabled', String(!visible[l]));
      });
      return shown;
    });

    var bar = el.appendChild(make('nav', 'df-glossary-jumps'));
    bar.setAttribute('aria-label', 'Glossary letters');
    jumps(list).forEach(function (j) {
      if (j.present) {
        var a = bar.appendChild(link('#' + ids[j.letter], j.letter));
        a.className = 'df-glossary-jump';
        letters[j.letter] = a;
        if (j.letter === OTHER) a.setAttribute('aria-label', 'Other terms');
      } else {
        var span = bar.appendChild(make('span', 'df-glossary-jump is-empty', j.letter));
        span.setAttribute('aria-hidden', 'true');
      }
    });

    list.forEach(function (g) {
      var section = sections[g.letter] = el.appendChild(make('section', 'df-glossary-group'));
      var heading = section.appendChild(make('h2', 'df-glossary-letter', g.letter === OTHER ? 'Other' : g.letter));
      heading.id = ids[g.letter];
      var dl = section.appendChild(make('dl', 'df-glossary-list'));
      g.entries.forEach(function (e) {
        var dt = dl.appendChild(make('dt', 'df-glossary-term'));
        mixed(dt.appendChild(make('span', 'df-glossary-title')), e.title);
        dt.id = DocForm.util.uniqueSlug('term-' + (DocForm.util.slug(e.key) || 'entry'), used);
        if (tagged) {
          var tagLine = dt.appendChild(make('span', 'df-glossary-tags'));
          (e.tags.length ? e.tags : [UNTAGGED]).forEach(function (key) { tagLine.appendChild(tagWithTip(key, registry, cards)); });
        }
        var dd = dl.appendChild(make('dd', 'df-glossary-entry'));
        rows.push({ entry: e, dt: dt, dd: dd, letter: g.letter });
        mixed(dd.appendChild(make('p', 'df-glossary-text')), e.text);
        if (e.more && DocForm._tooltips && DocForm._tooltips.rich) DocForm._tooltips.rich(dd.appendChild(make('div', 'df-glossary-more')), e.more);
        if (e.variants.length) {
          dd.appendChild(variantsBlock(e.variants, tagged && function (key) { return tagWithTip(key, registry, cards); }));
        }
        if (e.uses.length) dd.appendChild(usesLine(e.uses));
      });
    });
  }

  DocForm._glossary = {
    merge: merge,
    groups: groups,
    jumps: jumps,
    letter: letter,
    matches: matches,
    filterTags: filterTags,
    notice: notice,
    render: render
  };

  DocForm.register('glossary', function (site) {
    var holders = DocForm._all('[data-df-glossary]').filter(function (el) {
      return !DocForm._boot || DocForm._component.flag(el, 'glossary', 'glossary');
    });
    if (!holders.length) return;
    if (!DocForm._tooltips) DocForm._warnOnce('glossary-tooltip', 'glossary.js needs tooltip.js for the manifest glossary.');
    var terms = DocForm._tooltips ? DocForm._tooltips.glossary(site.glossary, site.tags) : {};
    var draw = function (pages) {
      var entries = merge(terms, pages);
      var message = notice(pages);
      holders.forEach(function (el) { render(el, entries, message, site.tags); });
      // A link to a letter or term arrives before the list exists, so the browser could not scroll to it.
      var target = null;
      try {
        target = document.getElementById(decodeURIComponent(String(root.location.hash).slice(1)));
      } catch (e) {
        // Keep the page where it is.
      }
      if (target && holders.some(function (el) { return el.contains(target); })) target.scrollIntoView({ block: 'start' });
    };
    if (DocForm._search) DocForm._search.pages(draw);
    else draw(null);
  });
})(typeof window !== 'undefined' ? window : globalThis);
