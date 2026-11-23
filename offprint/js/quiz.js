// Quiz stacks: collapsed cards that expand into one-question-at-a-time quizzes with optional stopwatch, hints,
// per-question feedback, and a results card with a switchable bar chart. Question formats are registered types.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] quiz.js needs core.js loaded before it.');
    return;
  }

  var MAX_QUESTIONS = 8;
  var FEEDBACK = ['end', 'question', 'none'];
  var MATCHES = ['trim', 'nocase', 'exact', 'regex'];
  var BLANK = /\[\[([A-Za-z0-9_-]+)\]\]/g;
  var types = Object.create(null);
  var mounted = new WeakMap();

  // ---- Model: pure functions shared by the runtime and tests ----

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function fail(where, message) {
    throw new Error(where + ': ' + message);
  }

  function text(value, where, name, optional) {
    if (value === undefined && optional) return '';
    if (typeof value !== 'string' || (!optional && !value.trim())) fail(where, name + ' must be nonempty text.');
    return value;
  }

  function tagList(value, where) {
    if (value === undefined) return [];
    var list = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(list) || list.some(function (tag) { return typeof tag !== 'string' || !tag.trim(); })) {
      fail(where, 'tags must be a string or a list of nonempty strings.');
    }
    return list.map(function (tag) { return tag.trim(); });
  }

  function textList(value, where, name) {
    if (value === undefined) return [];
    var list = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(list) || list.some(function (item) { return typeof item !== 'string' || !item.trim(); })) {
      fail(where, name + ' must be text or a list of nonempty text.');
    }
    return list;
  }

  function shuffleSetting(value, where) {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return { questions: value, options: value };
    if (!isObject(value)) fail(where, 'shuffle must be true, false, or {questions, options, retry}.');
    var out = {};
    ['questions', 'options', 'retry'].forEach(function (key) {
      if (value[key] === undefined) return;
      if (typeof value[key] !== 'boolean') fail(where, 'shuffle.' + key + ' must be true or false.');
      out[key] = value[key];
    });
    return out;
  }

  // Settings cascade stack -> quiz -> question; each layer only overrides what it states.
  function settings(source, where, parent) {
    var out = Object.assign({}, parent);
    if (source.feedback !== undefined) {
      if (FEEDBACK.indexOf(source.feedback) < 0) fail(where, 'feedback must be "end", "question", or "none".');
      out.feedback = source.feedback;
    }
    ['explanations', 'stopwatch', 'hints', 'results'].forEach(function (key) {
      if (source[key] === undefined) return;
      if (typeof source[key] !== 'boolean') fail(where, key + ' must be true or false.');
      out[key] = source[key];
    });
    if (source.hintPenalty !== undefined) {
      if (typeof source.hintPenalty !== 'number' || !(source.hintPenalty >= 0 && source.hintPenalty <= 1)) {
        fail(where, 'hintPenalty must be a number from 0 to 1.');
      }
      out.hintPenalty = source.hintPenalty;
    }
    if (source.scoring !== undefined) {
      if (source.scoring !== 'partial' && source.scoring !== 'all') fail(where, 'scoring must be "partial" or "all".');
      out.scoring = source.scoring;
    }
    var shuffle = shuffleSetting(source.shuffle, where);
    if (shuffle) out.shuffle = Object.assign({}, parent && parent.shuffle, shuffle);
    return out;
  }

  var DEFAULTS = { feedback: 'end', explanations: true, stopwatch: false, hints: true, hintPenalty: 0,
    scoring: 'partial', results: true, shuffle: { questions: false, options: false, retry: true } };

  function normalizeQuestion(input, where, inherited, number) {
    if (typeof input === 'string') fail(where, 'a question must be an object.');
    if (!isObject(input)) fail(where, 'a question must be an object.');
    var type = input.type === undefined ? 'single' : input.type;
    var def = types[type];
    if (!def) fail(where, 'unknown question type "' + type + '". Register it with OffPrint.quiz.defineType.');
    var question = {
      id: input.id === undefined ? 'q' + number : text(String(input.id), where, 'id'),
      type: type,
      prompt: text(input.prompt, where, 'prompt', true),
      tags: tagList(input.tags, where),
      hints: textList(input.hint, where, 'hint'),
      explanation: text(input.explanation, where, 'explanation', true),
      settings: settings(input, where, inherited),
      source: input
    };
    var extra = def.normalize ? def.normalize(input, function (message) { fail(where, message); }) : {};
    question.data = extra || {};
    return question;
  }

  // Accepts one quiz ({questions}) or a stack ({quizzes}); returns a frozen-shape stack.
  function normalize(input) {
    if (!isObject(input)) fail('Quiz', 'expected a JSON object with questions or quizzes.');
    var single = !Array.isArray(input.quizzes);
    if (single && !Array.isArray(input.questions)) fail('Quiz', 'expected a questions list or a quizzes list.');
    var base = settings(input, 'Quiz', DEFAULTS);
    var list = single ? [input] : input.quizzes;
    if (!list.length) fail('Quiz', 'a stack needs at least one quiz.');
    var used = new Set();
    var quizzes = list.map(function (quiz, q) {
      var where = 'Quiz ' + (q + 1);
      if (!isObject(quiz) || !Array.isArray(quiz.questions) || !quiz.questions.length) {
        fail(where, 'needs a nonempty questions list.');
      }
      var own = single ? base : settings(quiz, where, base);
      var tags = tagList(quiz.tags, where);
      var draw = quiz.draw;
      if (draw !== undefined && (!Number.isInteger(draw) || draw < 1 || draw > Math.min(MAX_QUESTIONS, quiz.questions.length))) {
        fail(where, 'draw must be a whole number from 1 to ' + Math.min(MAX_QUESTIONS, quiz.questions.length) + '.');
      }
      if (draw === undefined && quiz.questions.length > MAX_QUESTIONS) {
        fail(where, 'has ' + quiz.questions.length + ' questions; use at most ' + MAX_QUESTIONS +
          ' or set draw to sample from the bank.');
      }
      var ids = new Set();
      var questions = quiz.questions.map(function (item, i) {
        var question = normalizeQuestion(item, where + ', question ' + (i + 1), own, i + 1);
        if (ids.has(question.id)) fail(where, 'duplicate question id "' + question.id + '".');
        ids.add(question.id);
        question.tags = tags.concat(question.tags.filter(function (tag) { return tags.indexOf(tag) < 0; }));
        return question;
      });
      var id = quiz.id === undefined ? 'quiz' + (q + 1) : String(quiz.id);
      if (used.has(id)) fail(where, 'duplicate quiz id "' + id + '".');
      used.add(id);
      return {
        id: id,
        title: text(single ? input.title : quiz.title, where, 'title', true) || (list.length > 1 ? 'Quiz ' + (q + 1) : ''),
        description: text(single ? undefined : quiz.description, where, 'description', true),
        tags: tags, draw: draw || questions.length, settings: own, questions: questions
      };
    });
    var allTags = [];
    var layers = [single ? [] : tagList(input.tags, 'Quiz')].concat(quizzes.map(function (quiz) { return quiz.tags; }));
    layers.forEach(function (list) {
      list.forEach(function (tag) { if (allTags.indexOf(tag) < 0) allTags.push(tag); });
    });
    return {
      title: text(input.title, 'Quiz', 'title', true),
      description: text(input.description, 'Quiz', 'description', true),
      tags: allTags, settings: base, quizzes: quizzes,
      count: quizzes.reduce(function (sum, quiz) { return sum + quiz.draw; }, 0)
    };
  }

  function random(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, rand) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var swap = out[i]; out[i] = out[j]; out[j] = swap;
    }
    return out;
  }

  function range(n) {
    return Array.from({ length: n }, function (_, i) { return i; });
  }

  // One attempt: the questions drawn for each quiz, in order, with each type's option order.
  function plan(stack, rand, retry) {
    return stack.quizzes.map(function (quiz) {
      var shuffle = quiz.settings.shuffle;
      var reorder = function (on) { return on && (!retry || shuffle.retry !== false); };
      var indices = range(quiz.questions.length);
      if (quiz.draw < indices.length) indices = shuffled(indices, rand).slice(0, quiz.draw).sort(function (a, b) { return a - b; });
      if (reorder(quiz.settings.shuffle.questions)) indices = shuffled(indices, rand);
      return {
        quiz: quiz,
        items: indices.map(function (index) {
          var question = quiz.questions[index];
          var def = types[question.type];
          var mix = reorder(question.settings.shuffle.options);
          return { question: question, order: def.order ? def.order(question, mix ? rand : null, rand) : null };
        })
      };
    });
  }

  function clamp(value) {
    return typeof value === 'number' && isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }

  function scoreOf(question, answer, hintsUsed) {
    var raw = clamp(types[question.type].score(question, answer));
    if (question.settings.scoring === 'all') raw = raw === 1 ? 1 : 0;
    var penalty = Math.max(0, 1 - (question.settings.hintPenalty || 0) * (hintsUsed || 0));
    return { raw: raw, score: raw * penalty };
  }

  function mean(values) {
    return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : 0;
  }

  // Groups per-question records into the results chart views.
  function aggregate(records, quizzes) {
    var tags = [];
    records.forEach(function (record) {
      record.tags.forEach(function (tag) { if (tags.indexOf(tag) < 0) tags.push(tag); });
    });
    function byTag(pick) {
      return tags.map(function (tag) {
        var matched = records.filter(function (record) { return record.tags.indexOf(tag) >= 0; });
        return { label: tag, value: mean(matched.map(pick)), count: matched.length };
      });
    }
    return {
      time: records.map(function (record) { return { label: record.label, value: record.time / 1000 }; }),
      quiz: quizzes.map(function (quiz) {
        var matched = records.filter(function (record) { return record.quiz === quiz.id; });
        return { label: quiz.title || quiz.id, value: 100 * mean(matched.map(function (r) { return r.score; })), count: matched.length };
      }),
      tagScore: byTag(function (record) { return 100 * record.score; }),
      tagTime: byTag(function (record) { return record.time / 1000; }),
      total: {
        score: mean(records.map(function (r) { return r.score; })),
        full: records.filter(function (r) { return r.score === 1; }).length,
        count: records.length,
        time: records.reduce(function (sum, r) { return sum + r.time; }, 0),
        hints: records.reduce(function (sum, r) { return sum + r.hints; }, 0)
      }
    };
  }

  function clock(ms) {
    var seconds = Math.floor(Math.max(0, ms) / 1000);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor(seconds / 60) % 60;
    var s = seconds % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
  }

  function blankText(value, mode) {
    var out = String(value == null ? '' : value);
    if (mode === 'exact') return out;
    out = out.trim().replace(/\s+/g, ' ');
    return mode === 'nocase' ? out.toLowerCase() : out;
  }

  function blankCorrect(blank, value) {
    if (blank.options) return value === blank.answer[0];
    if (value == null || String(value).trim() === '') return false;
    return blank.answer.some(function (accepted) {
      if (blank.match === 'regex') return new RegExp('^(?:' + accepted + ')$').test(String(value).trim());
      return blankText(value, blank.match) === blankText(accepted, blank.match);
    });
  }

  // ---- Built-in types ----

  function normalizeOptions(input, fail, multiple) {
    if (!Array.isArray(input.options) || input.options.length < 2) fail('needs at least two options.');
    var options = input.options.map(function (option, i) {
      if (typeof option === 'string' && option.trim()) return { html: option, correct: false, why: '' };
      if (!isObject(option) || typeof option.text !== 'string' || !option.text.trim()) {
        fail('option ' + (i + 1) + ' must be text or {text, correct?, why?}.');
      }
      if (option.correct !== undefined && typeof option.correct !== 'boolean') fail('option ' + (i + 1) + ' correct must be true or false.');
      if (option.why !== undefined && typeof option.why !== 'string') fail('option ' + (i + 1) + ' why must be text.');
      return { html: option.text, correct: !!option.correct, why: option.why || '' };
    });
    var correct = options.filter(function (option) { return option.correct; }).length;
    if (multiple ? correct < 1 : correct !== 1) {
      fail(multiple ? 'mark at least one option correct.' : 'mark exactly one option correct with "correct": true.');
    }
    return { options: options };
  }

  function optionOrder(question, mix) {
    var indices = range(question.data.options.length);
    return mix ? shuffled(indices, mix) : indices;
  }

  function choiceType(multiple) {
    return {
      normalize: function (input, fail) { return normalizeOptions(input, fail, multiple); },
      order: optionOrder,
      answered: function (q, answer) { return multiple ? Array.isArray(answer) && answer.length > 0 : answer != null; },
      score: function (q, answer) {
        var options = q.data.options;
        if (!multiple) return answer != null && options[answer] && options[answer].correct ? 1 : 0;
        var picked = Array.isArray(answer) ? answer : [];
        var total = options.filter(function (o) { return o.correct; }).length;
        var hits = picked.filter(function (i) { return options[i] && options[i].correct; }).length;
        return Math.max(0, (hits - (picked.length - hits)) / total);
      },
      render: function (slot, q, ctx) {
        var name = ctx.uid;
        var list = el('div', 'op-quiz-options' + (multiple ? ' is-multiple' : ''), slot);
        list.setAttribute('role', multiple ? 'group' : 'radiogroup');
        var rows = ctx.order.map(function (index) {
          var option = q.data.options[index];
          var row = el('label', 'op-quiz-option', list);
          var input = el('input', 'op-quiz-option-input', row);
          input.type = multiple ? 'checkbox' : 'radio';
          input.name = name;
          input.value = String(index);
          el('span', 'op-quiz-option-mark', row).setAttribute('aria-hidden', 'true');
          markup(el('span', 'op-quiz-option-text', row), option.html);
          var why = el('span', 'op-quiz-option-why', row);
          why.hidden = true;
          if (option.why) markup(why, option.why);
          var pressed = 0;
          row.addEventListener('pointerdown', function (event) {
            pressed = Date.now();
            if (!input.disabled) ripple(row, event);
          });
          input.addEventListener('change', function () {
            if (Date.now() - pressed > 600) ripple(row);
            sync();
            ctx.change(read());
          });
          return { index: index, row: row, input: input, why: why };
        });
        function read() {
          var chosen = rows.filter(function (r) { return r.input.checked; }).map(function (r) { return r.index; });
          return multiple ? chosen.sort(function (a, b) { return a - b; }) : chosen.length ? chosen[0] : null;
        }
        function sync() {
          rows.forEach(function (r) { r.row.classList.toggle('is-chosen', r.input.checked); });
        }
        var start = ctx.answer;
        rows.forEach(function (r) {
          r.input.checked = multiple ? Array.isArray(start) && start.indexOf(r.index) >= 0 : start === r.index;
        });
        sync();
        return {
          lock: function () { rows.forEach(function (r) { r.input.disabled = true; r.row.classList.add('is-locked'); }); },
          reveal: function () {
            rows.forEach(function (r) {
              var option = q.data.options[r.index];
              r.row.classList.toggle('is-correct', option.correct);
              r.row.classList.toggle('is-wrong', r.input.checked && !option.correct);
              r.row.classList.toggle('is-missed', !r.input.checked && option.correct && multiple);
              r.why.hidden = !option.why || !(r.input.checked || option.correct);
            });
          }
        };
      },
      sheet: function (slot, q) {
        var list = el('ol', 'op-quiz-sheet-options', slot);
        list.setAttribute('data-op-no-list-style', '');
        q.data.options.forEach(function (option) { markup(el('li', '', list), option.html); });
        if (multiple) el('p', 'op-quiz-sheet-note', slot, 'Choose all that apply.');
      },
      summary: function (q, answer) {
        var picked = multiple ? answer || [] : answer == null ? [] : [answer];
        return picked.map(function (i) { return plain(q.data.options[i].html); }).join('; ');
      },
      solution: function (q) {
        return q.data.options.filter(function (o) { return o.correct; }).map(function (o) { return plain(o.html); }).join('; ');
      }
    };
  }

  function normalizeFill(input, fail) {
    if (typeof input.text !== 'string' || !input.text.trim()) fail('fill questions need text with [[name]] blanks.');
    if (!isObject(input.blanks)) fail('fill questions need a blanks object keyed by blank name.');
    var names = [];
    input.text.replace(BLANK, function (_, name) {
      if (names.indexOf(name) >= 0) fail('blank "' + name + '" appears more than once.');
      names.push(name);
      return _;
    });
    if (!names.length) fail('text has no [[name]] blanks.');
    var blanks = {};
    names.forEach(function (name) {
      var spec = input.blanks[name];
      var where = 'blank "' + name + '"';
      if (typeof spec === 'string' || Array.isArray(spec)) spec = { answer: spec };
      if (!isObject(spec)) fail(where + ' needs {answer} or {options, answer}.');
      var answer = typeof spec.answer === 'string' ? [spec.answer] : spec.answer;
      if (!Array.isArray(answer) || !answer.length || answer.some(function (a) { return typeof a !== 'string'; })) {
        fail(where + ' needs an answer string or a list of accepted strings.');
      }
      var match = spec.match === undefined ? 'trim' : spec.match;
      if (MATCHES.indexOf(match) < 0) fail(where + ' match must be trim, nocase, exact, or regex.');
      var options = null;
      if (spec.options !== undefined) {
        if (!Array.isArray(spec.options) || spec.options.length < 2 ||
            spec.options.some(function (o) { return typeof o !== 'string'; })) fail(where + ' options must list at least two strings.');
        if (answer.length !== 1 || spec.options.indexOf(answer[0]) < 0) fail(where + ' answer must be one of its options.');
        options = spec.options;
      }
      if (match === 'regex') answer.forEach(function (a) {
        try { new RegExp(a); } catch (error) { fail(where + ' has an invalid pattern: ' + error.message); }
      });
      var width = spec.width === undefined ? null : spec.width;
      if (width !== null && !(Number.isInteger(width) && width > 0 && width <= 80)) fail(where + ' width must be 1 to 80 characters.');
      blanks[name] = { answer: answer, options: options, match: match, width: width };
    });
    Object.keys(input.blanks).forEach(function (name) {
      if (names.indexOf(name) < 0) fail('blank "' + name + '" is not used in text.');
    });
    var code = input.code === undefined ? null : input.code;
    if (code !== null && code !== true && typeof code !== 'string') fail('code must be true or a language name.');
    return { text: input.text, names: names, blanks: blanks, code: code };
  }

  // Fill-in text: [[name]] becomes a dropdown (blank has options) or a text field, in prose or a code block.
  var fillType = {
    normalize: normalizeFill,
    order: function (q, mix) {
      var out = {};
      q.data.names.forEach(function (name) {
        var options = q.data.blanks[name].options;
        if (options) out[name] = mix ? shuffled(options, mix) : options.slice();
      });
      return out;
    },
    answered: function (q, answer) {
      return !!answer && q.data.names.some(function (name) { return answer[name] != null && String(answer[name]).trim() !== ''; });
    },
    score: function (q, answer) {
      var names = q.data.names;
      return names.filter(function (name) { return blankCorrect(q.data.blanks[name], answer && answer[name]); }).length / names.length;
    },
    render: function (slot, q, ctx) {
      var box = fillMarkup(slot, q);
      var fields = {};
      var value = Object.assign({}, ctx.answer || {});
      q.data.names.forEach(function (name) {
        var blank = q.data.blanks[name];
        var hole = box.querySelector('[data-op-quiz-blank="' + name + '"]');
        var field;
        if (blank.options) {
          field = picker(ctx.uid + '-' + name, ctx.order[name], value[name], !!q.data.code, function (picked) {
            value[name] = picked;
            ctx.change(Object.assign({}, value));
          });
        } else {
          field = document.createElement('input');
          field.type = 'text';
          field.className = 'op-quiz-blank';
          field.spellcheck = false;
          field.autocomplete = 'off';
          var width = blank.width || Math.max(4, Math.min(30, Math.max.apply(null, blank.answer.map(function (a) { return a.length; })) + 2));
          field.style.setProperty('--op-quiz-blank-width', width + 'ch');
        }
        (field.trigger || field).setAttribute('aria-label', 'Blank ' + (q.data.names.indexOf(name) + 1));
        if (!blank.options) {
          field.value = value[name] == null ? '' : value[name];
          field.addEventListener('input', function () {
            value[name] = field.value;
            ctx.change(Object.assign({}, value));
          });
        }
        hole.replaceWith(field.el || field);
        if (field.mount) field.mount();
        fields[name] = field;
      });
      return {
        lock: function () {
          Object.keys(fields).forEach(function (name) {
            var field = fields[name];
            if (field.lock) field.lock();
            else field.disabled = true;
          });
        },
        reveal: function () {
          Object.keys(fields).forEach(function (name) {
            var blank = q.data.blanks[name];
            var right = blankCorrect(blank, value[name]);
            var node = fields[name].trigger || fields[name];
            node.classList.toggle('is-correct', right);
            node.classList.toggle('is-wrong', !right);
            if (!right) {
              var fix = document.createElement('span');
              fix.className = 'op-quiz-fix';
              fix.textContent = blank.answer[0];
              (fields[name].el || node).after(fix);
            }
          });
        }
      };
    },
    sheet: function (slot, q) {
      var box = fillMarkup(slot, q);
      q.data.names.forEach(function (name) {
        var blank = q.data.blanks[name];
        var hole = box.querySelector('[data-op-quiz-blank="' + name + '"]');
        hole.className = 'op-quiz-sheet-blank';
        hole.textContent = blank.options ? '[' + blank.options.join(' / ') + ']' : '    ';
      });
    },
    summary: function (q, answer) {
      return q.data.names.map(function (name) { return (answer && answer[name]) || '—'; }).join('; ');
    },
    solution: function (q) {
      return q.data.names.map(function (name) { return q.data.blanks[name].answer[0]; }).join('; ');
    }
  };

  // Inline dropdown blank built on the shared .op-dropdown popover: trigger shows the choice, the panel lists options.
  function picker(id, options, initial, code, onPick) {
    var wrap = el('span', 'op-dropdown op-quiz-picker' + (code ? ' is-code' : ''));
    var trigger = el('button', 'op-quiz-select', wrap);
    trigger.type = 'button';
    trigger.setAttribute('popovertarget', id);
    trigger.setAttribute('aria-haspopup', 'listbox');
    var shown = el('span', 'op-quiz-select-text', trigger);
    var panel = el('div', 'op-dropdown-panel op-quiz-picker-panel' + (code ? ' is-code' : ''), wrap);
    panel.id = id;
    panel.setAttribute('popover', 'auto');
    var list = el('ul', '', panel);
    list.setAttribute('role', 'listbox');
    var current = initial == null ? '' : initial;
    var buttons = options.map(function (option) {
      var item = el('li', '', list);
      var choice = el('button', 'op-quiz-picker-option', item);
      choice.type = 'button';
      choice.setAttribute('role', 'option');
      el('span', 'op-quiz-picker-check', choice).setAttribute('aria-hidden', 'true');
      el('span', '', choice, option);
      choice.addEventListener('click', function () {
        current = option;
        sync();
        ripple(trigger);
        onPick(option);
        trigger.focus({ preventScroll: true });
      });
      return { value: option, node: choice };
    });
    function sync() {
      shown.textContent = current === '' ? 'Choose' : current;
      trigger.classList.toggle('is-empty', current === '');
      buttons.forEach(function (b) { b.node.setAttribute('aria-selected', String(b.value === current)); });
    }
    panel.addEventListener('toggle', function () {
      if (!panel.matches(':popover-open')) return;
      var chosen = buttons.find(function (b) { return b.value === current; }) || buttons[0];
      chosen.node.focus({ preventScroll: true });
    });
    panel.addEventListener('keydown', function (event) {
      var at = buttons.findIndex(function (b) { return b.node === document.activeElement; });
      var next = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 :
        event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      buttons[(next + buttons.length) % buttons.length].node.focus();
    });
    sync();
    return {
      el: wrap, trigger: trigger,
      mount: function () { if (OffPrint._dropdowns) OffPrint._dropdowns.mount(wrap); },
      lock: function () {
        trigger.disabled = true;
        if (panel.matches && panel.matches(':popover-open')) panel.hidePopover();
      }
    };
  }

  function fillMarkup(slot, q) {
    var code = q.data.code;
    var parts = q.data.text.split(BLANK);
    var html = '';
    parts.forEach(function (part, i) {
      if (i % 2) html += '<span data-op-quiz-blank="' + part + '"></span>';
      else if (code) html += code !== true && OffPrint._code && OffPrint._code.language(code) ? OffPrint._code.highlight(part, code) : escape(part);
      else html += part;
    });
    var box;
    if (code) {
      box = el('pre', 'op-quiz-code', slot);
      el('code', '', box).innerHTML = html;
    } else {
      box = el('div', 'op-quiz-fill', slot);
      box.innerHTML = html;
      typeset(box);
    }
    return box;
  }

  // Matching: drag from an item in one column to an item in the other. Pointer only, by design.
  var matchType = {
    normalize: function (input, fail) {
      if (!Array.isArray(input.pairs) || input.pairs.length < 2) fail('match questions need at least two pairs.');
      var pairs = input.pairs.map(function (pair, i) {
        if (!Array.isArray(pair) || pair.length !== 2 || pair.some(function (side) { return typeof side !== 'string' || !side.trim(); })) {
          fail('pair ' + (i + 1) + ' must be [left, right] text.');
        }
        return pair;
      });
      var distractors = textList(input.distractors, 'match', 'distractors');
      return { left: pairs.map(function (p) { return p[0]; }), right: pairs.map(function (p) { return p[1]; }).concat(distractors) };
    },
    order: function (q, mix, rand) {
      return shuffled(range(q.data.right.length), mix || rand);
    },
    answered: function (q, answer) { return !!answer && Object.keys(answer).length > 0; },
    score: function (q, answer) {
      var n = q.data.left.length;
      return range(n).filter(function (i) { return answer && answer[i] === i; }).length / n;
    },
    render: function (slot, q, ctx) {
      var pairs = Object.assign({}, ctx.answer || {});
      var box = el('div', 'op-quiz-match', slot);
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'op-quiz-match-links');
      svg.setAttribute('aria-hidden', 'true');
      box.appendChild(svg);
      var left = el('div', 'op-quiz-match-col is-left', box);
      el('div', 'op-quiz-match-gap', box);
      var right = el('div', 'op-quiz-match-col is-right', box);
      var items = { left: [], right: [] };
      q.data.left.forEach(function (html, i) { items.left.push(item(left, 'left', i, html)); });
      ctx.order.forEach(function (index) { items.right.push(item(right, 'right', index, q.data.right[index])); });
      var locked = false;
      var revealed = false;
      var drag = null;

      function item(col, side, index, html) {
        var node = el('div', 'op-quiz-match-item', col);
        node.setAttribute('data-op-side', side);
        node.setAttribute('data-op-index', String(index));
        markup(el('span', 'op-quiz-match-text', node), html);
        el('span', 'op-quiz-match-dot', node).setAttribute('aria-hidden', 'true');
        node.addEventListener('pointerdown', function (event) {
          if (locked || event.button !== 0) return;
          event.preventDefault();
          node.setPointerCapture(event.pointerId);
          drag = { node: node, side: side, index: index, x: event.clientX, y: event.clientY, moved: false,
            path: path('op-quiz-match-drag') };
          node.classList.add('is-dragging');
          box.classList.add('is-dragging');
          move(event);
        });
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', function (event) { finish(event, true); });
        node.addEventListener('pointercancel', function (event) { finish(event, false); });
        return { node: node, index: index };
      }

      function find(side, index) {
        return items[side].find(function (it) { return it.index === index; }).node;
      }

      function anchor(node, side, frame) {
        var r = node.getBoundingClientRect();
        return { x: (side === 'left' ? r.right : r.left) - frame.left, y: r.top + r.height / 2 - frame.top };
      }

      function curve(a, b) {
        var dx = Math.max(24, Math.abs(b.x - a.x) / 2);
        var dir = b.x >= a.x ? 1 : -1;
        return 'M' + a.x + ' ' + a.y + 'C' + (a.x + dx * dir) + ' ' + a.y + ' ' + (b.x - dx * dir) + ' ' + b.y + ' ' + b.x + ' ' + b.y;
      }

      function path(className) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('class', className);
        svg.appendChild(p);
        return p;
      }

      function target(event) {
        var hit = document.elementFromPoint(event.clientX, event.clientY);
        var node = hit && hit.closest && hit.closest('.op-quiz-match-item');
        return node && box.contains(node) && node.getAttribute('data-op-side') !== drag.side ? node : null;
      }

      function move(event) {
        if (!drag) return;
        if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 4) drag.moved = true;
        var frame = box.getBoundingClientRect();
        var start = anchor(drag.node, drag.side, frame);
        var over = target(event);
        items.left.concat(items.right).forEach(function (it) { it.node.classList.toggle('is-target', it.node === over); });
        var end = over ? anchor(over, drag.side === 'left' ? 'right' : 'left', frame) :
          { x: event.clientX - frame.left, y: event.clientY - frame.top };
        drag.path.setAttribute('d', drag.side === 'left' ? curve(start, end) : curve(end, start));
      }

      function finish(event, commit) {
        if (!drag) return;
        var current = drag;
        var over = commit && current.moved ? target(event) : null;
        drag = null;
        current.path.remove();
        current.node.classList.remove('is-dragging');
        box.classList.remove('is-dragging');
        items.left.concat(items.right).forEach(function (it) { it.node.classList.remove('is-target'); });
        if (!commit) return;
        if (over) {
          var other = Number(over.getAttribute('data-op-index'));
          var l = current.side === 'left' ? current.index : other;
          var r = current.side === 'left' ? other : current.index;
          Object.keys(pairs).forEach(function (key) { if (pairs[key] === r) delete pairs[key]; });
          pairs[l] = r;
        } else if (!current.moved) {
          if (current.side === 'left') delete pairs[current.index];
          else Object.keys(pairs).forEach(function (key) { if (pairs[key] === current.index) delete pairs[key]; });
        } else return;
        draw();
        ctx.change(Object.assign({}, pairs));
      }

      function draw() {
        Array.from(svg.querySelectorAll('.op-quiz-match-link')).forEach(function (p) { p.remove(); });
        var frame = box.getBoundingClientRect();
        svg.setAttribute('viewBox', '0 0 ' + Math.max(1, frame.width) + ' ' + Math.max(1, frame.height));
        var paired = new Set();
        var links = [];
        Object.keys(pairs).forEach(function (key) {
          var l = Number(key);
          links.push({ l: l, r: pairs[key], kind: revealed ? (pairs[key] === l ? 'is-correct' : 'is-wrong') : '' });
          paired.add('left:' + l).add('right:' + pairs[key]);
        });
        if (revealed) q.data.left.forEach(function (_, l) {
          if (pairs[l] !== l) links.push({ l: l, r: l, kind: 'is-missed' });
        });
        links.forEach(function (link) {
          var p = path('op-quiz-match-link ' + link.kind);
          p.setAttribute('d', curve(anchor(find('left', link.l), 'left', frame), anchor(find('right', link.r), 'right', frame)));
        });
        items.left.forEach(function (it) { it.node.classList.toggle('is-paired', paired.has('left:' + it.index)); });
        items.right.forEach(function (it) { it.node.classList.toggle('is-paired', paired.has('right:' + it.index)); });
      }

      if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(box);
      root.requestAnimationFrame(draw);
      return {
        lock: function () { locked = true; box.classList.add('is-locked'); },
        reveal: function () { revealed = true; draw(); },
        redraw: draw
      };
    },
    sheet: function (slot, q) {
      var box = el('div', 'op-quiz-sheet-match', slot);
      var l = el('ol', '', box);
      l.setAttribute('data-op-no-list-style', '');
      q.data.left.forEach(function (html) { markup(el('li', '', l), html); });
      var r = el('ol', '', box);
      r.setAttribute('data-op-no-list-style', '');
      q.data.right.forEach(function (html) { markup(el('li', '', r), html); });
    },
    summary: function (q, answer) {
      return q.data.left.map(function (html, i) {
        return plain(html) + ' → ' + (answer && answer[i] != null ? plain(q.data.right[answer[i]]) : '—');
      }).join('; ');
    },
    solution: function (q) {
      return q.data.left.map(function (html, i) { return plain(html) + ' → ' + plain(q.data.right[i]); }).join('; ');
    }
  };

  function defineType(name, def) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new TypeError('A quiz type needs a lowercase name such as "ordering".');
    }
    if (types[name]) throw new Error('Quiz type "' + name + '" is already defined.');
    if (!def || typeof def.render !== 'function' || typeof def.score !== 'function') {
      throw new TypeError('Quiz type "' + name + '" needs render(slot, question, ctx) and score(question, answer).');
    }
    types[name] = def;
    return true;
  }

  defineType('single', choiceType(false));
  defineType('multi', choiceType(true));
  defineType('fill', fillType);
  defineType('match', matchType);

  // ---- DOM helpers ----

  function el(tag, className, parent, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    if (parent) parent.appendChild(node);
    return node;
  }

  function escape(value) {
    return String(value).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function ripple(node, event) {
    if (OffPrint._choices && OffPrint._choices.ripple) OffPrint._choices.ripple(node, event);
  }

  function typeset(node) {
    if (OffPrint._math && OffPrint._math.render) OffPrint._math.render(node);
  }

  // Quiz text is trusted author HTML, like the page itself.
  function markup(node, html) {
    node.innerHTML = html;
    typeset(node);
    return node;
  }

  function plain(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    return box.textContent.replace(/\s+/g, ' ').trim();
  }

  function button(label, className, parent, onClick) {
    var node = el('button', 'op-button ' + (className || ''), parent, label);
    node.type = 'button';
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  var ICON_CLOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M8 6v3l2 1.5M6.5 2h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  // Tag chips; inline: true renders spans, for use inside buttons.
  function tagsInto(parent, tags, inline) {
    if (!tags.length) return;
    var list = el(inline ? 'span' : 'ul', 'op-quiz-tags', parent);
    if (!inline) list.setAttribute('data-op-no-list-style', '');
    tags.forEach(function (tag) {
      var parts = tag.split(':');
      var item = el(inline ? 'span' : 'li', 'op-quiz-tag', list);
      if (parts.length > 1 && parts[0].trim()) {
        el('span', 'op-quiz-tag-group', item, parts[0].trim());
        item.appendChild(document.createTextNode(parts.slice(1).join(':').trim()));
      } else item.textContent = tag;
    });
  }

  function readInput(host) {
    var name = (host.getAttribute('data-op-quiz') || '').trim();
    if (name) {
      var source = OffPrint.data && OffPrint.data.source && OffPrint.data.source(name);
      if (!source) throw new Error('No named source "' + name + '". Enable data and define the source or its manifest wrapper.');
      return { value: source.snapshot().value, source: source };
    }
    var script = Array.prototype.find.call(host.children, function (child) {
      return child.tagName === 'SCRIPT' && child.type === 'application/json';
    });
    if (!script) throw new Error('Add a direct script[type="application/json"] child or name a source in data-op-quiz.');
    return { value: JSON.parse(script.textContent), source: null };
  }

  function readerCapture() {
    return !!(OffPrint._boot && OffPrint._boot.replaying && !(root.OffPrintExportContext && root.OffPrintExportContext.interactive));
  }

  // ---- Static Reader sheet: questions only, never answers ----

  function sheet(host, stack, number) {
    var card = el('section', 'op-quiz op-quiz-sheet');
    head(card, stack, number);
    stack.quizzes.forEach(function (quiz, q) {
      if (stack.quizzes.length > 1) {
        var heading = el('p', 'op-quiz-sheet-quiz', card);
        el('span', 'op-eyebrow', heading, 'Quiz ' + (q + 1) + ' of ' + stack.quizzes.length);
        el('strong', '', heading, quiz.title);
      }
      var list = el('ol', 'op-quiz-sheet-list', card);
      quiz.questions.forEach(function (question) {
        var item = el('li', 'op-quiz-sheet-item', list);
        if (question.prompt) markup(el('div', 'op-quiz-prompt', item), question.prompt);
        var def = types[question.type];
        if (def.sheet) def.sheet(item, question);
      });
      if (quiz.draw < quiz.questions.length) el('p', 'op-quiz-sheet-note', card, 'Each attempt draws ' + quiz.draw + ' of these ' + quiz.questions.length + ' questions.');
    });
    host.textContent = '';
    host.appendChild(card);
  }

  function head(card, stack, number) {
    var top = el('div', 'op-quiz-head', card);
    var eyebrow = el('p', 'op-eyebrow op-quiz-eyebrow', top, number);
    var counts = stack.quizzes.length > 1 ? stack.quizzes.length + ' quizzes · ' + stack.count + ' questions' :
      stack.count + (stack.count === 1 ? ' question' : ' questions');
    el('span', 'op-quiz-count', eyebrow, counts);
    var title = stack.title || stack.quizzes[0].title;
    if (title) markup(el('p', 'op-quiz-title', top), title);
    if (stack.description) markup(el('p', 'op-quiz-description', top), stack.description);
    tagsInto(top, stack.tags);
    return top;
  }

  // ---- Interactive stack ----

  function mount(host, input, options) {
    var existing = mounted.get(host);
    if (existing) existing.destroy();
    options = options || {};
    var stack = normalize(input);
    var number = options.number || 'Quiz';
    if (readerCapture()) {
      sheet(host, stack, number);
      return null;
    }
    var seed = options.seed === undefined ? Math.floor(Math.random() * 4294967296) : options.seed;
    var rand = random(seed);
    var uid = 'op-quiz-' + (mount.count = (mount.count || 0) + 1);
    var st = null;
    var expanded = false;
    var timer = 0;
    var slotView = null;
    var resultsCard = null;

    host.textContent = '';
    host.classList.add('op-quiz-host');
    var card = el('section', 'op-quiz', host);
    card.setAttribute('aria-label', plain(stack.title || stack.quizzes[0].title || number));
    var top = head(card, stack, number);
    var clockNode = el('span', 'op-quiz-clock');
    clockNode.innerHTML = ICON_CLOCK;
    var clockText = el('span', 'op-quiz-clock-text', clockNode, '00:00');
    clockNode.hidden = !stack.settings.stopwatch && !stack.quizzes.some(function (q) { return q.settings.stopwatch; });
    var status = el('p', 'op-quiz-status', top);
    status.hidden = true;
    var body = el('div', 'op-quiz-body', card);
    var bar = el('div', 'op-quiz-bar', card);
    var live = el('p', 'op-quiz-live', card);
    live.setAttribute('aria-live', 'polite');

    function fresh(retry) {
      st = { attempt: plan(stack, rand, retry), qi: 0, ii: 0, phase: stack.quizzes.length > 1 ? 'intro' : 'question',
        answers: {}, locked: {}, times: {}, hints: {}, scores: {}, done: {}, last: null };
    }

    function key(qi, ii) { return qi + ':' + ii; }
    function current() { return st.attempt[st.qi].items[st.ii]; }
    function quiz() { return st.attempt[st.qi].quiz; }
    function running() {
      return expanded && st && st.phase === 'question' && !st.locked[key(st.qi, st.ii)] && !document.hidden;
    }
    function total() {
      return Object.keys(st.times).reduce(function (sum, k) { return sum + st.times[k]; }, 0);
    }

    // Charges elapsed time to the question on screen, only while it is open and unanswered.
    function tick() {
      if (!st) return;
      var now = Date.now();
      if (st.last !== null && st.lastKey) st.times[st.lastKey] = (st.times[st.lastKey] || 0) + now - st.last;
      var on = running();
      st.last = on ? now : null;
      st.lastKey = on ? key(st.qi, st.ii) : null;
      clockText.textContent = clock(total());
      clockNode.classList.toggle('is-running', !!on);
      if (on && !timer) timer = root.setInterval(tick, 250);
      if (!on && timer) { root.clearInterval(timer); timer = 0; }
    }

    function visibility() { tick(); }
    document.addEventListener('visibilitychange', visibility);

    function emit(name, detail) {
      host.dispatchEvent(new CustomEvent('op:quiz:' + name, { bubbles: true, detail: detail }));
    }

    function render() {
      tick();
      body.textContent = '';
      bar.textContent = '';
      card.classList.toggle('is-expanded', expanded);
      card.classList.toggle('is-collapsed', !expanded);
      top.classList.toggle('is-compact', expanded);
      status.hidden = true;
      if (!expanded) return collapsed();
      body.classList.remove('op-quiz-enter');
      void body.offsetWidth;
      body.classList.add('op-quiz-enter');
      if (st.phase === 'intro') intro();
      else if (st.phase === 'question') question();
      tick();
    }

    function collapsed() {
      var started = st && (Object.keys(st.times).length || st.qi || st.ii || st.phase === 'finished');
      if (started) {
        status.hidden = false;
        status.textContent = st.phase === 'finished' ? 'Completed · ' + Math.round(100 * finalSummary().score) + '%' +
          (clockNode.hidden ? '' : ' · ' + clock(total())) :
          'In progress · ' + (stack.quizzes.length > 1 ? 'quiz ' + (st.qi + 1) + ', ' : '') + 'question ' + (st.ii + 1) +
          (clockNode.hidden ? '' : ' · ' + clock(total()));
      }
      if (st && st.phase === 'finished') {
        button('Retry', 'op-quiz-start', bar, retry);
        return;
      }
      var go = button(started ? 'Resume' : 'Start', 'op-quiz-start', bar, function () {
        if (!st) fresh(false);
        expanded = true;
        render();
        focusBody();
      });
      go.setAttribute('data-op-color', 'blue');
      if (!clockNode.hidden && !started) {
        var note = el('span', 'op-quiz-note', bar);
        note.innerHTML = ICON_CLOCK;
        note.appendChild(document.createTextNode('Timed'));
      }
    }

    function focusBody() {
      var target = card.querySelector('.op-quiz-body input:not([disabled]),.op-quiz-body select:not([disabled]),.op-quiz-begin') || body;
      if (target === body) body.tabIndex = -1;
      target.focus({ preventScroll: true });
    }

    function hideButton(parent) {
      var hide = button('Hide', 'op-quiz-hide', parent, function () { expanded = false; render(); });
      OffPrint.util.hint(hide, 'Collapse the quiz; the stopwatch pauses');
    }

    function intro() {
      var q = quiz();
      var box = el('div', 'op-quiz-intro', body);
      el('p', 'op-eyebrow', box, 'Quiz ' + (st.qi + 1) + ' of ' + st.attempt.length);
      if (q.title) markup(el('p', 'op-quiz-intro-title', box), q.title);
      if (q.description) markup(el('p', 'op-quiz-description', box), q.description);
      tagsInto(box, q.tags);
      el('p', 'op-quiz-note', box, st.attempt[st.qi].items.length + ' questions' + (q.settings.stopwatch ? ' · timed' : ''));
      var go = button('Begin', 'op-quiz-begin', bar, function () { st.phase = 'question'; st.ii = 0; render(); focusBody(); });
      go.setAttribute('data-op-color', 'blue');
      el('span', 'op-quiz-spacer', bar);
      hideButton(bar);
    }

    function question() {
      var item = current();
      var q = item.question;
      var def = types[q.type];
      var k = key(st.qi, st.ii);
      var mode = q.settings.feedback;
      var locked = !!st.locked[k];
      var items = st.attempt[st.qi].items;

      var strip = el('div', 'op-quiz-strip', body);
      var where = el('span', 'op-quiz-where', strip);
      if (st.attempt.length > 1) el('span', 'op-quiz-where-quiz', where, quiz().title + ' · ');
      where.appendChild(document.createTextNode('Question ' + (st.ii + 1) + ' of ' + items.length));
      var dots = el('ol', 'op-quiz-dots', strip);
      dots.setAttribute('data-op-no-list-style', '');
      dots.setAttribute('aria-label', 'Questions');
      items.forEach(function (_, i) {
        var dk = key(st.qi, i);
        var dot = el('li', 'op-quiz-dot', dots);
        var jump = el('button', '', dot);
        jump.type = 'button';
        jump.setAttribute('aria-label', 'Question ' + (i + 1));
        if (i === st.ii) { dot.classList.add('is-current'); jump.setAttribute('aria-current', 'step'); }
        if (st.locked[dk] && mode === 'question') dot.classList.add(st.scores[dk].raw === 1 ? 'is-correct' : st.scores[dk].raw > 0 ? 'is-partial' : 'is-wrong');
        else if (st.answers[dk] !== undefined && def && types[items[i].question.type].answered(items[i].question, st.answers[dk])) dot.classList.add('is-answered');
        jump.addEventListener('click', function () { go(i); });
      });
      if (q.settings.stopwatch) strip.appendChild(clockNode);
      else if (clockNode.parentNode) clockNode.remove();

      var slotWrap = el('div', 'op-quiz-question', body);
      if (q.prompt) markup(el('div', 'op-quiz-prompt', slotWrap), q.prompt);
      var slot = el('div', 'op-quiz-slot', slotWrap);
      var feedback = el('div', 'op-quiz-feedback', body);
      feedback.hidden = true;
      var hintBox = el('div', 'op-quiz-hints', body);

      slotView = def.render(slot, q, {
        uid: uid + '-' + k.replace(':', '-'),
        order: item.order,
        answer: st.answers[k],
        change: function (answer) {
          st.answers[k] = answer;
          if (check) check.disabled = !def.answered(q, answer);
          if (mode !== 'question') refreshDot();
        },
        commit: function () { if (mode === 'question' && def.instant) lock(); }
      }) || {};

      function refreshDot() {
        var dot = dots.children[st.ii];
        dot.classList.toggle('is-answered', def.answered(q, st.answers[k]));
      }

      var usedHints = st.hints[k] || 0;
      function showHints() {
        hintBox.textContent = '';
        q.hints.slice(0, usedHints).forEach(function (hint, i) {
          var row = el('div', 'op-quiz-hint', hintBox);
          el('span', 'op-eyebrow', row, q.hints.length > 1 ? 'Hint ' + (i + 1) : 'Hint');
          markup(el('div', '', row), hint);
        });
      }
      showHints();

      var back = button('Back', 'op-quiz-back', bar, function () { go(st.ii - 1); });
      back.disabled = st.ii === 0;
      if (q.hints.length && q.settings.hints) {
        var hintButton = button('Hint', 'op-quiz-hint-button', bar, function () {
          usedHints = st.hints[k] = Math.min(q.hints.length, usedHints + 1);
          showHints();
          hintButton.disabled = usedHints >= q.hints.length || !!st.locked[k];
          var left = q.hints.length - usedHints;
          hintButton.textContent = left ? 'Hint (' + left + ' left)' : 'Hint';
        });
        hintButton.setAttribute('data-op-color', 'yellow');
        hintButton.disabled = locked || usedHints >= q.hints.length;
        if (q.settings.hintPenalty) OffPrint.util.hint(hintButton, 'Each hint lowers this question’s score by ' + Math.round(q.settings.hintPenalty * 100) + '%');
      }
      el('span', 'op-quiz-spacer', bar);
      var check = null;
      if (mode === 'question' && !locked && !def.instant) {
        check = button('Check', 'op-quiz-check', bar, lock);
        check.setAttribute('data-op-color', 'blue');
        check.disabled = !def.answered(q, st.answers[k]);
      }
      var last = st.ii === items.length - 1;
      var next = button(last ? 'Finish quiz' : 'Next', 'op-quiz-next', bar, function () {
        if (last) finishQuiz();
        else go(st.ii + 1);
      });
      next.setAttribute('data-op-color', last ? 'green' : 'blue');
      next.hidden = mode === 'question' && !locked;
      hideButton(bar);

      function lock() {
        if (st.locked[k]) return;
        tick();
        st.locked[k] = true;
        st.scores[k] = scoreOf(q, st.answers[k], st.hints[k]);
        tick();
        if (slotView.lock) slotView.lock();
        if (mode === 'question') {
          reveal();
          if (check) check.remove();
          next.hidden = false;
          if (hintButton) hintButton.disabled = true;
          var dot = dots.children[st.ii];
          dot.classList.remove('is-answered');
          dot.classList.add(st.scores[k].raw === 1 ? 'is-correct' : st.scores[k].raw > 0 ? 'is-partial' : 'is-wrong');
          next.focus({ preventScroll: true });
        }
        emit('answer', { quiz: quiz().id, question: q.id, score: st.scores[k].score, raw: st.scores[k].raw,
          time: st.times[k] || 0, hints: st.hints[k] || 0 });
      }

      function reveal() {
        if (slotView.reveal) slotView.reveal(st.scores[k]);
        var raw = st.scores[k].raw;
        feedback.hidden = false;
        feedback.className = 'op-quiz-feedback ' + (raw === 1 ? 'is-correct' : raw > 0 ? 'is-partial' : 'is-wrong');
        var verdict = el('p', 'op-quiz-verdict', feedback, raw === 1 ? 'Correct' : raw > 0 ? 'Partly correct · ' + Math.round(raw * 100) + '%' : 'Not quite');
        live.textContent = verdict.textContent;
        if (raw < 1 && def.solution) {
          var sol = el('p', 'op-quiz-solution', feedback);
          el('span', 'op-quiz-solution-label', sol, 'Answer: ');
          sol.appendChild(document.createTextNode(def.solution(q)));
        }
        if (q.explanation && q.settings.explanations) markup(el('div', 'op-quiz-explanation', feedback), q.explanation);
      }

      if (locked) {
        if (slotView.lock) slotView.lock();
        if (mode === 'question') reveal();
      }
    }

    function go(index) {
      var items = st.attempt[st.qi].items;
      if (index < 0 || index >= items.length) return;
      tick();
      st.ii = index;
      render();
    }

    function finishQuiz() {
      var items = st.attempt[st.qi].items;
      tick();
      items.forEach(function (item, i) {
        var k = key(st.qi, i);
        if (st.locked[k]) return;
        st.locked[k] = true;
        st.scores[k] = scoreOf(item.question, st.answers[k], st.hints[k]);
        emit('answer', { quiz: quiz().id, question: item.question.id, score: st.scores[k].score, raw: st.scores[k].raw,
          time: st.times[k] || 0, hints: st.hints[k] || 0 });
      });
      st.done[st.qi] = true;
      if (st.qi < st.attempt.length - 1) {
        st.qi += 1;
        st.ii = 0;
        st.phase = 'intro';
        render();
        focusBody();
        return;
      }
      st.phase = 'finished';
      expanded = false;
      render();
      var summary = finalSummary();
      emit('finish', { records: summary.records.map(function (r) { return Object.assign({}, r); }), score: summary.score, time: summary.time });
      if (stack.settings.results) showResults(summary);
      else live.textContent = 'Finished · ' + Math.round(summary.score * 100) + '%';
    }

    function records() {
      var list = [];
      st.attempt.forEach(function (part, qi) {
        part.items.forEach(function (item, ii) {
          var k = key(qi, ii);
          var s = st.scores[k] || { raw: 0, score: 0 };
          list.push({
            quiz: part.quiz.id, quizTitle: part.quiz.title, question: item.question.id,
            label: 'Q' + (st.attempt.length > 1 ? (qi + 1) + '.' : '') + (ii + 1),
            tags: item.question.tags, score: s.score, raw: s.raw, time: st.times[k] || 0, hints: st.hints[k] || 0,
            answer: st.answers[k], item: item
          });
        });
      });
      return list;
    }

    function finalSummary() {
      var list = records();
      var views = aggregate(list, stack.quizzes);
      return { records: list, views: views, score: views.total.score, time: views.total.time };
    }

    function retry() {
      if (resultsCard) { destroyResults(); }
      fresh(true);
      expanded = true;
      render();
      focusBody();
    }

    function destroyResults() {
      if (!resultsCard) return;
      var chartHost = resultsCard.querySelector('.op-quiz-chart');
      if (chartHost && OffPrint._chart && OffPrint._chart._remove) OffPrint._chart._remove(chartHost);
      resultsCard.remove();
      resultsCard = null;
    }

    function showResults(summary) {
      destroyResults();
      var timed = stack.quizzes.some(function (q) { return q.settings.stopwatch; });
      var hasTags = summary.views.tagScore.length > 0;
      var results = resultsCard = el('section', 'op-quiz op-quiz-results');
      results.setAttribute('aria-label', 'Quiz results');
      card.after(results);
      var headRow = el('div', 'op-quiz-results-head', results);
      var left = el('div', '', headRow);
      el('p', 'op-eyebrow', left, 'Results');
      var title = stack.title || stack.quizzes[0].title;
      if (title) markup(el('p', 'op-quiz-title', left), title);
      var big = el('p', 'op-quiz-score', headRow);
      big.appendChild(document.createTextNode(String(Math.round(summary.score * 100))));
      el('span', 'op-quiz-score-unit', big, '%');

      var stats = el('dl', 'op-quiz-stats', results);
      function stat(label, value) {
        var row = el('div', '', stats);
        el('dt', '', row, label);
        el('dd', '', row, value);
      }
      stat('Full credit', summary.views.total.full + ' of ' + summary.views.total.count);
      if (timed) stat('Time', clock(summary.time));
      if (timed) stat('Average', clock(summary.time / Math.max(1, summary.records.length)) + ' per question');
      if (summary.views.total.hints) stat('Hints used', String(summary.views.total.hints));

      var views = [];
      if (timed) views.push({ value: 'time', label: 'Time per question' });
      if (stack.quizzes.length > 1) views.push({ value: 'quiz', label: 'Score per quiz' });
      if (hasTags) views.push({ value: 'tagScore', label: 'Score by tag' });
      if (hasTags && timed) views.push({ value: 'tagTime', label: 'Time by tag' });
      if (!views.length) views.push({ value: 'score', label: 'Score per question' });
      var chartHost = el('div', 'op-quiz-chart', null);
      var view = views[0].value;
      function chartSpec(name) {
        var rows = name === 'score' ? summary.records.map(function (r) { return { label: r.label, value: 100 * r.score }; }) :
          summary.views[name];
        var time = name === 'time' || name === 'tagTime';
        return {
          type: 'bar', orientation: 'horizontal', table: true,
          categories: rows.map(function (r) { return r.label; }),
          x: { label: name === 'quiz' ? 'Quiz' : name === 'time' || name === 'score' ? 'Question' : 'Tag' },
          y: time ? { label: 'Seconds', min: 0, digits: 1, unit: ' s' } : { label: 'Average score', min: 0, max: 100, digits: 0, unit: '%' },
          series: [{ key: time ? 'time' : 'score', name: time ? 'Seconds' : 'Score', color: time ? 'blue' : 'green',
            data: rows.map(function (r) { return Math.round(r.value * 10) / 10; }) }]
        };
      }
      function drawChart() {
        if (OffPrint._chart && OffPrint._chart._embedded) OffPrint._chart._embedded(chartHost, chartSpec(view));
        else fallbackTable(chartHost, chartSpec(view));
      }
      if (views.length > 1 && OffPrint._choices) {
        var chooser = OffPrint._choices.create({
          label: 'View', options: views, display: 'chips', className: 'op-quiz-views',
          onChange: function (value) { view = value; chooser.show(value); drawChart(); }
        });
        results.appendChild(chooser.el);
        chooser.show(view);
      } else el('p', 'op-eyebrow op-quiz-view-label', results, views[0].label);
      results.appendChild(chartHost);
      drawChart();

      review(results, summary, timed);

      var actions = el('div', 'op-quiz-bar', results);
      button('Retry', 'op-quiz-retry', actions, retry).setAttribute('data-op-color', 'blue');
      live.textContent = 'Finished · ' + Math.round(summary.score * 100) + '%';
    }

    function verdict(raw) { return raw === 1 ? 'is-correct' : raw > 0 ? 'is-partial' : 'is-wrong'; }

    // Review as a card panel: question cards on the left (hover selects), full question and outcome on the right.
    function review(results, summary, timed) {
      var prefix = uid + '-review-' + (review.count = (review.count || 0) + 1);
      el('p', 'op-eyebrow op-quiz-review-title', results, 'Review');
      var box = el('div', 'op-card-panel op-quiz-review', results);
      var panel = el('div', 'op-step-panel', box);
      panel.setAttribute('data-op-color', 'blue');
      var heading = el('p', 'op-step-heading', panel, 'Questions');
      heading.id = prefix + '-heading';
      var list = el('div', 'op-step-list', panel);
      list.setAttribute('aria-labelledby', heading.id);
      var details = el('div', 'op-step-details', box);
      var initial = null;
      st.attempt.forEach(function (part, qi) {
        var parent = list;
        if (st.attempt.length > 1) {
          parent = el('div', 'op-step-group', list);
          el('p', 'op-step-group-heading', parent, part.quiz.title);
        }
        part.items.forEach(function (item, ii) {
          var r = summary.records.find(function (rec) { return rec.item === item; });
          var id = prefix + '-' + qi + '-' + ii;
          var card = el('button', 'op-quiz-card', parent);
          card.type = 'button';
          card.setAttribute('data-op-key', 'q-' + qi + '-' + ii);
          card.setAttribute('data-op-detail', id);
          if (initial === null && r.raw < 1) { initial = card; card.setAttribute('data-op-initial', ''); }
          var top = el('span', 'op-quiz-card-top', card);
          el('span', 'op-quiz-card-mark ' + verdict(r.raw), top).setAttribute('aria-hidden', 'true');
          el('span', 'op-quiz-card-label', top, r.label);
          el('span', 'op-quiz-card-score', top, Math.round(r.score * 100) + '%' + (timed ? ' · ' + clock(r.time) : ''));
          var text = plain(item.question.prompt || item.question.data.text || '');
          el('span', 'op-quiz-card-prompt', card, text.length > 110 ? text.slice(0, 107).trim() + '…' : text);
          if (r.tags.length) tagsInto(card, r.tags, 'span');
          detail(el('div', 'op-quiz-detail', details), item, r, part.quiz, timed).id = id;
        });
      });
      if (OffPrint._cards && OffPrint._cards.mount) OffPrint._cards.mount(box);
    }

    function detail(pane, item, r, quizInfo, timed) {
      var q = item.question;
      var def = types[q.type];
      var answers = q.settings.feedback !== 'none';
      var head = el('div', 'op-quiz-detail-head', pane);
      el('p', 'op-eyebrow', head, r.label + (st.attempt.length > 1 ? ' · ' + quizInfo.title : ''));
      var badge = el('span', 'op-quiz-badge ' + verdict(r.raw), head,
        r.raw === 1 ? 'Correct' : r.raw > 0 ? 'Partly correct' : 'Not quite');
      if (!answers) badge.textContent = Math.round(r.score * 100) + '%';
      var stats = el('dl', 'op-quiz-stats op-quiz-detail-stats', pane);
      function stat(label, value) {
        var row = el('div', '', stats);
        el('dt', '', row, label);
        el('dd', '', row, value);
      }
      stat('Score', Math.round(r.score * 100) + '%' + (r.hints && r.score !== r.raw ? ' (' + Math.round(r.raw * 100) + '% before hints)' : ''));
      if (timed) stat('Time', clock(r.time));
      stat('Hints', String(r.hints));
      tagsInto(pane, r.tags);
      var body = el('div', 'op-quiz-question op-quiz-detail-question', pane);
      if (q.prompt) markup(el('div', 'op-quiz-prompt', body), q.prompt);
      var slot = el('div', 'op-quiz-slot', body);
      var view = def.render(slot, q, { uid: uid + '-detail-' + r.label.replace(/\W/g, '-'), order: item.order, answer: r.answer,
        change: function () {}, commit: function () {} }) || {};
      if (view.lock) view.lock();
      if (answers && view.reveal) view.reveal(r);
      if (answers && r.raw < 1 && def.solution) {
        var sol = el('p', 'op-quiz-solution', pane);
        el('span', 'op-quiz-solution-label', sol, 'Answer: ');
        sol.appendChild(document.createTextNode(def.solution(q)));
      }
      if (answers && q.explanation && q.settings.explanations) markup(el('div', 'op-quiz-explanation', pane), q.explanation);
      return pane;
    }

    fresh(false);
    render();

    var api = {
      element: host,
      stack: function () { return stack; },
      state: function () {
        return st ? { phase: st.phase, quiz: st.qi, question: st.ii, time: total(), expanded: expanded } : null;
      },
      results: function () { return st && st.phase === 'finished' ? finalSummary() : null; },
      retry: retry,
      destroy: function () {
        if (timer) root.clearInterval(timer);
        document.removeEventListener('visibilitychange', visibility);
        destroyResults();
        mounted.delete(host);
      }
    };
    mounted.set(host, api);
    return api;
  }

  function fallbackTable(host, spec) {
    host.textContent = '';
    var table = el('table', 'op-quiz-table', host);
    var headRow = el('tr', '', el('thead', '', table));
    el('th', '', headRow, spec.x.label);
    el('th', '', headRow, spec.y.label);
    var tbody = el('tbody', '', table);
    spec.categories.forEach(function (label, i) {
      var row = el('tr', '', tbody);
      el('td', '', row, label);
      el('td', '', row, spec.series[0].data[i] + spec.y.unit);
    });
  }

  function enhance(host, number) {
    try {
      var input = readInput(host);
      var api = mount(host, input.value, { number: number });
      if (input.source && api) {
        input.source.subscribe(function (next) {
          try { mount(host, next.value, { number: number }); }
          catch (error) { OffPrint._component.issue('quiz', host, error.message, 'Fix the quiz data.'); }
        });
      }
    } catch (error) {
      OffPrint._component.issue('quiz', host, 'Quiz could not start: ' + error.message,
        'Check the quiz JSON against the quiz reference.');
      var note = el('p', 'op-quiz-error', null, 'This quiz could not load: ' + error.message);
      host.appendChild(note);
    }
  }

  OffPrint.quiz = {
    defineType: defineType,
    types: function () { return Object.keys(types); },
    mount: function (target, input, options) {
      var host = typeof target === 'string' ? document.getElementById(target) : target;
      return host ? mount(host, input, options) : null;
    },
    get: function (target) {
      var host = typeof target === 'string' ? document.getElementById(target) : target;
      return host && mounted.get(host) || null;
    },
    _model: { normalize: normalize, plan: plan, score: scoreOf, aggregate: aggregate, random: random,
      clock: clock, blankCorrect: blankCorrect }
  };

  OffPrint.register('quiz', function () {
    OffPrint._all('[data-op-quiz]').forEach(function (host, i) {
      var label = host.getAttribute('data-op-quiz-number');
      enhance(host, label === null ? 'Quiz ' + (i + 1) : label);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
