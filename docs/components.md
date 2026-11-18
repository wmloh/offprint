# Component reference

Each feature needs its stylesheet in `<head>` and, where listed, its script after `core.js`. Content stays readable if a script is missing.

| Feature | Stylesheet | Script |
| --- | --- | --- |
| Layout and typography | `tokens.css`, `base.css` | `core.js` |
| Lists | `base.css` | none |
| Concept tables | `base.css`, plus `blocks.css` for tags | none |
| Sidebar, outline, heading links | `nav.css` | `nav.js` |
| Theme toggle | `theme.css` | `theme.js` (in `<head>`) |
| Control pill, focus mode, shortcuts | `controls.css` | `controls.js` |
| Roles legend | `roles.css` | `roles.js` |
| Math | `vendor/katex/katex.min.css`, `math.css` | `vendor/katex/katex.min.js`, `math.js` |
| Tags and callouts | `blocks.css` | none |
| Peek bubbles | `blocks.css`, `bubble.css` | `bubble.js` |
| Tooltips and glossary | `tooltip.css` | `tooltip.js` |
| Glossary page | `glossary.css` | `glossary.js`, with `tooltip.js`; `search.js` for page definitions and links |
| Code blocks, annotations, diffs | `code.css` | `code.js` |
| Tabs | `tabs.css` | `tabs.js` |
| Animated figures | `anim.css` | `anim.js` |
| Figure steps | `steps.css` | `steps.js` |
| Reveals and split views | `reveal.css` | `reveal.js` |
| Figure zoom | `zoom.css` | `zoom.js` |
| Zoom presentation tools | `zoomtools.css` | `zoomtools.js`, with `zoom.js` |
| Parameters and presets | `params.css` | `params.js` |
| Numbering, cross-references, citations | `refs.css` | `refs.js` |
| Sidenotes | `notes.css` | `notes.js` |
| Search | `search.css` | `search.js` |
| Charts | `chart.css` | `chart.js` |
| Results tables | `results.css` | `results.js` |
| Data files | `data.css`, plus `code.css` and `results.css` | `data.js`, plus `code.js` and `results.js`; YAML also needs `vendor/js-yaml/js-yaml.min.js` |
| Data trees | `tree.css` | `tree.js`, with `data.js` |
| File dropzones | `dropzone.css` | `dropzone.js`, with `data.js` |
| Linked highlighting | `highlight.css` | `highlight.js` |
| Worked-example steppers | `stepper.css` | `stepper.js` |
| Scenario comparisons | `chart.css`, `scenarios.css` | `chart.js`, `scenarios.js` |
| Wide blocks | `wide.css` | `wide.js` |

## Page layout

```html
<body>
  <nav class="df-sidebar">
    <div data-df-nav></div>
  </nav>
  <main class="df-page">
    <h1>Title</h1>
    …
  </main>
</body>
```

The sidebar lists the manifest's pages and an outline of the current page's `h2` and `h3` headings, highlighting the one in view. Only the `h3` list of the section in view stays open. Collapsed pages and sections open when the pointer rests on them and stay open until it leaves the sidebar. With a search index, other pages also list their sections this way. Clicking the arrow beside one keeps it open or closed until it is clicked again or the page reloads. Drag the sidebar's right edge to resize it and double-click to reset the width. The width is remembered across pages. On narrow screens and touch-only devices the sidebar becomes a drawer. Add `data-df-no-outline` to a heading (or a section around it) to leave it out, and `data-df-no-pager` on `main` to hide the previous and next links.

Each outlined heading shows a link icon on hover that copies the URL of its section. Scrollbars in the sidebar, code blocks, and tables stay hidden until the pointer is on them.

The reading column is up to 1,120px wide and keeps its width when you toggle navigation. It centers in the window when there is room and moves beside the open sidebar on tighter desktop screens. Use `--df-content-width` to change the maximum width and `--df-page-gutter` to change the side padding.

Standalone figures, tables, and their captions are centered in the reading column, with a little extra space above and below. Pointing at any table cell, headers included, lightly tints its row and column. Links are blue and underlined.

### Wide blocks

A figure or table that needs more room than the reading column can grow into the space beside it. Mark a figure, or a `div` around a table, that sits directly inside `main`:

```html
<figure id="trace" data-df-wide>
  <div data-df-chart="line">…</div>
  <figcaption>A long trace that reads better wide.</figcaption>
</figure>

<div data-df-wide>
  <table>
    <caption>Scores for every scenario</caption>
    …
  </table>
</div>
```

The block grows evenly on both sides, up to 1240px in total (set `--df-wide-width` on the page or the block to change it). It always stays a page gutter away from the sidebar and follows it when the sidebar is resized or hidden. While the page shows sidenotes or peek panels in the right margin, the block grows toward the sidebar side only. Prose keeps the reading width.

