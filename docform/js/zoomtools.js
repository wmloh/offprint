// Presentation tools for the zoom view of zoom.js: a frosted pill with a cursor (the default), a magnifier lens, a
// laser pointer, pen and highlighter ink, and a crosshair that reads chart and timeline axes.
// Letters pick tools while a figure is zoomed. Closing the view discards the ink and returns to the cursor.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] zoomtools.js needs core.js loaded before it.');
    return;
  }

  var NS = 'http://www.w3.org/2000/svg';
  var ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    cursor: '<path d="M4 2.5l8.5 6-3.9.7 2.2 4.1-1.5.8-2.2-4.2L4 12.6z" fill="currentColor" stroke="none"/>',
    magnifier: '<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4L14 14"/>',
    laser: '<circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="5.5" opacity="0.5"/>',
    pen: '<path d="M11 2.5L13.5 5l-8 8H3v-2.5z"/><path d="M9.5 4l2.5 2.5"/>',
    highlighter: '<path d="M9.5 2.5L13 6l-5 5H4.5V7.5z"/><path d="M3 14h10" stroke-width="2.2" opacity="0.6"/>',
    crosshair: '<circle cx="8" cy="8" r="4.5"/><path d="M8 1.5v3.5M8 11v3.5M1.5 8H5M11 8h3.5"/>',
    ruler: '<rect x="1.5" y="5" width="13" height="6" rx="1"/><path d="M4.5 5v2.5M7.5 5v2M10.5 5v2.5"/>',
    undo: '<path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.5 6.5H10a3.5 3.5 0 010 7H7"/>',
    clear: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/>'
  };
  var TOOLS = [
    { id: 'cursor', label: 'Cursor', key: 'v' },
    { id: 'magnifier', label: 'Magnifier', key: 'm' },
    { id: 'laser', label: 'Laser pointer', key: 'l' },
    { id: 'pen', label: 'Pen', key: 'p' },
    { id: 'highlighter', label: 'Highlighter', key: 'h' },
    { id: 'measure', label: 'Crosshair', key: 'c' }
  ];
  var COLORS = ['red', 'blue', 'green', 'yellow', 'purple'];
  var INK = { pen: { color: 'red', width: 3, opacity: 1 }, highlighter: { color: 'yellow', width: 18, opacity: 0.4 } };
  var ZOOM = { min: 1.5, max: 6, step: 1.25, start: 2.5 };
  var LENS = 180;
  var TRAIL_MS = 320;
  // Attributes a clone must not keep: they name other elements, join form groups, or run code.
  var DROP = { name: 1, for: 1, form: 1, autofocus: 1, 'aria-labelledby': 1, 'aria-describedby': 1, 'aria-controls': 1,
    'aria-owns': 1, 'aria-activedescendant': 1, 'aria-details': 1, 'aria-errormessage': 1, 'aria-flowto': 1 };

  var colors = { pen: INK.pen.color, highlighter: INK.highlighter.color };
  var session = null;
  var clones = 0;

  function toolOf(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return null;
  }

  // One step of magnification in or out (delta < 0 zooms in, as a wheel scrolled up), kept within the bounds.
  function magnify(zoom, delta) {
    var next = delta < 0 ? zoom * ZOOM.step : delta > 0 ? zoom / ZOOM.step : zoom;
    return Math.round(Math.max(ZOOM.min, Math.min(ZOOM.max, next)) * 100) / 100;
  }

  // The trail points younger than ms, each with an alpha that fades from 1 to 0 with age.
  function trail(points, now, ms) {
    return points.filter(function (p) { return now - p.t < ms; }).map(function (p) {
      return { x: p.x, y: p.y, t: p.t, alpha: 1 - (now - p.t) / ms };
    });
  }

  function pathOf(points) {
    if (!points.length) return '';
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ',' + p[1]; }).join('');
    return points.length === 1 ? d + 'l0.01,0' : d;
  }

  // Shift keeps a ruler horizontal or vertical, whichever is closer.
  function snap(a, b) {
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  }

  function measure(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return { dx: dx, dy: dy, length: Math.sqrt(dx * dx + dy * dy) };
  }

  function round1(v) {
    return (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  function rulerText(m, unit) {
    return round1(m.length) + ' ' + unit + ' (Δx ' + round1(Math.abs(m.dx)) + ', Δy ' + round1(Math.abs(m.dy)) + ')';
  }

  // Tool state, kept apart from the DOM. Every zoom view starts from a fresh state.
  function createState() {
    return { tool: 'cursor', zoom: ZOOM.start, strokes: [], stroke: null, colors: { pen: colors.pen, highlighter: colors.highlighter } };
  }

  function select(state, id) {
    if (!toolOf(id) || state.tool === id) return false;
    if (state.stroke) end(state);
    state.tool = id;
    return true;
  }

  function isInk(id) {
    return id === 'pen' || id === 'highlighter';
  }

  function begin(state, x, y) {
    if (!isInk(state.tool)) return null;
    var ink = INK[state.tool];
    state.stroke = { tool: state.tool, color: state.colors[state.tool], width: ink.width, opacity: ink.opacity, points: [[x, y]] };
    return state.stroke;
  }

  // Adds a point at least 1.5px from the last one; returns whether it was added.
  function extend(state, x, y) {
    var s = state.stroke;
    if (!s) return false;
    var last = s.points[s.points.length - 1];
    if (Math.abs(x - last[0]) < 1.5 && Math.abs(y - last[1]) < 1.5) return false;
    s.points.push([x, y]);
    return true;
  }

  function end(state) {
    var s = state.stroke;
    state.stroke = null;
    if (s) state.strokes.push(s);
    return s;
  }

  function undo(state) {
    return state.strokes.pop() || null;
  }

  function clear(state) {
    var n = state.strokes.length;
    state.strokes = [];
    state.stroke = null;
    return n;
  }

  // Readies a deep clone, not yet in the document, to show beside its original: ids gain a prefix and references to
  // them follow, attributes that would link or group it with other elements go, and it is hidden from assistive tech
  // and input.
  function prepareClone(node, prefix) {
    var all = [node].concat(Array.prototype.slice.call(node.querySelectorAll('*')));
    var ids = Object.create(null);
    all.forEach(function (el) {
      var id = el.getAttribute('id');
      if (id) ids[id] = prefix + id;
    });
    var ref = function (value) {
      return value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, function (m, q, id) {
        return ids[id] ? 'url(#' + ids[id] + ')' : m;
      });
    };
    all.forEach(function (el) {
      if (el.tagName && el.tagName.toLowerCase() === 'script') {
        el.parentNode.removeChild(el);
        return;
      }
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var name = a.name.toLowerCase();
        var value = a.value;
        if (name === 'id') el.setAttribute(a.name, ids[value]);
        else if (DROP[name] || name.slice(0, 2) === 'on') el.removeAttribute(a.name);
        else if ((name === 'href' || name === 'xlink:href') && value.charAt(0) === '#' && ids[value.slice(1)]) {
          el.setAttribute(a.name, '#' + ids[value.slice(1)]);
        } else if (value.indexOf('url(') >= 0) {
          el.setAttribute(a.name, ref(value));
        }
      });
    });
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('inert', '');
    return node;
  }

  // Decides when the lens re-clones: after a change to the figure or when its size changes.
  function lensSync(make) {
    var dirty = true;
    var size = null;
    return {
      mark: function () { dirty = true; },
      frame: function (w, h) {
        if (!dirty && size && size[0] === w && size[1] === h) return false;
        dirty = false;
        size = [w, h];
        make();
        return true;
      }
    };
  }

  // ---- DOM ----

  function make(tag, className, parent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    return el;
  }

  function svg(tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  function button(className, label, icon, parent) {
    var b = make('button', className, parent);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    if (icon) b.innerHTML = ICON + ICONS[icon] + '</svg>';
    return b;
  }

  function hostsWithAPI(target, cls, api) {
    if (!api || typeof api.get !== 'function') return [];
    var hosts = DocForm.all('.' + cls, target);
    if (target.classList.contains(cls)) hosts.unshift(target);
    return hosts.filter(function (host) { return !!api.get(host); });
  }

  function start(detail) {
    if (session) stop();
    var overlay = detail.overlay;
    var target = detail.target;
    var s = {
      overlay: overlay, target: target, state: createState(), pointer: null, frame: 0, trail: [], ruler: null,
      charts: hostsWithAPI(target, 'df-chart', DocForm.chart),
      timelines: hostsWithAPI(target, 'df-timeline', DocForm.timeline),
      observer: null, clone: null, buttons: {}, swatches: []
    };
    s.crosshair = s.timelines.length > 0 || s.charts.length > 0;
    s.presentationOnly = target.classList.contains('df-sequence') || target.classList.contains('df-tree-diagram');
    session = s;

    s.layer = svg('svg', { class: 'df-zoomtools-layer', 'aria-hidden': 'true', focusable: 'false' });
    s.inkGroup = svg('g', { class: 'df-zoomtools-ink' }, s.layer);
    s.trailGroup = svg('g', { class: 'df-zoomtools-trail' }, s.layer);
    s.measureGroup = svg('g', { class: 'df-zoomtools-measure' }, s.layer);
    s.lens = make('div', 'df-zoomtools-lens');
    s.lens.setAttribute('aria-hidden', 'true');
    s.lens.hidden = true;
    s.view = make('div', 'df-zoomtools-lens-view', s.lens);
    s.dot = make('div', 'df-zoomtools-laser');
    s.dot.setAttribute('aria-hidden', 'true');
    s.dot.hidden = true;
    s.readout = make('div', 'df-zoomtools-readout');
    s.readout.setAttribute('aria-hidden', 'true');
    s.readout.hidden = true;

    var pill = s.pill = make('div', 'df-zoomtools');
    pill.setAttribute('role', 'toolbar');
    pill.setAttribute('aria-label', 'Presentation tools');
    s.shortcuts = [];
    function bind(id, key, label, run, when) {
      var name = 'zoom-tools.' + id;
      s.shortcuts.push(DocForm.shortcuts.register({
        id: name, key: key, label: label, scope: overlay, active: function () { return true; },
        exactShift: true, when: when, run: run
      }));
      return name;
    }
    TOOLS.forEach(function (t) {
      if (t.id === 'measure' && s.presentationOnly) return;
      var icon = t.id === 'measure' ? (s.crosshair ? 'crosshair' : 'ruler') : t.id;
      var label = t.id === 'measure' && !s.crosshair ? 'Ruler' : t.label;
      var b = button('df-zoomtools-btn', label, icon, pill);
      b.setAttribute('aria-label', label);
      DocForm._shortcutHint(b, bind(t.id, t.key, label, function () { choose(t.id); }), label);
      b.setAttribute('data-tool', t.id);
      b.addEventListener('click', function () { choose(t.id); });
      s.buttons[t.id] = b;
    });
    s.zoomText = make('span', 'df-zoomtools-zoom', pill);
    var canMagnify = function () { return s.state.tool === 'magnifier'; };
    var zoomOut = bind('zoom-out', '[', 'Decrease magnification', function () {
      setZoom(magnify(s.state.zoom, 1));
    }, canMagnify);
    var zoomIn = bind('zoom-in', ']', 'Increase magnification', function () {
      setZoom(magnify(s.state.zoom, -1));
    }, canMagnify);
    var zoomKeys = DocForm.shortcuts.keys(zoomOut).concat(DocForm.shortcuts.keys(zoomIn));
    s.zoomText.title = 'Scroll to change magnification' + (zoomKeys.length ? ' (' + zoomKeys.join(' / ') + ')' : '');
    s.inkTools = make('div', 'df-zoomtools-group', pill);
    s.swatchBox = make('div', 'df-zoomtools-swatches', s.inkTools);
    s.swatchBox.setAttribute('role', 'group');
    s.swatchBox.setAttribute('aria-label', 'Ink colour');
    COLORS.forEach(function (c) {
      var b = button('df-zoomtools-swatch', c.charAt(0).toUpperCase() + c.slice(1), null, s.swatchBox);
      b.style.setProperty('--df-swatch', 'var(--df-' + c + ')');
      b.setAttribute('data-color', c);
      b.addEventListener('click', function () {
        if (!isInk(s.state.tool)) return;
        s.state.colors[s.state.tool] = colors[s.state.tool] = c;
        refresh();
      });
      s.swatches.push(b);
    });
    function undoInk() { if (undo(s.state)) drawInk(); refresh(); }
    s.undo = button('df-zoomtools-btn', 'Undo', 'undo', s.inkTools);
    s.undo.setAttribute('aria-label', 'Undo');
    DocForm._shortcutHint(s.undo, bind('undo', ['Control+Z', 'Meta+Z'], 'Undo ink', undoInk, function () {
      return s.state.strokes.length > 0;
    }), 'Undo');
    s.undo.addEventListener('click', undoInk);
    s.clear = button('df-zoomtools-btn', 'Clear ink', 'clear', s.inkTools);
    s.clear.addEventListener('click', function () { clear(s.state); drawInk(); refresh(); });

    s.onMove = function (event) { move(event.clientX, event.clientY, event); };
    s.onLeave = function () { s.pointer = null; hidePointer(); };
    s.onScroll = function () {
      if (s.pointer && s.state.tool === 'measure' && s.crosshair) crosshair(s.pointer.x, s.pointer.y);
    };
    s.onWheel = function (event) {
      if (s.state.tool !== 'magnifier') return;
      event.preventDefault();
      setZoom(magnify(s.state.zoom, event.deltaY));
    };
    s.onDown = function (event) { down(event); };
    s.onInput = function () { if (s.sync) s.sync.mark(); };
    overlay.addEventListener('pointermove', s.onMove);
    overlay.addEventListener('pointerleave', s.onLeave);
    overlay.addEventListener('scroll', s.onScroll, true);
    overlay.addEventListener('wheel', s.onWheel, { passive: false });
    s.layer.addEventListener('pointerdown', s.onDown);
    target.addEventListener('input', s.onInput);
    target.addEventListener('change', s.onInput);

    overlay.appendChild(s.layer);
    overlay.appendChild(s.lens);
    overlay.appendChild(s.dot);
    overlay.appendChild(s.readout);
    overlay.appendChild(s.pill);
    refresh();
  }

  function stop() {
    var s = session;
    if (!s) return;
    session = null;
    if (s.frame) root.cancelAnimationFrame(s.frame);
    watch(s, false);
    s.overlay.removeEventListener('pointermove', s.onMove);
    s.overlay.removeEventListener('pointerleave', s.onLeave);
    s.overlay.removeEventListener('scroll', s.onScroll, true);
    s.overlay.removeEventListener('wheel', s.onWheel, { passive: false });
    s.target.removeEventListener('input', s.onInput);
    s.target.removeEventListener('change', s.onInput);
    s.shortcuts.forEach(function (remove) { remove(); });
    [s.layer, s.lens, s.dot, s.readout, s.pill].forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    TOOLS.forEach(function (t) { s.overlay.classList.remove('is-tool-' + t.id); });
    s.overlay.classList.remove('is-tool-ruler');
  }

  function choose(id) {
    var s = session;
    if (!s || !select(s.state, id)) return;
    s.trail = [];
    s.ruler = null;
    s.trailGroup.textContent = '';
    s.measureGroup.textContent = '';
    hidePointer();
    watch(s, id === 'magnifier');
    refresh();
    if (s.pointer) move(s.pointer.x, s.pointer.y, null);
  }

  function refresh() {
    var s = session;
    var tool = s.state.tool;
    TOOLS.forEach(function (t) {
      s.overlay.classList.toggle('is-tool-' + t.id, t.id === tool);
      if (s.buttons[t.id]) s.buttons[t.id].setAttribute('aria-pressed', String(t.id === tool));
    });
    s.overlay.classList.toggle('is-tool-ruler', tool === 'measure' && !s.crosshair);
    s.zoomText.hidden = tool !== 'magnifier';
    s.zoomText.textContent = s.state.zoom.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '×';
    var ink = isInk(tool);
    s.inkTools.hidden = !ink && !s.state.strokes.length;
    s.swatchBox.hidden = !ink;
    s.swatches.forEach(function (b) {
      b.setAttribute('aria-pressed', String(ink && s.state.colors[tool] === b.getAttribute('data-color')));
    });
    s.undo.disabled = !s.state.strokes.length;
    s.clear.disabled = !s.state.strokes.length;
  }

  function setZoom(z) {
    var s = session;
    if (z === s.state.zoom) return;
    s.state.zoom = z;
    refresh();
    wake();
  }

  function hidePointer() {
    var s = session;
    s.lens.hidden = true;
    s.dot.hidden = true;
    if (!(s.state.tool === 'measure' && s.ruler)) {
      s.readout.hidden = true;
      if (s.state.tool === 'measure') s.measureGroup.textContent = '';
    }
  }

  function move(x, y, event) {
    var s = session;
    if (!s) return;
    s.pointer = { x: x, y: y };
    var tool = s.state.tool;
    if (tool === 'laser') {
      s.dot.hidden = false;
      s.dot.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      s.trail.push({ x: x, y: y, t: now() });
      wake();
    } else if (tool === 'magnifier') {
      wake();
    } else if (tool === 'measure') {
      if (s.crosshair) crosshair(x, y);
      else if (s.ruler && s.ruler.active) dragRuler(x, y, event && event.shiftKey);
    } else if (isInk(tool) && s.state.stroke && event) {
      var points = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      if (!points.length) points = [event];
      var added = false;
      points.forEach(function (p) { added = extend(s.state, p.clientX, p.clientY) || added; });
      if (added) s.strokePath.setAttribute('d', pathOf(s.state.stroke.points));
    }
  }

  function now() {
    return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now();
  }

  function wake() {
    var s = session;
    if (s && !s.frame) s.frame = root.requestAnimationFrame(loop);
  }

  // Each frame moves the lens and fades the laser trail; it stops when neither needs another frame.
  function loop() {
    var s = session;
    if (!s) return;
    s.frame = 0;
    var again = false;
    if (s.state.tool === 'magnifier') {
      lens();
      again = true;
    }
    if (s.trail.length) {
      drawTrail();
      again = again || s.trail.length > 0;
    }
    if (again) s.frame = root.requestAnimationFrame(loop);
  }

  function drawTrail() {
    var s = session;
    s.trail = trail(s.trail, now(), TRAIL_MS);
    s.trailGroup.textContent = '';
    for (var i = 1; i < s.trail.length; i++) {
      var a = s.trail[i - 1];
      var b = s.trail[i];
      svg('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        'stroke-width': (2 + 7 * b.alpha).toFixed(1), 'stroke-opacity': (0.55 * b.alpha).toFixed(2)
      }, s.trailGroup);
    }
  }

  // The magnifier observes the figure only while it is the chosen tool.
  function watch(s, on) {
    if (s.observer) {
      s.observer.disconnect();
      s.observer = null;
    }
    if (!on) {
      s.sync = null;
      s.view.textContent = '';
      s.clone = null;
      return;
    }
    s.sync = lensSync(function () { s.clone = cloneInto(s.view, s.target); });
    if (typeof root.MutationObserver === 'function') {
      s.observer = new root.MutationObserver(function () { s.sync.mark(); });
      s.observer.observe(s.target, { attributes: true, childList: true, subtree: true, characterData: true });
    }
  }

  // Copies what a deep clone leaves out: current form values, canvas pixels, and scroll offsets.
  function cloneInto(view, target) {
    var clone = prepareClone(target.cloneNode(true), 'df-lens-' + (++clones) + '-');
    var rect = target.getBoundingClientRect();
    clone.style.boxSizing = 'border-box';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';
    clone.style.margin = '0';
    var from = DocForm.all('input, select, textarea, canvas', target);
    var to = DocForm.all('input, select, textarea, canvas', clone);
    from.forEach(function (el, i) {
      var copy = to[i];
      if (!copy || copy.tagName !== el.tagName) return;
      if (el.tagName === 'CANVAS') {
        try { copy.getContext('2d').drawImage(el, 0, 0); } catch (e) { /* a tainted or 3D canvas stays blank */ }
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        copy.checked = el.checked;
      } else {
        copy.value = el.value;
      }
    });
    view.textContent = '';
    view.appendChild(clone);
    clone.scrollTop = target.scrollTop;
    clone.scrollLeft = target.scrollLeft;
    return clone;
  }

  function lens() {
    var s = session;
    var p = s.pointer;
    var rect = s.target.getBoundingClientRect();
    if (!p || p.x < rect.left || p.x > rect.right || p.y < rect.top || p.y > rect.bottom) {
      s.lens.hidden = true;
      return;
    }
    s.sync.frame(Math.round(rect.width), Math.round(rect.height));
    if (s.clone && (s.clone.scrollTop !== s.target.scrollTop || s.clone.scrollLeft !== s.target.scrollLeft)) {
      s.clone.scrollTop = s.target.scrollTop;
      s.clone.scrollLeft = s.target.scrollLeft;
    }
    var r = LENS / 2;
    var z = s.state.zoom;
    s.lens.hidden = false;
    s.lens.style.transform = 'translate(' + (p.x - r) + 'px, ' + (p.y - r) + 'px)';
    s.view.style.transform = 'translate(' + (r - (p.x - rect.left) * z) + 'px, ' + (r - (p.y - rect.top) * z) + 'px) scale(' + z + ')';
  }

  function crosshair(x, y) {
    var s = session;
    var hit = null;
    var rows;
    for (var i = 0; i < s.timelines.length && !hit; i++) {
      hit = DocForm._timeline.coords(s.timelines[i], x, y);
      if (hit) rows = [[hit.label, hit.value], ['Lane', hit.lane]];
    }
    for (var j = 0; j < s.charts.length && !hit; j++) {
      var api = DocForm.chart.get(s.charts[j]);
      hit = api && api.coords(x, y);
      if (hit) {
        var model = api.model();
        rows = [[model.x.label || 'x', hit.xText], [model.y.label || 'y', hit.yText]];
      }
    }
    s.measureGroup.textContent = '';
    if (!hit) {
      s.readout.hidden = true;
      return;
    }
    var g = hit.plot;
    svg('line', { x1: x, x2: x, y1: g.top, y2: g.bottom }, s.measureGroup);
    svg('line', { x1: g.left, x2: g.right, y1: y, y2: y }, s.measureGroup);
    s.readout.textContent = '';
    rows.forEach(function (row) {
      var line = make('div', '', s.readout);
      make('span', '', line).textContent = row[0];
      make('b', '', line).textContent = row[1];
    });
    place(x + 14, y + 14);
  }

  // Puts the readout below and right of a point, flipping it to stay inside the window.
  function place(x, y) {
    var s = session;
    s.readout.hidden = false;
    var w = s.readout.offsetWidth;
    var h = s.readout.offsetHeight;
    if (x + w > root.innerWidth - 8) x = Math.max(8, x - w - 28);
    if (y + h > root.innerHeight - 8) y = Math.max(8, y - h - 28);
    s.readout.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }

  // The units a ruler reads in: an SVG's own units, an image's pixels, or CSS pixels elsewhere.
  function frameAt(target, x, y) {
    var inside = function (el) {
      var r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    var found = DocForm.all('svg, img', target).filter(function (el) {
      return !(el.tagName.toLowerCase() === 'svg' && el.parentNode && el.parentNode.closest && el.parentNode.closest('svg')) && inside(el);
    });
    if (target.tagName === 'IMG' && inside(target)) found.push(target);
    var el = found[found.length - 1];
    if (el && el.tagName === 'IMG' && el.naturalWidth) {
      var r = el.getBoundingClientRect();
      var k = el.naturalWidth / r.width;
      return { unit: 'image px', at: function (px, py) { return { x: (px - r.left) * k, y: (py - r.top) * k }; } };
    }
    var m = el && el.tagName.toLowerCase() === 'svg' && typeof el.getScreenCTM === 'function' && el.getScreenCTM();
    if (m && typeof root.DOMPoint === 'function') {
      var inv = m.inverse();
      return { unit: 'units', at: function (px, py) { var q = new root.DOMPoint(px, py).matrixTransform(inv); return { x: q.x, y: q.y }; } };
    }
    return { unit: 'px', at: function (px, py) { return { x: px, y: py }; } };
  }

  function down(event) {
    var s = session;
    if (!s || event.button !== 0) return;
    var tool = s.state.tool;
    if (isInk(tool)) {
      var stroke = begin(s.state, event.clientX, event.clientY);
      s.strokePath = inkPath(stroke);
    } else if (tool === 'measure' && !s.crosshair) {
      s.ruler = { a: { x: event.clientX, y: event.clientY }, b: { x: event.clientX, y: event.clientY }, active: true,
        frame: frameAt(s.target, event.clientX, event.clientY) };
      drawRuler();
    } else {
      return;
    }
    event.preventDefault();
    if (typeof s.layer.setPointerCapture === 'function') s.layer.setPointerCapture(event.pointerId);
    var up = function () {
      s.layer.removeEventListener('pointerup', up);
      s.layer.removeEventListener('pointercancel', up);
      if (session !== s) return;
      if (s.state.stroke) {
        end(s.state);
        refresh();
      }
      if (s.ruler) s.ruler.active = false;
    };
    s.layer.addEventListener('pointerup', up);
    s.layer.addEventListener('pointercancel', up);
  }

  function inkPath(stroke) {
    var path = svg('path', {
      d: pathOf(stroke.points), 'stroke-width': stroke.width, 'stroke-opacity': stroke.opacity, class: 'is-' + stroke.tool
    }, session.inkGroup);
    // Presentation attributes do not take var(), so the colour is a style.
    path.style.stroke = 'var(--df-' + stroke.color + ')';
    return path;
  }

  function drawInk() {
    var s = session;
    s.inkGroup.textContent = '';
    s.state.strokes.forEach(function (stroke) { inkPath(stroke); });
  }

  function dragRuler(x, y, straight) {
    var s = session;
    var b = { x: x, y: y };
    s.ruler.b = straight ? snap(s.ruler.a, b) : b;
    drawRuler();
  }

  function drawRuler() {
    var s = session;
    var r = s.ruler;
    s.measureGroup.textContent = '';
    svg('line', { x1: r.a.x, y1: r.a.y, x2: r.b.x, y2: r.b.y }, s.measureGroup);
    [r.a, r.b].forEach(function (p) { svg('circle', { cx: p.x, cy: p.y, r: 3.5 }, s.measureGroup); });
    var m = measure(r.frame.at(r.a.x, r.a.y), r.frame.at(r.b.x, r.b.y));
    s.readout.textContent = rulerText(m, r.frame.unit);
    place((r.a.x + r.b.x) / 2 + 12, (r.a.y + r.b.y) / 2 + 12);
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (DocForm._boot) {
      DocForm.zoom.subscribe(function (current) { if (current) start(current); });
      document.addEventListener('df:zoom:closing', stop);
    } else {
      document.addEventListener('df:zoomopen', function (event) { if (event.detail) start(event.detail); });
      document.addEventListener('df:zoomclose', stop);
    }
  }

  DocForm.zoomTools = {
    tools: TOOLS.map(function (t) { return t.id; }),
    colors: COLORS.slice(),
    limits: { min: ZOOM.min, max: ZOOM.max, start: ZOOM.start },
    magnify: magnify,
    trail: trail,
    pathOf: pathOf,
    snap: snap,
    measure: measure,
    rulerText: rulerText,
    createState: createState,
    select: select,
    begin: begin,
    extend: extend,
    end: end,
    undo: undo,
    clear: clear,
    prepareClone: prepareClone,
    lensSync: lensSync,
    // The tool chosen in the open zoom view, or null when no view is open.
    active: function () { return session ? session.state.tool : null; },
    // Chooses a tool in the open zoom view; returns false when none is open or the name is unknown.
    use: function (id) {
      if (!session || !Object.hasOwn(session.buttons, id)) return false;
      choose(id);
      return true;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
