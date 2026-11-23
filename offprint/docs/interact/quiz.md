# Quizzes

Enable `quiz` (includes `base`, `choices`, `dropdowns`, `chart`, `cards`). Optional: `data` for named or external sources, `code` for highlighted code blanks, `math` for TeX in quiz text, `tooltips` for control hints.

```html
<div data-op-quiz>
  <p>Quiz: light basics. Open with scripts on.</p>
  <script type="application/json">
    {"title": "Light basics", "tags": ["domain:optics"], "feedback": "question", "stopwatch": true,
     "questions": [{"prompt": "Speed of light in vacuum?", "options": ["3×10⁵ m/s", {"text": "3×10⁸ m/s", "correct": true}]}]}
  </script>
</div>
```

## Where quizzes live

| Size | Where | Host |
| --- | --- | --- |
| One quiz, ≤ ~8 questions | Inline: direct `script[type="application/json"]` child of the host | `<div data-op-quiz>` |
| Reused on one page or edited as data | Inline named source anywhere on the page: `<script type="application/json" data-op-source="name">` (or `text/yaml`) | `<div data-op-quiz="name">` |
| Banks, stacks, sets edited without touching pages | `<site>/assets/data/quizzes/<stack>.json` (or `.yaml`) + manifest wrapper | `<div data-op-quiz="name">` |

- External files: `file://` cannot fetch raw JSON, so register the file as a wrapper and refresh. Enable `data` with `quiz`.

```json
{
  "features": {"quiz": true, "data": true},
  "assets": {"data": {
    "week-1-quiz": {"source": "data/quizzes/week-1.json", "output": "generated/week-1-quiz.js"}
  }}
}
```

- Then run `python3 <site>/refresh-assets.py` (check with `--check`). Never hand-write files in `generated/`. [File wrappers](../tools/file-wrapper.md) · [Terminal refresh](../tools/refresh-assets.md)
- One file per stack; source name = lowercase-hyphen stack ID. A source update remounts the quiz (attempt resets).
- Other host children are the no-script fallback and are replaced: always include one short `<p>` naming the quiz.
- Hosts number in page order as `Quiz N`; `data-op-quiz-number="Warm-up"` overrides the eyebrow text.

## Schema

- Quiz: `{title?, tags?, questions: [...], draw?, ...settings}`. Stack: `{title?, description?, tags?, quizzes: [{id?, title?, description?, tags?, draw?, questions, ...settings}], ...settings}`. A quiz is a stack of one; a single quiz has no `description` (use the page prose or a stack).
- ≤ 8 questions shown per quiz. A larger bank needs `draw: N` (1–8): N sampled per attempt, kept in bank order unless shuffled. More than 8 without `draw` is an error.
- Settings cascade stack → quiz → question (each layer overrides only what it states):

| Setting | Values (default first) | Effect |
| --- | --- | --- |
| `feedback` | `"end"` · `"question"` · `"none"` | `end`: answers editable until Finish quiz, review on results. `question`: every built-in type locks on Check; verdict, correct answer, explanation shown at once. `none`: no answers anywhere; results show scores only. |
| `explanations` | `true` · `false` | Show `explanation` in feedback and review. |
| `stopwatch` | `false` · `true` | Visible count-up timer; never blocks answering. Times are always recorded; time chart views need ≥ 1 timed quiz. |
| `hints` | `true` · `false` | Hint button for questions that have `hint`. |
| `hintPenalty` | `0` … `1` | Score × max(0, 1 − penalty × hints used). |
| `scoring` | `"partial"` · `"all"` | `all`: only a full score counts. |
| `shuffle` | `false` · `true` · `{questions?, options?, retry?}` | `true` = questions + options. `retry` (default true) re-randomizes on Retry; false keeps the initial order. Match right columns always shuffle. |
| `results` | `true` · `false` | Stack only. False: no results card, just a finished status. |

- Tags: string or list on stack, quiz, or question. Questions inherit their quiz's tags; stack tags only display on the card. `group:value` renders as a small group label + value; the full string is the grouping key for tag views. Use consistent groups (`domain:`, `skill:`, `level:`).
- Question base: `{id?, type?, prompt?, tags?, hint?: text | [text…], explanation?, ...settings}`. `id` unique per quiz (default `q1`…); keep IDs stable because events and results report them. Multiple hints reveal one at a time.
- Content strings (`title`, `description`, `prompt`, option `text` and `why`, `hint`, `explanation`, match items, non-code fill `text`) are trusted author HTML: use `<code>`, `<em>`, `<span class="op-math">`. Never feed reader input. Code `fill` text is plain source.

## Question types