When there is no spare room, as on narrow screens, the block keeps the reading width and a wide table scrolls sideways inside it instead of widening the page. Without the script, wide blocks also keep the reading width. The PCA case study has a [wide residual trace](../examples/pca/pages/telemetry.html#residual-trace) and a [wide scores table](../examples/pca/pages/monitor.html#evaluation).

## Lists

Lists in the page get numbers in small tinted circles and bullets as tinted dots, which deepen when the reader hovers an item. The tint is gray unless the list, an item, or a block around it has `data-df-color` or `data-df-role`; the text keeps its normal colour. Add `data-df-no-list-style` to a list (or a block around it) to keep plain browser markers.

```html
<ol data-df-color="blue">
  <li>Arrange the triangles.</li>
  <li>Cancel <span class="df-math">2ab</span>.</li>
</ol>
<ul data-df-role="warning">
  <li>Not commutative.</li>
</ul>
```

## Control pill

Load `controls.css` and `controls.js` and a small frosted pill appears in the top-left corner of the page, beside the sidebar. It needs no markup. It holds:

- a ring that fills as the reader scrolls through the page;
- a sidebar button that cycles through shown, hidden, and auto-hide on desktop and opens the drawer on narrow screens and touch-only devices
- a focus-mode button that keeps the section in the middle of the screen, everything in the central part of the screen, and the page title sharp, and blurs the rest; pointing at a blurred block sharpens it;
- a search button, when `search.js` is loaded;
- the theme toggle, when `theme.js` is loaded.

In auto-hide, move the pointer to the far left edge to open the sidebar and shift the page. Moving the pointer away closes it again. With the desktop sidebar closed, numbered rings follow the page outline in reading order. The current ring glows and fills as you scroll, and earlier rings stay filled. Hover over the rings or focus a numbered link to see all subsection names. Select a number or name to jump to that heading.

The page scrollbar stays hidden until the pointer comes near the right edge. The sidebar and focus-mode choices are remembered across pages. Keyboard shortcuts work anywhere except while typing in a form field.

| Key | Action |
| --- | --- |
| `T` | Switch theme |
| `F` | Focus mode |
| `N` | Cycle sidebar modes or toggle the drawer |
| `J` / `K` | Next / previous section |
| `Ctrl`+`K` (`⌘`+`K` on a Mac) | Search, with `search.js` |

## Theme toggle

```html
<div data-df-theme-toggle></div>
```

Switches between light and dark. The first visit follows the OS setting; after that the choice is remembered. The control pill already includes one; use this to place another, for example in a page without the pill.

## Colours

```html
<span data-df-color="green">green text</span>
<span data-df-role="definition">text in the definition colour</span>
<div data-df-legend></div>
```

`data-df-color` takes a colour name; `data-df-role` takes a role from the manifest. The legend lists every role.

## Math

```html
<span class="df-math">a^2 + b^2 = c^2</span>
<div class="df-math" data-df-display>\int_0^1 x\,dx = \tfrac12</div>
```

Write TeX as-is, without dollar signs. Errors show in red with the message on hover.

## Tags

```html
<h2>Statement <span class="df-tag" data-df-role="theorem">Theorem</span></h2>
<span class="df-tag" data-df-color="orange">draft</span>
```

## Callouts

```html
<div class="df-callout" data-df-role="warning" data-df-icon="⚠️">
  <span class="df-callout-title">Careful</span>
  Division by zero is undefined.
</div>
```

The icon and title are optional. With `reveal.css` and `reveal.js`, callouts in `.df-page` slide in from the right as they reach the middle of the viewport and slide back to the right as they leave that area. Add `data-df-no-reveal` to keep an individual callout still.

## Peek bubbles

```html
<details data-df-color="blue">
  <summary>Show the proof</summary>
  <p>…</p>
</details>
```

With `bubble.js`, every `details` in the page becomes a small tinted bubble showing its title. As the reader scrolls it towards the middle of the screen, it flies into a large frosted panel in the empty space to the right of the text. When several bubbles are near the middle at once, their panels stack vertically. A panel's content is blurred except while the pointer is over it or keyboard focus is inside it; a tap clears it on touch screens. Each panel scrolls on its own. Once the reader scrolls past the bubble, the panel shrinks back into it. Clicking the bubble brings it to the middle and opens it right away; `Escape` closes it. When the space to the right is too narrow, the bubble expands in place instead.

The tint is purple unless `data-df-color` or `data-df-role` says otherwise. Put `data-df-no-bubble` on a `details` (or a block around it) to leave it as a plain card. Without the script, each `details` shows as a tinted card.

## Tooltips and glossary

```html
<span data-df-tip="The side opposite the right angle.">hypotenuse</span>
<span data-df-term>vector</span>
<span data-df-term="dot product">inner product</span>
```

`data-df-tip` holds the text directly. `data-df-term` looks up the manifest glossary, using the element's own text when the attribute is empty. Both accept `$…$` math; write `\$` for a literal dollar sign.

Terms with extended text (the glossary's `more`, see [manifest.md](manifest.md)) show a ring in their tooltip. Press and hold the term, by mouse, touch, or Enter, to fill the ring and open the larger card. Give one term its own extended text with `data-df-more`, either as HTML or as the id of a `template`:

```html
<span data-df-term data-df-more="#eigen-more">eigenvector</span>
<template id="eigen-more"><p>For a shear, $e_1$ is one.</p></template>
```

An empty `data-df-more` turns the card off for that term, and `data-df-hold="900"` changes its hold time.

With `terms: { autoLink: true }` in the manifest, every glossary term in paragraphs and list items becomes a tooltip term automatically. These get a fainter underline than hand-marked terms and are not added to the Tab order. To link terms on one page or block only, put `data-df-autolink` on it; to keep a block out, use `data-df-no-autolink`.

### Glossary page

Put an empty block on a page to list every term of the site:

```html
<div data-df-glossary></div>
```

It shows the manifest glossary and every `data-df-tip` definition, in alphabetical order with a bar of letters to jump to. A tip's underlined text is its term name, ignoring case, so `<span data-df-tip="…">Norm</span>` and `<span data-df-tip="…">norm</span>` are one entry. When a word is defined more than once, the manifest definition comes first (otherwise the first one found), and the others are listed under "Also defined as" with the pages that give them. Each entry ends with "Used on" links to the pages and sections where the term or tip appears, including automatically linked terms.

The list of tips and uses comes from the search index (see [Search](#search)), so build the index again after adding or changing tips. Without an index, the block shows the manifest glossary only, with a short notice. To list the page in the sidebar, set `glossaryPage` in the manifest (see [manifest.md](manifest.md)).

## Code blocks

```html
<pre><code class="language-python">print("hello")</code></pre>
```

Adds a language label and a copy button, and highlights JavaScript, JSON, YAML, Python, HTML, CSS, shell, SQL, and C#. The language can also be given as `data-df-lang="js"`. Add `data-df-no-code` to a `pre` to leave it plain.

SQL (`sql`) suits queries and table definitions; keywords are recognized in any letter case, and `-- (1)` works as an annotation marker. C# accepts `csharp`, `cs`, or `c#`, and suits game scripts and tools:

```html
<pre><code class="language-sql">
SELECT sale_id, MIN(received_at) AS first_seen
FROM arrivals
GROUP BY sale_id;
</code></pre>

<pre><code class="language-cs">
public class Spinner : MonoBehaviour
{
    [SerializeField] private float speed = 90f;

    void Update() => transform.Rotate(0f, speed * Time.deltaTime, 0f);
}
</code></pre>
```

### Highlighted lines and annotations

```html
<pre data-df-annotate data-df-lines="3-4"><code class="language-python">
def norm(v):
    total = 0  # (1)
    for x in v:
        total += x * x
    return total ** 0.5  # (2)
</code></pre>
<ol>
  <li>Start from zero.</li>
  <li>The square root of the sum of squares.</li>
</ol>
```

- `data-df-lines` tints lines by number, such as `"2"`, `"3-4"`, or `"1, 5-7"`.
- With `data-df-annotate`, a comment at the end of a line that holds only numbers, such as `# (1)` or `// (2) (3)`, becomes a circled marker. The comment is removed, also from copied code.
- Marker `(n)` matches item `n` of the numbered list right after the block, or of the list named by `data-df-annotate="#id"`. Pointing at a marker shows its note and lights up the item; clicking it scrolls to the item. Pointing at an item lights up its markers and lines.

### Diffs

Give the old and new versions, and the block shows what changed:

```html
<div class="df-diff" data-df-lang="python">
  <pre data-df-diff="before">x = np.linalg.inv(A) @ b</pre>
  <pre data-df-diff="after">x = np.linalg.solve(A, b)</pre>
</div>
```

Or write the diff yourself on a `pre` with `data-df-diff`, starting lines with `+` (added), `-` (removed), or a space (unchanged); `@@` lines are section headers. Removed lines are red, added lines green, and the copy button copies the new version. `data-df-lines` also works on diffs.

## Tabs

```html
<div class="df-tabs" data-df-tab-group="lang">
  <div data-df-tab="JavaScript"><pre><code class="language-js">…</code></pre></div>
  <div data-df-tab="Python"><pre><code class="language-python">…</code></pre></div>
</div>
```

Each panel is a wrapper element with a `data-df-tab` label. Tab sets sharing a `data-df-tab-group` switch together, across pages too. Add `data-df-selected` to a panel to open it first.

## Animated figures

```html
<figure id="demo">
  <svg viewBox="0 0 200 100">
    <path id="line" class="df-stroke" data-df-color="blue" d="M10 50 H190"/>
    <circle id="dot" class="df-fill" data-df-role="example" cx="10" cy="50" r="6"/>
  </svg>
</figure>

<script>
  DocForm.anim('demo', [
    { caption: 'Draw the line.', actions: [{ draw: '#line' }] },
    { caption: 'Slide the dot along it.', actions: [{ move: '#dot', to: [180, 0], easing: 'ease-out' }] },
    { caption: 'Shrink it.', actions: [{ attr: '#dot', name: 'r', to: 3 }] }
  ], { caption: 'Press play.' });
</script>
```

Each step has a caption (which may contain `$…$` math) and a list of actions:

- `draw`: draws a stroke from start to end.
- `fade`: fades in, or set `to: 0` to fade out.
- `move`: shifts by `to: [x, y]` in SVG units.
- `attr`: tweens an attribute (`name`) to a value.

Actions accept `duration`, `delay` (in milliseconds), and `easing` (`ease`, `linear`, `ease-in`, `ease-out`, `ease-in-out`, `back-out`). Options after the steps: `caption` (shown before the first step), `duration`, `easing`, `hold` (pause between steps while playing), and `autoplay` (play when scrolled into view; or put `data-df-autoplay` on the figure). A stopped figure also plays when a mouse or pen pointer moves onto it: a paused one resumes and a finished one starts again. After the reader presses Pause, it stays paused until the pointer leaves.

SVG shapes take colours with `data-df-color` or `data-df-role` plus a paint class: `df-stroke`, `df-fill`, or `df-fill-bg` (the pale tint). `df-grid`, `df-axis`, and `df-muted` give neutral greys for backgrounds.

Page scripts can reach a figure's controller later with `DocForm.anim.get(figure)`; besides `play`, `pause`, `next`, `prev`, and `go(step)` (jump), it has `to(step)`, which animates forwards or backwards to a step.

## Card panels and figure steps

Include `steps.css` and `steps.js` for either layout. The selector and detail share a capped height and scroll independently when there is room to sit side by side. On narrow pages the detail follows the selector. Scrollbars appear when the pointer reaches their tracks. The selected entry is bold, and its highlight slides to each new selection. With scripts disabled or in print, every card detail is visible.

### Standalone cards

Use `.df-card-panel` for a selector beside authored HTML. Give each button a `data-df-card` value that matches the ID of one direct child of `.df-step-details`. Use distinct IDs across the page. The detail can contain any combination of prose, code, tabs, and figures.

```html
<div class="df-card-panel">
  <div class="df-step-panel" data-df-color="blue">
    <p class="df-step-heading" id="setup-cards">Setup options</p>
    <div class="df-step-list" aria-labelledby="setup-cards">
      <button type="button" data-df-card="setup-local">Local file</button>
      <button type="button" data-df-card="setup-shared">Shared folder</button>
    </div>
  </div>
  <div class="df-step-details">
    <div id="setup-local"><p>Open the document from your own copy of the folder.</p></div>
    <div id="setup-shared"><p>Open the document from the shared drive.</p></div>
  </div>
</div>
```

To organize a long list, wrap related buttons in a `.df-step-group` that starts with a `.df-step-group-heading`. Groups and ungrouped buttons can sit side by side in one list.

```html
<div class="df-step-list" aria-labelledby="run-cards">
  <div class="df-step-group">
    <p class="df-step-group-heading">Data</p>
    <button type="button" data-df-card="run-checkpoints">Checkpoints</button>
    <button type="button" data-df-card="run-summary">Run summary</button>
  </div>
  <div class="df-step-group">
    <p class="df-step-group-heading">Settings</p>
    <button type="button" data-df-card="run-config">Configuration</button>
  </div>
</div>
```

The first card starts selected. Use Up, Down, Home, and End to move focus across every group. Click, tap, Enter, or Space selects a card. Tab moves from the selector to the selected detail. Controls inside a detail keep their state when you switch cards.

### Figure steps

A `.df-figure-steps` block shows a full-width figure above a selector. Add a `.df-step-details` pane to show the selected step's explanation. Hover, keyboard focus, and tap select a step. The selection stays visible when the reader moves away.

```html
<div class="df-figure-steps">
  <figure id="story">
    <svg viewBox="0 0 200 100">…</svg>
  </figure>
  <div class="df-step-panel" role="group" aria-labelledby="drawing-steps" data-df-color="blue">
    <p class="df-step-heading" id="drawing-steps">Drawing steps</p>
    <ol class="df-step-list">
      <li><button type="button" data-df-step data-df-step-detail="draw-detail">Draw</button></li>
      <li><button type="button" data-df-step data-df-step-detail="slide-detail">Slide</button></li>
    </ol>
  </div>
  <div class="df-step-details">
    <div id="draw-detail"><p>Draw the line between the two endpoints.</p></div>
    <div id="slide-detail"><p>Slide the dot along the line to the far endpoint.</p></div>
  </div>
</div>

<script>
  DocForm.anim('story', [ /* one step per entry */ ]);
</script>
```

- Place the selector heading before `.df-step-list` and use its ID to label the group. Use an `ol` for numbered steps, a `ul` for bullets, or a `div` with direct button children for compact cards. List steps use the standard marker colours.
- For title-only cards beside a smaller figure, omit `.df-step-details` and set `data-df-step-layout="side"` on `.df-figure-steps`. The cards move below the figure when space is tight.
- The figure starts at the first entry. A bare `data-df-step` uses the entry position starting at 1. Give it an explicit number to choose another step, or `0` to show the animation's starting state.
- With `anim.js` and `anim.css`, each entry shows its animation step's end state and the panel takes over playback. For a chart, SVG, or other custom figure, listen for `df:figurestep` on the figure and read `event.detail.step`.
- After the page initializes, a slider or other control can call `DocForm.steps.select('story', 2)` to update the selection and explanation. Pass a figure element or its ID. The call returns `false` if the figure or step is unavailable.

## Reveals

Add `data-df-reveal` to a block such as a figure or paragraph to fade it in the first time it scrolls into view. It plays once per page view. Callouts use their own two-way slide.

```html
<p data-df-reveal>Rises into place.</p>
<figure data-df-reveal="left">…</figure>
```

Values: empty (rise from below), `left`, `right`, or `fade`. `data-df-reveal-delay="200"` waits that many milliseconds first. Without the script, everything is simply visible.

## Split views

`.df-split` puts its children side by side: figures, tables, paragraphs, or a wrapper `<div>` holding several. Each pane glides in from its own side, one after another, the first time the split scrolls into view. On narrow screens the panes stack.

```html
<div class="df-split" data-df-split="3:2" data-df-align="center">
  <figure>…</figure>
  <div>
    <p>Text beside the figure.</p>
  </div>
</div>
```

- `data-df-split="3:2"` sets the column shares; panes are equal without it.
- `data-df-align="center"` centres the panes vertically.
- `data-df-no-reveal` keeps the split still.

## Figure zoom

With `zoom.js`, clicking an image or a figure in the page opens it full screen over a frosted backdrop. <kbd>Esc</kbd>, a click on the backdrop, or the close button returns it. Animations and sliders keep working while it is enlarged, and keyboard users can open a figure with <kbd>Enter</kbd>.

- Clicks on links, buttons, sliders, tooltip terms, and animation controls inside a figure do not open it. Clicks on a chart's plot do.
- Add `data-df-no-zoom` to a figure or image to leave it out, or `data-df-zoom` to make another block zoomable.

### Presentation tools

Add `zoomtools.css` and `zoomtools.js` (after `zoom.js`) to give the zoom view a tool pill at the top of the screen for presenting a figure. Each view opens with the cursor, and closing it throws the ink away.

| Tool | Key | What it does |
| --- | --- | --- |
| Cursor | <kbd>V</kbd> | Normal pointer: the figure's own controls work as usual. |
| Magnifier | <kbd>M</kbd> | A round lens that follows the pointer and enlarges the live figure. Scroll, or press <kbd>[</kbd> and <kbd>]</kbd>, to change it between 1.5× and 6×. Clicks go through to the figure. |
| Laser pointer | <kbd>L</kbd> | Swaps the pointer for a glowing red dot with a short fading trail. |
| Pen | <kbd>P</kbd> | Draws thin lines over the figure. |
| Highlighter | <kbd>H</kbd> | Draws wide see-through strokes. |
| Crosshair or ruler | <kbd>C</kbd> | On a chart, a crosshair that reads the x and y values under the pointer. On other figures, drag to measure a distance in the SVG's own units or the image's pixels; hold <kbd>Shift</kbd> to keep it straight. |

- With the pen or highlighter, the pill also shows colour swatches, **Undo** (<kbd>Ctrl</kbd>+<kbd>Z</kbd>), and **Clear**. Each tool remembers its colour.
- The keys do nothing while you type in a field inside the figure.

## Parameters and presets

```html
<div class="df-params">
  <div data-df-param="k" data-df-label="$k$" data-df-min="0" data-df-max="5" data-df-step="0.1" data-df-value="2"></div>
  <div data-df-param="method" data-df-type="select" data-df-label="Method" data-df-value="exact">
    <option value="exact">Exact</option>
    <option value="approx">Approximate</option>
  </div>
  <div data-df-param="trace" data-df-type="toggle" data-df-label="Show trace" data-df-value="true"></div>
</div>

<p>Twice <span class="df-math">k</span> is <span data-df-bind="2 * k" data-df-digits="1">4.0</span>.</p>
<div class="df-math" data-df-display data-df-template="k^2 = {{k * k|2}}">k^2 = 4.00</div>
```

- `data-df-param` names a control. Without `data-df-type` it is a slider; `min`, `max`, `step`, `value`, `label`, and `digits` are optional.
- `data-df-type="select"` lists its choices as `<option>` children with distinct `value`s. Its value is a string.
- `data-df-type="toggle"` is an on/off switch. Its value is `true` or `false`, set initially with `data-df-value`.
- Controls that share a name share one value and move together.
- `data-df-bind` shows the value of an expression.
- `data-df-template` fills each `{{expression|decimals}}` and re-renders math.
- Write the starting result inside each bound element so the page reads correctly without scripts.

Expressions may use any parameter name and maths functions such as `sin`, `sqrt`, and `PI`, for example `{{trace ? "shown" : "hidden"}}`.

### Presets

A preset button sets several parameters at once:

```html
<div class="df-presets" role="group" aria-label="Setups">
  <button data-df-preset='{"k": 1, "method": "exact", "trace": false}'>Baseline</button>
  <button data-df-preset='{"k": 4.5, "method": "approx"}'>Stress test</button>
</div>
```

- Every value is checked first: a known parameter, the right type, a listed choice, and within the slider range. A preset that fails is disabled and a warning explains why.
- The button whose values match the current state is marked as current.
- `DocForm.params.apply({ k: 2, trace: true })` does the same from a script and returns `false` without changing anything if a value is rejected. `DocForm.params.set(name, value)` changes one value under the same checks.

The prediction page of the `examples/transformers/` guide combines a shared temperature slider, a selection-rule choice, a blocking toggle, and three named decoding setups.

### Subscriptions

To drive a figure from parameters:

```js
DocForm.params.on(['k', 'method'], function (values, name, changed) {
  document.getElementById('dot').setAttribute('r', values.k * 3);
});
```

- The callback runs once when all listed parameters exist, then after each change that touches one of them.
- `values` is a copy of every parameter. `name` is the one parameter that changed, or `null` on the first call and when a preset changes several. `changed` lists every changed name.
- A preset calls each affected callback once, after all controls show the new values.

## Numbered figures and cross-references

With `refs.js`, figures and tables that have a caption or an `id` are numbered in page order, and so are display equations that have an `id`. An empty link to one of them fills in its label:

```html
<figure id="addition">
  <svg>…</svg>
  <figcaption>Tip-to-tail addition.</figcaption>   <!-- shows "Figure 1 Tip-to-tail addition." -->
</figure>

<div class="df-math" id="dot" data-df-display>\vec u \cdot \vec v = u_1 v_1 + u_2 v_2</div>   <!-- numbered (1) -->

<p>See <a href="#addition"></a> and <a href="#dot"></a>.</p>   <!-- "Figure 1" and "Equation (1)" -->
```

- A figure that holds only a table counts as a table, even with math in its cells; one holding a chart counts as a figure. A figure with an `id` but no caption gets a caption with just its label.
- An empty link to a heading shows the heading's text.
- Add `data-df-no-number` to skip an element, or `data-df-number` to number one without an `id`. Set `refs: { equations: 'all' }` in the manifest to number every display equation.
- With `tooltip.js`, pointing at a link to something on the same page previews it: the figure, table, or equation, or the start of a section. Links to another page of the site preview that section from the search index. Add `data-df-no-preview` to a link to turn this off.
- Links to something on the same page are green (the `--df-xref` token), so they stand apart from blue links to other pages and from dotted tooltip terms.
- Load `refs.js` before `nav.js` so a generated References heading appears in the outline.

## Sidenotes

Write a note where its marker should go:

```html
<p>
  The theorem is named after Pythagoras.<span class="df-note">Babylonian scribes used it a thousand years earlier.</span>
</p>
```

`notes.js` numbers the notes and replaces each with a small marker. When the window leaves room beside the reading column, the notes sit in the right margin next to their lines; otherwise they open as hover cards from the marker (with `tooltip.js`) or in place when the marker is clicked. Notes inside split views, tables, figures, tabs, and peek bubbles always use hover cards. Without the script a note reads as a muted aside in parentheses.

## Citations

List sources in the manifest's `bibliography` (see [manifest.md](manifest.md)) and cite them by key:

```html
<p>Attention scales well <cite data-df-cite="vaswani2017"></cite>, as later work showed <cite data-df-cite="a, b"></cite>.</p>

<h2>References</h2>
<div data-df-bibliography></div>
```

Citations show as `[1]` or `[1, 2]`, numbered in the order sources are first cited on the page. Each number links to the reference list and, with `tooltip.js`, shows the full entry on hover. The list goes into `data-df-bibliography`; without one, a References section is added at the end of the page. Unknown keys show as `?` and are reported in the console.

## Search

`search.js` opens a search palette with `Ctrl`+`K` (`⌘`+`K` on a Mac) or the pill's search button. It searches page titles, section headings, and text; arrow keys move through the results and `Enter` opens one. With an empty query it lists the site's pages.

Pages opened from disk cannot read each other, so searching the whole site needs a prebuilt index:

1. Open `docform/tools/search-index.html` in Chrome.
2. Choose the folder that holds your manifest and pages. The index is built in the page; nothing is uploaded.
3. Download `search-index.js`, save it beside your manifest, and add `search: 'search-index.js'` to the manifest.

Build the index again after editing pages. The index also records the tips and glossary terms on each page for the [glossary page](#glossary-page). Without an index, the palette searches the current page only. Add `data-df-no-search` to leave a block out of the index.

## Charts

Put the data inside an element with `data-df-chart`, either as JSON or as a table:

```html
<figure id="loss">
  <div data-df-chart="line">
    <script type="application/json">
      {
        "x": { "label": "Epoch" },
        "y": { "label": "Loss", "min": 0 },
        "series": [
          { "name": "Train", "data": [[1, 0.9], [2, 0.6], [3, 0.45]] },
          { "name": "Validation", "data": [[1, 1.0], [2, 0.7], [3, 0.62]] }
        ]
      }
    </script>
  </div>
  <figcaption>Loss during training.</figcaption>
</figure>

<div data-df-chart="bar" data-df-y-label="Accuracy (%)">
  <table>
    <tr><th>Model</th><th>Small</th><th>Large</th></tr>
    <tr><td>Baseline</td><td>71.2</td><td>74.0</td></tr>
    <tr><td>Ours</td><td>75.8</td><td>79.1</td></tr>
  </table>
</div>
```

- Types are `line`, `bar`, and `scatter`. Points are `[x, y]`, `[x, y, "label"]`, `{ "x": …, "y": …, "label": … }`, or plain numbers with `"categories": ["a", "b", …]`. Text x values give one slot per value; bar charts always do.
- A table's first column is x and every other column is a series named by its header. Without scripts the table shows instead of the chart.
- Axis options: `label`, `min`, `max`, `digits` (decimals in the readout), and `unit` (added to readout values, such as `" ms"`). `height` sets the plot height in pixels (default 260); `data-df-height`, `data-df-x-label`, and `data-df-y-label` on the element override the data.
- Missing readings: by default a line joins the points on either side of a missing value. Add `"gaps": "break"` (or `data-df-gaps="break"`) to a line chart to break it at each `null` y or blank table cell instead. The x position stays on the axis and in the table, the readout says "No data" there, and a lone reading between two gaps keeps its dot. Leave out an x value entirely to keep the old joined line.
- Reference lines: `"referenceLines": [{ "axis": "y", "value": 0.8, "label": "Alert threshold" }]` draws a dashed line with its label inside the plot. Use `"axis": "x"` for a vertical line, with a category name on text axes. Lines never stretch the axes: set the axis `min` or `max` to include one that falls off the scale. The legend names each line and its value, and marks lines that are off scale. On a table chart, put the same JSON list in `data-df-reference-lines`.
- Time axes: add `"type": "time"` to the x axis (or `data-df-x-type="time"` on the element) of a line or scatter chart. Write each x as epoch milliseconds or as an ISO timestamp with `Z` or an offset, such as `"2026-11-16T17:02:00-05:00"`. Points are spaced by the time between them, so uneven intervals look uneven. Ticks, readouts, and the table show every time in UTC, so mixed offsets line up on one clock. A timestamp without a zone is skipped with a console warning. The axis `min` and `max` and `"axis": "x"` reference lines take the same forms, and `"gaps": "break"` works as usual. Bar charts keep text categories.

  ```html
  <div data-df-chart="line" data-df-x-type="time" data-df-gaps="break">
    <table>
      <tr><th>Arrival</th><th>Sales in batch</th></tr>
      <tr><td>2026-11-16T17:02:00-05:00</td><td>14</td></tr>
      <tr><td>2026-11-16T22:31:00Z</td><td>9</td></tr>
      <tr><td>2026-11-17T09:05:00+09:00</td><td></td></tr>
    </table>
  </div>
  ```

- Log axes: add `"type": "log"` to the x or y axis (or `data-df-x-type="log"` and `data-df-y-type="log"` on the element) of a line or scatter chart to space values by powers of ten, so 0.001, 0.01, and 0.1 sit evenly apart. Use it when values span several orders of magnitude, such as learning rates or losses. Every value on that axis must be a positive number, including `min`, `max`, missing x positions, and reference lines; write small numbers as `0.0003` or `3e-4`. Readouts and the table show the values as written. If any value is zero or negative, the chart is not drawn: the element keeps its own content, so a table chart still shows its table, and the console says which value is wrong. `update(spec)` with such data returns `false` and keeps the last chart. Bar charts keep linear axes.

  ```html
  <div data-df-chart="line" data-df-x-type="log" data-df-y-type="log">
    <table>
      <tr><th>Learning rate</th><th>Validation loss</th></tr>
      <tr><td>1e-5</td><td>1.73</td></tr>
      <tr><td>1e-4</td><td>0.95</td></tr>
      <tr><td>1e-3</td><td>0.61</td></tr>
    </table>
  </div>
  ```

- Series get six fixed colours in order. Give a series `"role"` or `"color"` (or a table header `data-df-role` or `data-df-color`) to use a manifest role or a named colour instead.
- Pointing at the chart, or focusing it and pressing the arrow keys, shows the values at that spot. Charts with two or more series get a legend; line ends are labelled when they don't crowd. The Table button lists the data.
- Selectable points: give the chart a linked-highlighting group with `"highlight": "trace"` (or `data-df-highlight-group="trace"` on the element), and give points a key: `{ "x": 22.3, "y": 12, "key": "retry" }`, or `data-df-highlight-key="retry"` on a table cell. Pointing or the arrow keys only read a point; a click, Enter, or Space selects its key, and doing it again clears it. Rows, buttons, and other items with the same group and key are outlined with it, and selecting one of those outlines the point. The selection is kept by key when the chart redraws or shows its table, and needs `highlight.js`.
- From a script: `DocForm.chart(element, spec)` draws a chart and returns `{ update(spec) }`, or `null` if the data is invalid. `DocForm.chart.validate(spec)` lists the problems without drawing.

### Series toggles and range brushing

Long or crowded charts let the reader hide series and zoom into a stretch of the x axis:

```html
<div data-df-chart="line" data-df-x-type="time" data-df-brush data-df-rescale>
  <script type="application/json">{ "series": [ … ] }</script>
</div>
```

- On charts with two or more series, each legend entry is a button. Click it, or Tab to it and press Enter or Space, to hide or show that series. Series keep their colours. When every series is hidden, the plot says so. Add `"toggles": false` (or `data-df-toggles="false"`) to keep a plain legend.
- `"brush": true` (or `data-df-brush`) lets the reader drag across the plot to narrow the x range of a line or scatter chart with a number, time, or log x axis. Keyboard users focus the chart and press `+` to narrow around the value being read, `-` to widen, and Shift with the left and right arrow keys to move along. The range is shown above the plot with a Reset range button. A short drag still counts as a click, so selectable points keep working.
- By default the y axis stays the same as you hide series or narrow the range, which keeps heights comparable. Add `"rescale": true` (or `data-df-rescale`) to fit the y axis to what is shown instead. Fixed `min` and `max` values always apply.
- Readouts, the Table view, line breaks at missing values, and reference lines all follow what is shown. A reference line outside the range is marked "outside range" in the legend. Selected points stay selected while they are hidden or out of range, and show again with the outline when they come back.
- Hidden series and the range are kept when the chart updates with new data, as long as the series names and the x axis type stay the same.
- From a script: `api.visible(name, on)` hides or shows a series, and `api.range([from, to])` narrows the range (timestamps on time axes); `api.range(null)` resets it. The chart fires `df:chartview` with `{ hidden, range }` whenever the reader changes either.

The [PCA residual trace](../examples/pca/pages/telemetry.html#residual-trace) compares two ranks on a UTC axis with a telemetry gap, alert reference lines, and keyed incident points.

## Concept tables

Use `data-df-concept` on a table that compares definitions, roles, or other text. Concept tables have horizontal rules, muted headers, and space for longer labels in the first column. Hovering over a cell highlights its row and column. Use coloured tags with explicit labels for categories readers should spot quickly.

```html
<table data-df-concept>
  <caption>What an embedding represents</caption>
  <thead>
    <tr><th scope="col">Information the model needs</th><th scope="col">Representation</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">The vector associated with a vocabulary entry</th>
      <td><span class="df-tag" data-df-color="blue">Token embedding</span></td></tr>
  </tbody>
</table>
```

See the [Transformer input comparison](../examples/transformers/index.html#input-representations) for a three-column example.

## Results tables

```html
<table data-df-results data-df-heat>
  <thead>
    <tr><th>Model</th><th data-df-best="max">Accuracy (%)</th><th data-df-best="min">Latency (ms)</th></tr>
  </thead>
  <tbody>
    <tr><td>Baseline</td><td>71.2 ± 0.4</td><td>12</td></tr>
    <tr><td>Ours</td><td>75.8 ± 0.3</td><td>15</td></tr>
  </tbody>
</table>
```

- Click a header to sort: the first click puts the best (or largest, or A to Z) first, the second reverses, and the third restores the written order. Add `data-df-no-sort` to a header to keep it fixed.
- `data-df-best="max"` or `"min"` on a header makes that column's best value bold and underlined.
- `data-df-heat` on the table shades every number column except the first, stronger toward the best end; put it on a header instead to shade one column, with `"min"` or `"max"` to choose the direction. `data-df-heat-color="green"` changes the tint (blue by default).
- Cells such as `92.1 ± 0.3`, `1,204 ms`, or `12%` count as numbers; `—` and blanks are skipped and sort last. `data-df-value` on a cell gives the number to use.
- The table needs a `thead` and a `tbody`.

### Fixed ranges and pass/fail rules

```html
<table data-df-results>
  <thead>
    <tr>
      <th>Scene</th>
      <th data-df-best="min" data-df-heat-range="0, 40"
          data-df-threshold="<= 16.7" data-df-threshold-label="Frame budget">Frame time (ms)</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Menu</td><td>4.1</td></tr>
    <tr><td>City</td><td>18.9</td></tr>
    <tr><td>Loading</td><td>—</td></tr>
  </tbody>
</table>
```

- `data-df-heat-range="0, 40"` on a header shades that column against a fixed scale instead of its own smallest and largest values, so the same value gets the same shade in every table that uses the range. Values beyond either end get the end's shade. A range also turns shading on for its column.
- `data-df-threshold` on a number column's header marks each value Pass or Fail. Write `<`, `<=`, `>`, or `>=` and a number, such as `"<= 16.7"`. The rule uses the same number the column sorts by, including `data-df-value`. Cells keep their text and gain the word Pass or Fail; missing values get neither.
- `data-df-threshold-label` names the rule shown under the header, such as "Frame budget: ≤ 16.7". Without it the rule reads "Pass: ≤ 16.7".

### Column filters and filter chips

```html
<table data-df-results data-df-filters
       data-df-chips="Within budget: Latency (ms) <= 25; Small and fast: Params (M) < 5 & Latency (ms) < 15">
  <thead>
    <tr>
      <th>Model</th><th>Params (M)</th><th data-df-best="max" data-df-heat>Accuracy (%)</th>
      <th data-df-threshold="<= 25">Latency (ms)</th><th data-df-no-filter>Notes</th>
    </tr>
  </thead>
  <tbody>…</tbody>
</table>
```

- `data-df-filters` on the table adds a filter button to every header. To filter only some columns, put `data-df-filter` on those headers instead. `data-df-no-filter` leaves a column out.
- Text columns list their values with counts; untick values to hide their rows. Number columns take a Min and a Max, and date columns (such as `2026-03-01` or `2026-03-01T14:05Z`) take From and To. Leave a box empty to leave that side open. Once a bound is set, rows without a value are hidden. `data-df-filter="values"` gives a number column a value list instead, which suits columns with a few repeated values such as seeds.
- `data-df-chips` names one-click filters for the reader. Write `Label: Column op value`, with `<`, `<=`, `>`, `>=`, `=`, or `!=`. Join conditions with `&`, list alternatives with `|` (`Optimizer = adam | sgd`), and separate chips with `;`. Columns are matched by header text or `data-df-column`, ignoring case. Text matches whole cells, ignoring case.
- A row shows when it passes every column filter and every chip that is turned on. The bar above the table shows how many rows match. Clear turns every filter and chip off.
- Heat shading and best values are worked out again over the rows that are showing. Fixed heat ranges, Pass and Fail words, and the sort order stay as they are; sorting works while rows are filtered.
- On data-file tables, filters check the rows that are loaded, and they stay on after Show more.

The [Transformer run log](../examples/transformers/pages/diagnostics.html#run-filters) filters a training sweep by date, device, seed, loss, and latency budget.

## Data files

Show CSV, JSON, or YAML files as results tables or highlighted code. Pages opened from disk cannot read other files, so each data file is first wrapped as a script:

1. Open `docform/tools/data-file.html` in Chrome and choose your files. It makes one script per file, such as `runs.csv.js`, and warns about files over the default limits. Nothing is uploaded.
2. Save the script beside your page and load it before `core.js`. Load `data.js` right after `core.js` (see [include order](include-order.md)).
3. Place the data by name. The name is the file name without its extension.

```html
<div data-df-data="runs"></div>
```

- CSV and lists of flat records (JSON or YAML lists of objects whose values are text, numbers, true, false, or null) become sortable [results tables](#results-tables). Other data shows as highlighted code.
- `data-df-view="code"` shows tabular data as its original text; `data-df-view="table"` asks for a table and falls back to code when the data has no table shape; `data-df-view="tree"` shows a [tree](#data-trees).
- To choose, rename, and style columns, put a table header inside the placeholder. Each header cell picks the column named by its text or by `data-df-column`, and keeps its results-table options:

  ```html
  <div data-df-data="runs">
    <table data-df-results>
      <thead><tr>
        <th>model</th>
        <th data-df-column="latency_ms" data-df-best="min" data-df-threshold="<= 25 ms">Latency (ms)</th>
      </tr></thead>
      <tbody><tr><td colspan="2">Shown when scripts are off.</td></tr></tbody>
    </table>
  </div>
  ```

- Short data can sit in the page. A `pre` shows its text without scripts and a table or code with them; a `script` block only registers the data for placeholders elsewhere:

  ```html
  <pre data-df-data="hardware" data-df-type="csv">
    device,cores
    "Laptop, 2023",8
  </pre>
  <script type="application/yaml" data-df-data="defaults">
    epochs: 30
  </script>
  ```

- Limits: a block shows up to 5,000 rows (or code lines) with a Show more button for the rest, and asks before showing data over 1 MB. Change them per block with `data-df-max-rows="200"` and `data-df-max-size="2 MB"`.
- Data that does not parse shows the error with its line number and the raw text. CSV fields in double quotes may hold commas, line breaks, and doubled quotes (`""`); quoted fields stay text, and unquoted numbers, `true`, and `false` become values. YAML must be a single document without custom tags such as `!secret`.
- `data-df-type="csv"`, `"json"`, or `"yaml"` overrides the type from the file. From a script, `DocForm.dataset.add(name, text, type)` registers data and `DocForm.dataset.render(element)` redraws a block.

The [Transformer training diagnostics](../examples/transformers/pages/diagnostics.html) show a run log with Show more, a YAML configuration, inline CSV and JSON, a size notice, and a parse error.

### Data trees

Add `data-df-view="tree"` to a data block to browse nested JSON or YAML as a collapsible tree. Include `tree.css` and `tree.js`.

```html
<div data-df-data="config" data-df-view="tree" data-df-tree-depth="2"></div>
```

- The top level starts open. `data-df-tree-depth` sets how many levels start open; `0` closes them all.
- Click a row to open or close it, or use the buttons for Expand all and Collapse all.
- Keyboard: Up and Down move between rows, Right opens a row or moves into it, Left closes it or moves to its parent, Home and End jump to the first and last rows, Enter or Space opens or closes a row, and `*` opens a row and the rows beside it.
- Each row lists up to the block's row limit (5,000 by default). A Show more row lists the rest.
- CSV rows show as records keyed by column name.

### File dropzones

A dropzone lets readers open a CSV, JSON, or YAML file from their own computer. The browser reads the file on the reader's computer; nothing is uploaded. Include `dropzone.css` and `dropzone.js`.

```html
<div data-df-dropzone data-df-accept="json yaml" data-df-view="tree" data-df-max-size="2 MB">
  <p>Drop a metrics file from your run.</p>
</div>
```

- The dropzone has a Choose a file button. Its own content becomes the prompt; without content it says which types it takes.
- `data-df-accept` lists the types it takes, such as `"csv json"`. It takes all three by default. Files are matched by extension. Other files, and files over `data-df-max-size` (1 MB by default), are turned away with a message.
- The file shows below the dropzone with the [data views](#data-files). `data-df-view`, `data-df-max-rows`, and `data-df-tree-depth` work as they do on data blocks.
- To show the file in place of other data on the page, set `data-df-target` to the id of a chart, a data block, or a results table, or of an element that holds one:

  ```html
  <div data-df-chart="line" id="curve"> … </div>
  <div data-df-dropzone data-df-accept="csv" data-df-target="curve"></div>
  ```

  - A chart plots the first column as x and each other column as a series. It keeps its type, axis labels and types, reference lines, and the colours of series with the same names. Fixed axis bounds are dropped so the new data shows in full. A JSON or YAML file with a `series` list replaces those parts of the chart.
  - A data block or results table keeps its header, so the file's columns get the same names, best values, heat shading, and pass/fail rules. Columns are matched by name.
- Reset puts back the page's own data, or clears the file shown below the dropzone.

The [Transformer training diagnostics](../examples/transformers/pages/diagnostics.html#training-history) use sample files to replace the reference curve, run log, and static latency summary, and to open a standalone metrics tree.

## Interactive explanations

These snippets assume your HTML file sits beside the `docform/` folder. Put the shared setup in `<head>` and add the includes for each pattern you use. Put the example markup inside `<main class="df-page">`. You can open the file directly from disk. [Include order](include-order.md)

```html
<link rel="stylesheet" href="docform/css/tokens.css">
<link rel="stylesheet" href="docform/css/base.css">
<script defer src="docform/js/core.js"></script>
```

### Linked highlighting

```html
<link rel="stylesheet" href="docform/css/highlight.css">
<script defer src="docform/js/highlight.js"></script>
```

Give a button and its matching items the same `data-df-highlight-group` and `data-df-highlight-key`. Selecting the button outlines every match. Activate it again to clear the selection. Each group has its own selection.

To trace an output, tag the output and each input row, including excluded inputs. Write each row's contribution and reason in the table so readers can follow the calculation with scripts off.

```html
<p><button type="button" data-df-highlight-group="sales" data-df-highlight-key="total">
  Trace the $12 sales total
</button></p>
<table>
  <caption>Inputs to the sales total</caption>
  <thead>
    <tr><th scope="col">Arrival</th><th scope="col">Sale ID</th><th scope="col">Amount</th><th scope="col">Contribution and reason</th></tr>
  </thead>
  <tbody>
    <tr data-df-highlight-group="sales" data-df-highlight-key="total">
      <th scope="row">First</th><td>S41</td><td>$12</td><td>Included (+$12). First arrival for S41.</td>
    </tr>
    <tr data-df-highlight-group="sales" data-df-highlight-key="total">
      <th scope="row">Second</th><td>S41</td><td>$12</td><td>Excluded (+$0). S41 has already been counted.</td>
    </tr>
  </tbody>
</table>
```

### Worked-example steppers

```html
<link rel="stylesheet" href="docform/css/stepper.css">
<script defer src="docform/js/stepper.js"></script>
```

Give the ordered list an `id` and `data-df-stepper`. Each direct list item needs a unique `data-df-step-key` and a direct child marked `data-df-step-name`. Follow the name with the rule and what it produces. DocForm adds Previous, Next, and Reset and starts on the first step.

```html
<ol id="invoice" data-df-stepper>
  <li data-df-step-key="items">
    <strong data-df-step-name>Price the items</strong>
    Multiply 3 items by $4 each to get a $12 subtotal.
  </li>
  <li data-df-step-key="shipping">
    <strong data-df-step-name>Add shipping</strong>
    Add $2 to the $12 subtotal to get a $14 total.
  </li>
</ol>
```

To open a step from a script, call `DocForm.stepper.select("invoice", "shipping")`. It behaves like Previous and Next, and returns `false` for an unknown list or key. Each change sends a `df:stepperchange` event from the list, with the step's `key` in `event.detail`.

#### Parallel event timeline

Use one table column per lane. Label each column with its time unit and clock origin. Each row shows the events at one walkthrough step. For a companion row, set `data-df-stepper-view` to the list ID and `data-df-step-key` to the matching step key. The current row follows the controls. With scripts off, the full sequence and table stay visible.

```html
<ol id="delivery" data-df-stepper>
  <li data-df-step-key="send">
    <strong data-df-step-name>Send</strong>
    The sender starts the timeout when it sends S41.
  </li>
  <li data-df-step-key="retry">
    <strong data-df-step-name>Retry</strong>
    The timeout expires. The sender retries with the same sale ID, and the retry arrives first.
  </li>
  <li data-df-step-key="late">
    <strong data-df-step-name>Handle the late arrival</strong>
    The original message arrives. The receiver sees S41 again and skips it.
  </li>
</ol>
<table>
  <caption>Delivery of sale S41</caption>
  <thead>
    <tr><th scope="col">Step</th><th scope="col">Sender (seconds since first send)</th><th scope="col">Receiver (seconds since startup)</th></tr>
  </thead>
  <tbody>
    <tr data-df-stepper-view="delivery" data-df-step-key="send">
      <th scope="row">Send</th><td>0 s. Send S41.</td><td>No arrival yet.</td>
    </tr>
    <tr data-df-stepper-view="delivery" data-df-step-key="retry">
      <th scope="row">Retry</th><td>2 s. Resend S41.</td><td>22 s. Receive the retry and count S41.</td>
    </tr>
    <tr data-df-stepper-view="delivery" data-df-step-key="late">
      <th scope="row">Late arrival</th><td>No new send.</td><td>23 s. Receive the original and skip S41.</td>
    </tr>
  </tbody>
</table>
```

#### Linked trace

Give steps, source rows, and chart points the same keys to follow one event across all three. In the timeline above, swap each row's stepper attributes for `data-df-highlight-group="delivery"` and its `data-df-highlight-key`, so every row stays visible and the current one is outlined. Put a chart with the same group and point keys beside it, and connect the group to the stepper with a short script:

```html
<script>
  document.addEventListener('df:stepperchange', function (event) {
    if (event.target.id === 'delivery') DocForm.highlight.set('delivery', event.detail.key);
  });
  document.addEventListener('df:highlightchange', function (event) {
    if (event.detail.group === 'delivery' && event.detail.key) DocForm.stepper.select('delivery', event.detail.key);
  });
</script>
```

The [PCA incident timeline](../examples/pca/pages/telemetry.html#incident-timeline) links acquisition and receipt events to points on the residual trace.

### Scenario comparisons

```html
<link rel="stylesheet" href="docform/css/chart.css">
<link rel="stylesheet" href="docform/css/scenarios.css">
<script defer src="docform/js/chart.js"></script>
<script defer src="docform/js/scenarios.js"></script>
```

Use one header row and put the measure, unit, baseline, and named variants in that order. Mark each condition row with `data-df-condition`. By default, each variant must change exactly one marked condition from the baseline, so any outcome change can be attributed to that condition. Write outcome values as plain numbers and put their units in the unit column. Leave that column's cell empty for unitless values.

```html
<p>Apply each threshold to the same readings (7, 9, 11, and 13 kPa).
  Alert when a reading meets or exceeds the threshold.</p>
<table data-df-scenarios>
  <caption>Effect of changing the alert threshold</caption>
  <thead>
    <tr><th scope="col">Measure</th><th scope="col">Unit</th><th scope="col">Baseline</th><th scope="col">Lower threshold</th><th scope="col">Higher threshold</th></tr>
  </thead>
  <tbody>
    <tr data-df-condition>
      <th scope="row">Alert threshold</th><td>kPa</td><td>10</td><td>8</td><td>12</td>
    </tr>
    <tr><th scope="row">Alerts</th><td>readings</td><td>2</td><td>3</td><td>1</td></tr>
  </tbody>
</table>
```

The comparison keeps the baseline fixed and uses the same scale and row order for outcomes with the same unit. It names changes in text and marks changed outcomes on the chart. Reset selects the first variant again. With scripts off, all columns remain visible.

To compare named configurations that change several conditions together, such as candidate release settings, set `data-df-scenarios="configurations"`. Each variant must change at least one condition. The comparison lists every changed condition with its baseline and variant values, in table order, and marks those cells. An outcome difference then reflects the combined effect of all listed changes, so it cannot be attributed to any one condition. Use the default mode to test one cause, and use configurations to choose between complete setups.

```html
<table data-df-scenarios="configurations">
  <caption>Candidate alert setups</caption>
  <thead>
    <tr><th scope="col">Measure</th><th scope="col">Unit</th><th scope="col">Current</th><th scope="col">Quiet nights</th><th scope="col">Fast response</th></tr>
  </thead>
  <tbody>
    <tr data-df-condition><th scope="row">Alert threshold</th><td>kPa</td><td>10</td><td>12</td><td>9</td></tr>
    <tr data-df-condition><th scope="row">Averaging window</th><td>min</td><td>5</td><td>15</td><td>5</td></tr>
    <tr><th scope="row">False alerts</th><td>per week</td><td>6</td><td>1</td><td>9</td></tr>
    <tr><th scope="row">Detection delay</th><td>min</td><td>4</td><td>11</td><td>3</td></tr>
  </tbody>
</table>
```

### Prediction and explanation

Ask for a prediction before revealing the reasoning. Put the worked answer in a `details` element, then give a second case with new inputs and the same rule. Use `data-df-no-bubble` to keep each answer expandable in place on pages that load `bubble.js`. Native `details` works without scripts.

```html
<p>A right triangle has legs of 6 cm and 8 cm. Predict the hypotenuse length.</p>
<details data-df-no-bubble>
  <summary>Show the calculation</summary>
  <p>Square the leg lengths and add them. 6² + 8² = 100, so the
    hypotenuse is √100 = 10 cm.</p>
</details>

<p>Try the same rule with legs of 5 cm and 12 cm. What length do you get?</p>
<details data-df-no-bubble>
  <summary>Check the second case</summary>
  <p>5² + 12² = 169, so the hypotenuse is √169 = 13 cm.</p>
</details>
```
