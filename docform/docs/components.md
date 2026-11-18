# Component reference

Each feature needs its stylesheet in `<head>` and, where listed, its script after `core.js`. Content stays readable if a script is missing.

| Feature | Stylesheet | Script |
| --- | --- | --- |
| Layout and typography | `tokens.css`, `base.css` | `core.js` |
| Lists | `base.css` | none |
| Sidebar, outline, heading links | `nav.css` | `nav.js` |
| Theme toggle | `theme.css` | `theme.js` (in `<head>`) |
| Control pill, focus mode, shortcuts | `controls.css` | `controls.js` |
| Roles legend | `roles.css` | `roles.js` |
| Math | `vendor/katex/katex.min.css`, `math.css` | `vendor/katex/katex.min.js`, `math.js` |
| Tags and callouts | `blocks.css` | none |
| Peek bubbles | `blocks.css`, `bubble.css` | `bubble.js` |
| Tooltips and glossary | `tooltip.css` | `tooltip.js` |
| Code blocks, annotations, diffs | `code.css` | `code.js` |
| Tabs | `tabs.css` | `tabs.js` |
| Animated figures | `anim.css` | `anim.js` |
| Figure steps | `steps.css` | `steps.js` |
| Reveals and split views | `reveal.css` | `reveal.js` |
| Figure zoom | `zoom.css` | `zoom.js` |
| Sliders | `params.css` | `params.js` |
| Numbering, cross-references, citations | `refs.css` | `refs.js` |
| Sidenotes | `notes.css` | `notes.js` |
| Search | `search.css` | `search.js` |
| Charts | `chart.css` | `chart.js` |
| Results tables | `results.css` | `results.js` |
| Linked highlighting | `highlight.css` | `highlight.js` |
| Worked-example steppers | `stepper.css` | `stepper.js` |
| Scenario comparisons | `chart.css`, `scenarios.css` | `chart.js`, `scenarios.js` |

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

The sidebar lists the manifest's pages and an outline of the current page's `h2` and `h3` headings, highlighting the one in view. Only the `h3` list of the section in view stays open; readers can open others with the arrow beside a heading, and they stay open until closed or the page reloads. On narrow screens the sidebar becomes a drawer. Add `data-df-no-outline` to a heading (or a section around it) to leave it out, and `data-df-no-pager` on `main` to hide the previous and next links.

Each outlined heading shows a link icon on hover that copies the URL of its section. The reading column is 880px wide; change it with the `--df-content-width` token and the side padding with `--df-page-gutter`. Scrollbars in the sidebar, code blocks, and tables stay hidden until the pointer is on them.

Standalone figures, tables, and their captions are centered in the reading column.

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
- a sidebar button that slides the navigation away and recentres the page, or opens the drawer on narrow screens;
- a focus-mode button that keeps the section in the middle of the screen, everything in the central part of the screen, and the page title sharp, and blurs the rest; pointing at a blurred block sharpens it;
- a search button, when `search.js` is loaded;
- the theme toggle, when `theme.js` is loaded.

The page scrollbar stays hidden until the pointer comes near the right edge. The sidebar and focus-mode choices are remembered across pages. Keyboard shortcuts work anywhere except while typing in a form field:

| Key | Action |
| --- | --- |
| `T` | Switch theme |
| `F` | Focus mode |
| `N` | Sidebar |
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

The icon and title are optional.

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

## Code blocks

```html
<pre><code class="language-python">print("hello")</code></pre>
```

Adds a language label and a copy button, and highlights JavaScript, JSON, Python, HTML, CSS, and shell. The language can also be given as `data-df-lang="js"`. Add `data-df-no-code` to a `pre` to leave it plain.

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

## Figure steps

A `.df-figure-steps` block shows a full-width figure above an independently scrolling list of titles. Add a `.df-step-details` panel to show the selected step's subtitle and explanation beside the list. On narrow screens the explanation moves below the list. Hover, keyboard focus, and tap select a step. The selection stays visible when the reader moves away.