| `type` | Fields | Answer value | Partial score |
| --- | --- | --- | --- |
| `single` (default) | `options: [text \| {text, correct?, why?}]` (≥ 2), exactly one `correct` | option index | 0 or 1 |
| `multi` | same, ≥ 1 correct | sorted option indices | max(0, (hits − wrong picks) / correct count) |
| `fill` | `text` with `[[name]]` blanks; `blanks: {name: spec}`; `code?: true \| lang` | `{name: value}` | blanks right / blanks |
| `match` | `pairs: [[left, right]…]` (≥ 2), `distractors?: [right…]` | `{leftIndex: rightIndex}` | pairs right / pairs |

```json
{"type": "multi", "prompt": "Which are prime?",
 "options": [{"text": "2", "correct": true}, {"text": "9", "why": "9 = 3 × 3."}, {"text": "11", "correct": true}]}
```

- `why`: shown under an option after reveal when chosen or correct.
- `fill` blank spec: `"answer"` · `["accepted", "alternatives"]` · `{answer, options?, match?, width?}`. With `options` the blank is an inline dropdown and `answer` must be one option: a shared `.op-dropdown` (`button.op-quiz-select` trigger showing the choice or `Choose`, `.op-dropdown-panel` popover of `button[role=option]` rows with a check dot; ↑/↓/Home/End move, click or Enter picks, Esc closes; monospace in code); otherwise a text field (`input.op-quiz-blank`, width `width` ch, 1–80, else from the longest answer). `match`: `trim` (default: trim + collapse spaces), `nocase`, `exact`, `regex` (anchored, case-sensitive). Each name appears once in `text`, and every `blanks` key is used.

```json
{"type": "fill", "prompt": "Complete the function.", "code": "python",
 "text": "def square(x):\n    return [[expr]]\n\nsquare([[arg]])  # 9",
 "blanks": {"expr": {"answer": ["x\\*\\*2", "x ?\\* ?x"], "match": "regex"}, "arg": {"options": ["3", "9", "81"], "answer": "3"}}}
```

- `code`: `pre.op-quiz-code`; a language name highlights each segment when `code` is enabled (`true` = plain monospace). In JSON escape newlines as `\n`, quotes as `\"`, and regex backslashes twice. Prefer YAML block scalars (`text: |`) for long code.
- `match`: drag from either column to the other. Pointer only, by design; there is no keyboard path, so do not use it where keyboard-only completion matters. Re-pairing a right item moves its link; a click without movement unpairs. On reveal links are green (correct), red dotted (wrong), or green dashed (missed).

```json
{"type": "match", "prompt": "Match each unit to its quantity.",
 "pairs": [["newton", "force"], ["joule", "energy"], ["watt", "power"]], "distractors": ["charge"]}
```

## Stack example (YAML file)

```yaml
title: Week 1 review
description: Optics and waves.
stopwatch: true
feedback: end
hintPenalty: 0.25
shuffle: {options: true}
quizzes:
  - id: lenses
    title: Lenses
    tags: [domain:optics]
    draw: 5
    questions:
      - id: focal
        prompt: What does a converging lens do to parallel rays?
        hint: [Think of a magnifying glass., Where do the rays meet?]
        options:
          - Spreads them apart
          - text: Brings them to a focal point
            correct: true
        explanation: Parallel rays meet at the focal point.
      # … up to any bank size; draw picks 5
  - id: waves
    title: Waves
    tags: [domain:waves]
    feedback: question
    questions: [...]
```

## Flow

- Collapsed card: eyebrow (`Quiz N` + counts), title, description, tag chips, Start (and `Timed` note). In progress: status + Resume. Finished: score/time + Retry.
- Expanded: stacks show a per-quiz intro (Begin). Question view: strip (where, progress dots — clickable, verdict-coloured in `question` mode — stopwatch pill), prompt, answer area, hints, feedback; bar: Back, Hint (`n left`), Check, Next / Finish quiz, Hide.
- Time accrues to the question on screen only while the card is expanded, the tab is visible, and the question is unlocked.
- Results card (`section.op-quiz.op-quiz-results`, after the quiz card): score %, stats (full credit, time, average, hints), view chips + horizontal bar chart (keyed tweens on switch, Table button): Time per question (timed), Score per quiz (> 1 quiz), Score by tag (tags), Time by tag (timed + tags); otherwise Score per question. Review below the chart is a [card panel](card-panels.md) (`.op-card-panel.op-quiz-review`, `--op-step-pane-max: min(30rem, 60svh)`): an independently scrolling list of question cards (verdict dot, label `Q2`/`Q1.2`, score and time, prompt clamped to two lines, tag chips; grouped by quiz in stacks) whose hover, click, or arrow keys select the detail pane. Starts on the first question without full credit. Each detail: label, verdict badge, score (and pre-hint score), time, hints, tags, the full question re-rendered locked with the reader's answer, then marks, correct answer, and explanation. `feedback: "none"` keeps the reader's answer but omits marks, answers, and explanations. Custom types render here through the same `render` + `lock`/`reveal`.
- Attempts live in memory for the page visit only; Retry starts a new attempt. Nothing is saved to storage.

