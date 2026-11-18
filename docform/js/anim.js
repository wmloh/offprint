(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] anim.js needs core.js loaded before it.');
    return;
  }

  var EPS = 1e-6;
  var KINDS = ['draw', 'fade', 'move', 'attr'];
  var NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;

  function cubicIn(p) { return p * p * p; }
  function cubicOut(p) { return 1 - Math.pow(1 - p, 3); }
  function cubicInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  var EASINGS = {
    linear: function (p) { return p; },
    'ease-in': cubicIn,
    'ease-out': cubicOut,
    'ease-in-out': cubicInOut,
    ease: cubicInOut,
    'back-out': function (p) { var c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
  };

  function easing(name) {
    if (typeof name === 'function') return name;
    if (EASINGS[name]) return EASINGS[name];
    DocForm.warnOnce('easing:' + name, 'Unknown easing "' + name + '"; using ease. Choose one of ' + Object.keys(EASINGS).join(', ') + '.');
    return EASINGS.ease;
  }

  function round(n) {
    return Math.round(n * 1000) / 1000;
  }

  // Interpolates numbers, arrays of numbers, or strings whose numbers line up (such as "M 0 0 L 10 5").
  function lerp(a, b, p) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * p;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      return a.map(function (x, i) { return lerp(x, b[i], p); });
    }
    if (typeof a === 'string' && typeof b === 'string') {
      var na = a.match(NUM) || [];
      var nb = b.match(NUM) || [];
      if (na.length === nb.length && na.length) {
        var i = 0;
        return b.replace(NUM, function () {
          var v = round(lerp(parseFloat(na[i]), parseFloat(nb[i]), p));
          i++;
          return String(v);
        });
      }
    }
    return p < 1 ? a : b;
  }

  function kindOf(action) {
    for (var i = 0; i < KINDS.length; i++) if (action[KINDS[i]] !== undefined) return KINDS[i];
    return null;
  }

  // Lays steps end to end. Each step is { caption, duration, easing, actions } or an array of actions.
  function timeline(steps, options) {
    options = options || {};
    var duration = options.duration == null ? 800 : options.duration;
    var ease = options.easing || 'ease';
    var t = 0;
    var ends = [];
    var captions = [];
    var actions = [];
    (steps || []).forEach(function (step, i) {
      if (Array.isArray(step)) step = { actions: step };
      var list = step.actions || [];
      var length = list.length ? 0 : (step.duration == null ? duration / 2 : step.duration);
      list.forEach(function (action) {
        var delay = action.delay || 0;
        var span = action.duration != null ? action.duration : step.duration != null ? step.duration : duration;
        actions.push({ action: action, kind: kindOf(action), step: i, start: t + delay, end: t + delay + span,
          easing: easing(action.easing || step.easing || ease) });
        length = Math.max(length, delay + span);
      });
      t += length;
      ends.push(t);
      captions.push(step.caption || '');
    });
    return { ends: ends, total: t, captions: captions, actions: actions };
  }

  // Maps a time to completed steps, the step being shown (finished or in progress), and progress within it.
  function locate(ends, t) {
    var done = 0;
    while (done < ends.length && ends[done] <= t + EPS) done++;
    var start = done ? ends[done - 1] : 0;
    if (done === ends.length || t <= start + EPS) return { done: done, current: done, progress: done ? 1 : 0 };
    return { done: done, current: done + 1, progress: (t - start) / (ends[done] - start) };
  }

  // Fills missing from/to values along one property's actions, which must be sorted by start time.
  function chain(track, initial) {
    var prev;
    track.forEach(function (a) {
      var spec = a.action;
      var kind = a.kind;
      var to = spec.to;
      if (to === undefined) to = kind === 'draw' || kind === 'fade' ? 1 : prev === undefined ? initial : prev;
      var from = spec.from;
      if (from === undefined) {
        if (prev !== undefined) from = prev;
        else if (kind === 'draw' || kind === 'fade') from = to > 0 ? 0 : 1;
        else from = initial;
      }
      a.from = from;
      a.to = to;
      prev = to;
    });
    return track;
  }

  function value(track, t) {
    var v = track[0].from;
    for (var i = 0; i < track.length && track[i].start <= t + EPS; i++) {
      var a = track[i];
      var span = a.end - a.start;
      var p = span > 0 ? Math.min(1, Math.max(0, (t - a.start) / span)) : 1;
      v = lerp(a.from, a.to, a.easing(p));
    }
    return v;
  }

  function apply(el, kind, prop, v) {
    if (kind === 'draw') {
      if (v >= 1 - EPS) {
        el.style.strokeDasharray = '';
        el.style.strokeDashoffset = '';
      } else {
        el.style.strokeDasharray = '1 2';
        el.style.strokeDashoffset = String(round(1 - v));
      }
    } else if (kind === 'fade') {
      el.style.opacity = String(round(v));
    } else if (kind === 'move') {
      el.style.translate = round(v[0]) + 'px ' + round(v[1]) + 'px';
    } else {
      el.setAttribute(prop, typeof v === 'number' ? String(round(v)) : String(v));
    }
  }

  function tracks(figure, tl) {
    var map = new Map();
    tl.actions.forEach(function (a) {
      if (!a.kind) {
        DocForm.warnOnce('anim-kind:' + JSON.stringify(a.action), 'An animation action needs one of ' + KINDS.join(', ') + '.');
        return;
      }
      var selector = a.action[a.kind];
      var targets = DocForm.all(selector, figure);
      if (!targets.length) DocForm.warnOnce('anim-target:' + figure.id + selector, 'Animation "' + figure.id + '" has no element matching "' + selector + '".');
      var prop = a.kind === 'attr' ? a.action.name : a.kind;
      if (a.kind === 'attr' && !prop) {
        DocForm.warnOnce('anim-attr:' + selector, 'An attr action on "' + selector + '" needs a name.');
        return;
      }
      targets.forEach(function (el) {
        var key = a.kind + ':' + prop;
        var byEl = map.get(el) || {};
        map.set(el, byEl);
        (byEl[key] = byEl[key] || []).push(Object.assign({}, a));
      });
    });
    var list = [];
    map.forEach(function (byEl, el) {
      Object.keys(byEl).forEach(function (key) {
        var track = byEl[key].sort(function (x, y) { return x.start - y.start; });
        var kind = track[0].kind;
        var prop = key.slice(kind.length + 1);
        var initial = kind === 'move' ? [0, 0] : kind === 'attr' ? authored(el, prop) : 1;
        if (kind === 'draw') el.setAttribute('pathLength', '1');
        list.push({ el: el, kind: kind, prop: prop, track: chain(track, initial) });
      });
    });
    return list;
  }

  function authored(el, name) {
    var raw = el.getAttribute(name);
    if (raw === null) return 0;
    return /^\s*-?(?:\d+\.?\d*|\.\d+)\s*$/.test(raw) ? parseFloat(raw) : raw;
  }

  var ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="currentColor">';
  var ICONS = {
    prev: ICON + '<path d="M3 3h1.6v10H3zM13 3.2v9.6L6 8z"/></svg>',
    next: ICON + '<path d="M11.4 3H13v10h-1.6zM3 3.2v9.6L10 8z"/></svg>',
    play: ICON + '<path d="M4 2.5v11L13 8z"/></svg>',
    pause: ICON + '<path d="M4 3h3v10H4zM9 3h3v10H9z"/></svg>'
  };

  function button(cls, label, icon) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'df-anim-btn ' + cls;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = icon;
    return b;
  }

  function setup(figure, steps, options, ctl) {
    var tl = timeline(steps, options);
    var list = tracks(figure, tl);
    var hold = options.hold == null ? 700 : options.hold;
    var intro = options.caption || '';
    var stepDriven = !!figure.closest('.df-figure-steps');
    var t = 0;
    var playing = false;
    var frame = 0;
    var timer = 0;
    var target = null;

    figure.classList.add('df-anim');
    var controls = document.createElement('div');
    controls.className = 'df-anim-controls';
    var prev = button('df-anim-prev', 'Previous step', ICONS.prev);
    var play = button('df-anim-play', 'Play', ICONS.play);
    var next = button('df-anim-next', 'Next step', ICONS.next);
    var scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.className = 'df-anim-scrub';
    scrub.min = '0';
    scrub.max = String(tl.total);
    scrub.step = 'any';
    scrub.setAttribute('aria-label', 'Animation position');
    var counter = document.createElement('span');
    counter.className = 'df-anim-count';
    var caption = document.createElement('div');
    caption.className = 'df-anim-caption';
    caption.setAttribute('aria-live', 'polite');
    [prev, play, next, scrub, counter].forEach(function (el) { controls.appendChild(el); });

    var svg = figure.querySelector('svg');
    var after = svg && svg.parentNode === figure ? svg.nextSibling : figure.querySelector('figcaption');
    figure.insertBefore(controls, after);
    figure.insertBefore(caption, controls.nextSibling);
    var shown = -1;

    function render() {
      list.forEach(function (item) { apply(item.el, item.kind, item.prop, value(item.track, t)); });
      var at = locate(tl.ends, t);
      scrub.value = String(t);
      counter.textContent = at.current + ' / ' + tl.ends.length;
      if (at.current !== shown) {
        shown = at.current;
        var text = at.current ? tl.captions[at.current - 1] : intro;
        if (DocForm.math && DocForm.math.mixed) caption.innerHTML = DocForm.math.mixed(text);
        else caption.textContent = text;
        caption.hidden = !text;
        if (typeof root.CustomEvent === 'function') {
          figure.dispatchEvent(new root.CustomEvent('df:animstep', { detail: { step: at.current, done: at.done } }));
        }
      }
      prev.disabled = t <= EPS;
      next.disabled = t >= tl.total - EPS;
      play.innerHTML = playing ? ICONS.pause : ICONS.play;
      play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      play.title = play.getAttribute('aria-label');
      figure.classList.toggle('is-playing', playing);
    }

    function stop() {
      root.cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = 0;
      timer = 0;
      target = null;
      playing = false;
    }

    function seek(time) {
      t = Math.max(0, Math.min(tl.total, time));
      render();
    }

    // Moves time forwards or backwards to `goal` at normal speed, then calls done.
    function run(goal, done) {
      target = goal;
      var last = null;
      function tick(now) {
        if (last === null) last = now;
        var dt = now - last;
        t = goal >= t ? Math.min(goal, t + dt) : Math.max(goal, t - dt);
        last = now;
        render();
        if (Math.abs(t - goal) > EPS) frame = root.requestAnimationFrame(tick);
        else {
          frame = 0;
          target = null;
          if (done) done();
        }
      }
      frame = root.requestAnimationFrame(tick);
    }

    function nextEnd(from) {
      for (var i = 0; i < tl.ends.length; i++) if (tl.ends[i] > from + EPS) return tl.ends[i];
      return tl.total;
    }

    function prevEnd(from) {
      for (var i = tl.ends.length - 1; i >= 0; i--) if (tl.ends[i] < from - EPS) return tl.ends[i];
      return 0;
    }

    function playOn() {
      if (!playing) return;
      if (t >= tl.total - EPS) {
        playing = false;
        render();
        return;
      }
      run(nextEnd(t), function () {
        if (!playing) return;
        if (t >= tl.total - EPS) playOn();
        else timer = setTimeout(playOn, hold);
      });
    }

    ctl.play = function () {
      if (playing) return;
      stop();
      if (t >= tl.total - EPS) seek(0);
      playing = true;
      render();
      playOn();
    };
    ctl.pause = function () {
      stop();
      render();
    };
    ctl.next = function () {
      var from = target !== null ? target : t;
      stop();
      if (from > t + EPS) seek(from);
      run(nextEnd(t));
      render();
    };
    ctl.prev = function () {
      stop();
      seek(prevEnd(t));
    };
    ctl.go = function (step) {
      stop();
      seek(stepTime(tl.ends, step));
    };
    // Animates to the end of `step`, playing only the last step when it would cross several.
    ctl.to = function (step) {
      var route = path(tl.ends, t, step);
      stop();
      if (Math.abs(route.start - t) > EPS) seek(route.start);
      run(route.goal);
      render();
    };
    ctl.seek = function (time) {
      stop();
      seek(time);
    };
    ctl.figure = figure;
    ctl.svg = svg;
    ctl.timeline = tl;
    Object.defineProperty(ctl, 'time', { get: function () { return t; } });
    Object.defineProperty(ctl, 'step', { get: function () { return locate(tl.ends, t).done; } });

    // A mouse or pen crossing a stopped figure plays it; pressing Pause holds it until the pointer leaves.
    var held = false;
    figure.addEventListener('pointerenter', function (event) {
      if (hoverPlays({ playing: playing, held: held, pointer: event.pointerType, stepDriven: stepDriven })) {
        ctl.play();
      }
    });
    figure.addEventListener('pointerleave', function () { held = false; });
    play.addEventListener('click', function () {
      if (playing) {
        held = true;
        ctl.pause();
      } else ctl.play();
    });
    next.addEventListener('click', ctl.next);
    prev.addEventListener('click', ctl.prev);
    scrub.addEventListener('input', function () { ctl.seek(parseFloat(scrub.value)); });
    render();

    var auto = options.autoplay != null ? options.autoplay : DocForm.flag(figure, 'autoplay');
    if (auto && !stepDriven && typeof root.IntersectionObserver === 'function') {
      var seen = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        seen.disconnect();
        if (t <= EPS && !playing) ctl.play();
      }, { threshold: 0.5 });
      seen.observe(figure);
    }
  }

  // Touch is left out: a tap on Play would otherwise start the figure on entry and pause it on click.
  function hoverPlays(s) {
    return !s.playing && !s.held && !s.stepDriven && (s.pointer === 'mouse' || s.pointer === 'pen');
  }

  function stepTime(ends, step) {
    return step <= 0 || !ends.length ? 0 : ends[Math.min(step, ends.length) - 1];
  }

  // Where an animated move to the end of `step` starts and stops: forwards from the end of the step before it,
  // backwards from the end of the step after it, or from `t` when that is already closer.
  function path(ends, t, step) {
    var goal = stepTime(ends, step);
    var start = t;
    if (goal > t + EPS) start = Math.max(t, stepTime(ends, step - 1));
    else if (goal < t - EPS) start = Math.min(t, stepTime(ends, step + 1));
    return { start: start, goal: goal };
  }

  // Builds a step-timeline animation on the figure with this id (or element). Safe to call before the DOM is ready.
  function anim(id, steps, options) {
    options = options || {};
    var ctl = {};
    ['play', 'pause', 'next', 'prev', 'go', 'to', 'seek'].forEach(function (name) { ctl[name] = function () {}; });
    function start() {
      var figure = typeof id === 'string' ? document.getElementById(id) : id;
      if (!figure) {
        DocForm.warnOnce('anim:' + id, 'No animation figure with id "' + id + '".');
        return;
      }
      setup(figure, steps, options, ctl);
      controllers.set(figure, ctl);
    }
    var ready = typeof id !== 'string' || document.getElementById(id);
    if (ready || document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start);
    return ctl;
  }

  var controllers = new WeakMap();

  anim.get = function (figure) { return controllers.get(figure) || null; };
  anim.easings = EASINGS;
  anim.easing = easing;
  anim.lerp = lerp;
  anim.timeline = timeline;
  anim.locate = locate;
  anim.chain = chain;
  anim.value = value;
  anim.stepTime = stepTime;
  anim.path = path;
  anim.hoverPlays = hoverPlays;
  DocForm.anim = anim;
})(typeof window !== 'undefined' ? window : globalThis);