```html
<div class="df-figure-steps">
  <figure id="story">
    <svg viewBox="0 0 200 100">…</svg>
  </figure>
  <ol class="df-step-panel" data-df-color="blue" aria-label="Drawing steps">
    <li><button type="button" data-df-step data-df-step-detail="draw-detail">Draw</button></li>
    <li><button type="button" data-df-step data-df-step-detail="slide-detail">Slide</button></li>
  </ol>
  <div class="df-step-details">
    <div id="draw-detail"><p>Draw the line between the two endpoints.</p></div>
    <div id="slide-detail"><p>Slide the dot along the line to the far endpoint.</p></div>
  </div>
</div>

<script>
  DocForm.anim('story', [ /* one step per entry */ ]);
</script>
```

- Use an `ol` for numbered steps, a `ul` for bullets, or a `div` with direct button children for compact cards. List steps use the standard marker colours. The scrollbar appears when the pointer reaches its track.
- For title-only cards beside a smaller figure, omit `.df-step-details` and set `data-df-step-layout="side"` on `.df-figure-steps`. The cards move below the figure when space is tight.
- The figure starts at the first entry. A bare `data-df-step` uses the entry position starting at 1. Give it an explicit number to choose another step, or `0` to show the animation's starting state.
- With `anim.js` and `anim.css`, each entry shows its animation step's end state and the panel takes over playback. For a chart, SVG, or other custom figure, listen for `df:figurestep` on the figure and read `event.detail.step`.
- After the page initializes, a slider or other control can call `DocForm.steps.select('story', 2)` to update the selection and explanation. Pass a figure element or its ID. The call returns `false` if the figure or step is unavailable.

## Reveals

Add `data-df-reveal` to any block to fade it in the first time it scrolls into view. It plays once per page view.

```html
<div class="df-callout" data-df-color="blue" data-df-reveal>Rises into place.</div>
<div class="df-callout" data-df-color="green" data-df-reveal="left">Slides in from the left.</div>
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

- Clicks on links, buttons, sliders, and animation controls inside a figure do not open it.
- Add `data-df-no-zoom` to a figure or image to leave it out, or `data-df-zoom` to make another block zoomable.

## Sliders

```html
<div class="df-params">
  <div data-df-param="k" data-df-label="$k$" data-df-min="0" data-df-max="5" data-df-step="0.1" data-df-value="2"></div>
</div>

<p>Twice <span class="df-math">k</span> is <span data-df-bind="2 * k" data-df-digits="1"></span>.</p>
<div class="df-math" data-df-display data-df-template="k^2 = {{k * k|2}}">k^2</div>
```

- `data-df-param` names a slider; `min`, `max`, `step`, `value`, `label`, and `digits` are optional.
- `data-df-bind` shows the value of an expression.
- `data-df-template` fills each `{{expression|decimals}}` and re-renders math.

Expressions may use any slider name and maths functions such as `sin`, `sqrt`, and `PI`. To drive a figure from sliders:

```js
DocForm.params.on('k', function (values) {
  document.getElementById('dot').setAttribute('r', values.k * 3);
});
```

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

Build the index again after editing pages. Without an index, the palette searches the current page only. Add `data-df-no-search` to leave a block out of the index.

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
- Series get six fixed colours in order. Give a series `"role"` or `"color"` (or a table header `data-df-role` or `data-df-color`) to use a manifest role or a named colour instead.
- Pointing at the chart, or focusing it and pressing the arrow keys, shows the values at that spot. Charts with two or more series get a legend; line ends are labelled when they don't crowd. The Table button lists the data.
- From a script: `DocForm.chart(element, spec)` draws a chart and returns `{ update(spec) }`.

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

### Scenario comparisons

```html
<link rel="stylesheet" href="docform/css/chart.css">
<link rel="stylesheet" href="docform/css/scenarios.css">
<script defer src="docform/js/chart.js"></script>
<script defer src="docform/js/scenarios.js"></script>
```

Use one header row and put the measure, unit, baseline, and named variants in that order. Mark each condition row with `data-df-condition`. Each variant must change exactly one marked condition from the baseline. Write outcome values as plain numbers and put their units in the unit column. Leave that column's cell empty for unitless values.

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