## Custom types

Rung 4 of the [custom code ladder](../AUTHORING.md#custom-code-ladder): register in an author script, then use `"type": "<name>"` in quiz data. Custom types get timing, hints, feedback, scoring modes, and results unchanged.

```js
// assets/scripts/quiz-ordering.js — ordering questions; no shipped quiz type reorders items.
OffPrint.setup((op) => {
  op.quiz.defineType('ordering', {
    normalize: (input, fail) => Array.isArray(input.items) && input.items.length > 1 ? { items: input.items } : fail('needs items.'),
    order: (q, mix, random) => q.data.items.map((_, i) => i).sort(() => random() - 0.5),
    answered: (q, answer) => Array.isArray(answer),
    score: (q, answer) => (answer || []).filter((index, at) => index === at).length / q.data.items.length,
    render(slot, q, ctx) {
      let current = ctx.answer || ctx.order;
      if (!ctx.answer) ctx.change(current);  // the starting order is an answer too
      const list = document.createElement('ol');
      const draw = () => {
        list.replaceChildren(...current.map((index, at) => {
          const item = document.createElement('li');
          const up = document.createElement('button');
          up.type = 'button'; up.className = 'op-button'; up.textContent = '↑'; up.disabled = at === 0;
          up.addEventListener('click', () => {
            current = current.slice(); [current[at - 1], current[at]] = [current[at], current[at - 1]];
            ctx.change(current); draw();
          });
          item.append(up, ' ', q.data.items[index]);
          return item;
        }));
      };
      draw();
      slot.append(list);
      return { lock: () => list.querySelectorAll('button').forEach((b) => { b.disabled = true; }) };
    },
    summary: (q, answer) => (answer || []).map((i) => q.data.items[i]).join(' → '),
    solution: (q) => q.data.items.join(' → '),
    sheet: (slot, q) => { slot.append(q.data.items.slice().sort().join(' · ')); }
  });
});
```

- `defineType(name, def)` during setup; lowercase-hyphen name, once per page (redefinition throws, built-ins `single`, `multi`, `fill`, `match` included).
- Required: `render(slot, question, ctx)` → `{lock?(), reveal?(score), redraw?()}`, and `score(question, answer)` → 0–1 (clamped).
- Optional: `normalize(input, fail)` → stored as `question.data`; call `fail(message)` to reject with a located error. `order(question, mixRandom | null, random)` → per-attempt view order passed as `ctx.order` (`mixRandom` is set only when option shuffling applies). `answered(question, answer)` enables Check and dot state. `instant: true` locks on `ctx.commit()` in `question` mode. `sheet(slot, question)` for the Reader sheet (questions only, never answers). `summary(question, answer)` and `solution(question)` return plain text for feedback and review.
- `ctx`: `{uid, order, answer (restored value or undefined), change(answer), commit()}`. Keep answers JSON-compatible; call `change` on every edit. Render from `ctx.answer` because the view rebuilds on Back/Next.
- Load the script after the entry; in the page or manifest enable `quiz`. Name the file after the type.

## API and events

- `OffPrint.quiz.mount(target, input, {number?, seed?})` → controller `{element, stack(), state(), results(), retry(), destroy()}`; `get(target)` for an enhanced host; `types()`. Read controllers in `ready`.
- Bubbling host events: `op:quiz:answer` `{quiz, question, score, raw, time, hints}` when a question locks (immediately in `question` mode, at Finish quiz otherwise); `op:quiz:finish` `{records, score, time}`. `records[]`: `{quiz, quizTitle, question, label, tags, score, raw, time, hints, answer}`. Times are milliseconds.
- Errors (bad JSON, schema, missing source) report `component-input` diagnostics with the quiz/question location and leave a red note in the host.

## Export

- Interactive: runs as on the page, starting a new attempt. Inline quiz scripts and consented named sources travel with the page.
- Reader: `section.op-quiz-sheet` lists every bank question with prompts, lettered options, blank placeholders (dropdowns as `[a / b]`), and match columns. Never answers, hints, or explanations.
- Print hides the action bars.

## Pitfalls

- More than 8 questions without `draw`; `single` with zero or several `correct`; a dropdown `answer` not among its `options`; unused or repeated blank names.
- Answers leak through markup: do not put the answer in `prompt`, `hint`, or the fallback `<p>`.
- Shuffled options with text like "All of the above" or "Both A and B". Turn off `shuffle.options` on that question.
- `match` for keyboard-only audiences; `regex` blanks without anchoring intent (patterns are already anchored).

[Choices](choices.md) · [Charts](../data/charts.md) · [Named sources](../data/data-blocks.md) · [Extension API](../extend/api.md) · [Styles](../../css/quiz.css) · [Source](../../js/quiz.js)
