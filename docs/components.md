# Component reference

Use the [offline entry](include-order.md) and enable the features your page needs. The default reading profile covers typography, navigation, theme, reading controls, roles, tooltips, references, citations, sidenotes, search, tags, and callouts.

| To add | Enable |
| --- | --- |
| TeX, syntax highlighting, or a site glossary | `math`, `code`, or `glossary` |
| Peek bubbles, reveals, split views, or wide blocks | `peek-bubbles`, `reveals`, `split-views`, or `wide` |
| Tabs, standalone cards, or worked-example controls | `tabs`, `cards`, or `stepper` |
| Animated figures and figure-step panels | `animation` and `figure-steps` as needed |
| Full-screen figures and presentation tools | `zoom` or `zoom-tools` |
| Scoped sliders, switches, and presets | `parameters` |
| Charts, guided playback, results tables, scenarios, and evaluation matrices | `chart`, `chart-playback`, `results`, `scenarios`, or `matrix` |
| Named sources, raw views, and interactive trees | `data`, `data-view`, and `tree` as needed |
| Local file pickers | `dropzone` and the target's feature |
| Shared selection between keyed items | `selection` |

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

With `controls` enabled, a small frosted pill appears in the top-left corner of the page, beside the sidebar. It needs no markup. It holds:

- a ring that fills as the reader scrolls through the page;
- a sidebar button that cycles through shown, hidden, and auto-hide on desktop and opens the drawer on narrow screens and touch-only devices
- a focus-mode button that keeps the section in the middle of the screen, everything in the central part of the screen, and the page title sharp, and blurs the rest; pointing at a blurred block sharpens it;
- a search button, when `search` is enabled;
- the theme toggle, when `theme` is enabled.

In auto-hide, move the pointer to the far left edge to open the sidebar and shift the page. Moving the pointer away closes it again. With the desktop sidebar closed, numbered rings follow the page outline in reading order. The current ring glows and fills as you scroll, and earlier rings stay filled. Hover over the rings or focus a numbered link to see all subsection names. Select a number or name to jump to that heading.

The page scrollbar stays hidden until the pointer comes near the right edge. The sidebar and focus-mode choices are remembered across pages. Keyboard shortcuts work anywhere except while typing in a form field.

| Key | Action |
| --- | --- |
| `T` | Switch theme |
| `F` | Focus mode |
| `N` | Cycle sidebar modes or toggle the drawer |
| `J` / `K` | Next / previous section |
| `Ctrl`+`K` (`⌘`+`K` on a Mac) | Search, with `search` enabled |

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

The icon and title are optional. With `reveals` enabled, callouts in `.df-page` slide in from the right as they reach the middle of the viewport and slide back to the right as they leave that area. Add `data-df-no-reveal` to keep an individual callout still.

## Peek bubbles

```html
<details data-df-color="blue">
  <summary>Show the proof</summary>
  <p>…</p>
</details>
```

With `peek-bubbles` enabled, every `details` in the page becomes a small tinted bubble showing its title. As the reader scrolls it towards the middle of the screen, it flies into a large frosted panel in the empty space to the right of the text. When several bubbles are near the middle at once, their panels stack vertically. A panel's content is blurred except while the pointer is over it or keyboard focus is inside it; a tap clears it on touch screens. Each panel scrolls on its own. Once the reader scrolls past the bubble, the panel shrinks back into it. Clicking the bubble brings it to the middle and opens it right away; `Escape` closes it. When the space to the right is too narrow, the bubble expands in place instead.

The tint is purple unless `data-df-color` or `data-df-role` says otherwise. Put `data-df-no-bubble` on a `details` (or a block around it) to leave it as a plain card. Without the script, each `details` shows as a tinted card.

## Tooltips and glossary

```html
<span data-df-tip="The side opposite the right angle.">hypotenuse</span>
<span data-df-term>vector</span>
<span data-df-term="dot product">inner product</span>
```

`data-df-tip` holds the text directly. `data-df-term` looks up the manifest glossary, using the element's own text when the attribute is empty. Both accept `$…$` math; write `\$` for a literal dollar sign.

Terms with extended text (the glossary's `more`, see [manifest.md](manifest.md)) show a ring in their tooltip. Press and hold the term, by mouse, touch, or Enter, to fill the ring and open the larger card. Give one term its own extended text with `data-df-more` as HTML, or with `data-df-more-id` naming a `template`:

```html
<span data-df-term data-df-more-id="eigen-more">eigenvector</span>
<template id="eigen-more"><p>For a shear, $e_1$ is one.</p></template>
```

An empty `data-df-more` turns the card off for that term, and `data-df-hold="900"` changes its hold time.

With `options.tooltips.autoLink: true` in the manifest, every glossary term in paragraphs and list items becomes a tooltip term automatically. These get a fainter underline than hand-marked terms and are not added to the Tab order. To link terms on one page or block only, put `data-df-autolink` on it; to keep a block out, use `data-df-no-autolink`.

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
<pre data-df-annotation-list="norm-notes" data-df-lines="3-4"><code class="language-python">
def norm(v):
    total = 0  # (1)
    for x in v:
        total += x * x
    return total ** 0.5  # (2)
</code></pre>
<ol id="norm-notes">
  <li>Start from zero.</li>
  <li>The square root of the sum of squares.</li>
</ol>
```

- `data-df-lines` tints lines by number, such as `"2"`, `"3-4"`, or `"1, 5-7"`.
- With `data-df-annotation-list`, a comment at the end of a line that holds only numbers, such as `# (1)` or `// (2) (3)`, becomes a circled marker. The comment is removed, also from copied code.
- Marker `(n)` matches item `n` of the numbered list named by the plain ID. Pointing at a marker shows its note and lights up the item; clicking it scrolls to the item. Pointing at an item lights up its markers and lines.

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
<div class="df-tabs" data-df-selection-group="lang">
  <div data-df-tab="JavaScript" data-df-key="js"><pre><code class="language-js">…</code></pre></div>
  <div data-df-tab="Python" data-df-key="python"><pre><code class="language-python">…</code></pre></div>
</div>
```

Give each panel a `data-df-tab` label and a unique `data-df-key`. Tab sets sharing a selection group switch together by key. Set `persist: true` for that group in the site manifest to remember the choice across pages where the browser shares storage. Add `data-df-initial` to choose the panel’s local starting item.

## Animated figures

```html
<figure id="demo">
  <svg viewBox="0 0 200 100">
    <path id="line" class="df-stroke" data-df-color="blue" d="M10 50 H190"/>
    <circle id="dot" class="df-fill" data-df-role="example" cx="10" cy="50" r="6"/>
  </svg>
</figure>

<script>
  DocForm.setup(function (df) {
    df.animation.mount('demo', { caption: 'Press play.', steps: [
      { key: 'draw', caption: 'Draw the line.', actions: [{ draw: '#line' }] },
      { key: 'slide', caption: 'Slide the dot along it.', actions: [{ move: '#dot', to: [180, 0], easing: 'ease-out' }] },
      { key: 'shrink', caption: 'Shrink it.', actions: [{ attr: '#dot', name: 'r', to: 3 }] }
    ] });
  });
</script>
```

Each step has a caption (which may contain `$…$` math) and a list of actions:

- `draw`: draws a stroke from start to end.
- `fade`: fades in, or set `to: 0` to fade out.
- `move`: shifts by `to: [x, y]` in SVG units.
- `attr`: tweens an attribute (`name`) to a value.

Actions accept `duration`, `delay` (in milliseconds), and `easing` (`ease`, `linear`, `ease-in`, `ease-out`, `ease-in-out`, `back-out`). Options include `caption` (shown before the first step), `duration`, `easing`, `hold` (pause between steps while playing), and `autoplay` (play when scrolled into view; or put `data-df-animation-autoplay` on the figure). A stopped figure also plays when a mouse or pen pointer moves onto it: a paused one resumes and a finished one starts again. After the reader presses Pause, it stays paused until the pointer leaves.

SVG shapes take colours with `data-df-color` or `data-df-role` plus a paint class: `df-stroke`, `df-fill`, or `df-fill-bg` (the pale tint). `df-grid`, `df-axis`, and `df-muted` give neutral greys for backgrounds.

Page scripts can reach a figure's controller later with `DocForm.animation.get('demo')`. Use `go('slide')` to jump to the end of a step or `to('slide')` to animate to it.

## Card panels and figure steps

Enable `cards` or `figure-steps`. The selector and detail share a capped height and scroll independently when there is room to sit side by side. On narrow pages the detail follows the selector. Scrollbars appear when the pointer reaches their tracks. The selected entry is bold, and its highlight slides to each new selection. With scripts disabled or in print, every card detail is visible.

### Standalone cards

Use `.df-card-panel` for a selector beside authored HTML. Give each button a unique `data-df-key` and a `data-df-detail` value that matches the ID of one direct child of `.df-step-details`. Use distinct IDs across the page. The detail can contain any combination of prose, code, tabs, and figures.

```html
<div class="df-card-panel">
  <div class="df-step-panel" data-df-color="blue">
    <p class="df-step-heading" id="setup-cards">Setup options</p>
    <div class="df-step-list" aria-labelledby="setup-cards">
      <button type="button" data-df-key="setup-local" data-df-detail="setup-local">Local file</button>
      <button type="button" data-df-key="setup-shared" data-df-detail="setup-shared">Shared folder</button>
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
    <button type="button" data-df-key="run-checkpoints" data-df-detail="run-checkpoints">Checkpoints</button>
    <button type="button" data-df-key="run-summary" data-df-detail="run-summary">Run summary</button>
  </div>
  <div class="df-step-group">
    <p class="df-step-group-heading">Settings</p>
    <button type="button" data-df-key="run-config" data-df-detail="run-config">Configuration</button>
  </div>
</div>
```

Mark the starting card with `data-df-initial` or use the default first card. Use Up, Down, Home, and End to move focus across every group. Click, tap, Enter, or Space selects a card. Tab moves from the selector to the selected detail. Controls inside a detail keep their state when you switch cards.

### Figure steps

A `.df-figure-steps` block shows a full-width figure above a selector. Add a `.df-step-details` pane to show the selected step's explanation. Hover, keyboard focus, and tap select a step. The selection stays visible when the reader moves away.

```html
<div class="df-figure-steps" id="story-steps">
  <figure id="story">
    <svg viewBox="0 0 200 100">
      <path id="line" class="df-stroke" d="M10 50 H190"/>
      <circle id="dot" class="df-fill" cx="10" cy="50" r="6"/>
    </svg>
  </figure>
  <div class="df-step-panel" role="group" aria-labelledby="drawing-steps" data-df-color="blue">
    <p class="df-step-heading" id="drawing-steps">Drawing steps</p>
    <ol class="df-step-list">
      <li><button type="button" data-df-key="draw" data-df-animation-key="draw" data-df-detail="draw-detail">Draw</button></li>
      <li><button type="button" data-df-key="slide" data-df-animation-key="slide" data-df-detail="slide-detail">Slide</button></li>
    </ol>
  </div>
  <div class="df-step-details">
    <div id="draw-detail"><p>Draw the line between the two endpoints.</p></div>
    <div id="slide-detail"><p>Slide the dot along the line to the far endpoint.</p></div>
  </div>
</div>

<script>
  DocForm.animation.mount('story', {steps: [
    {key: 'draw', actions: [{draw: '#line'}]},
    {key: 'slide', actions: [{move: '#dot', to: [180, 0]}]}
  ]});
</script>
```

- Place the selector heading before `.df-step-list` and use its ID to label the group. Use an `ol` for numbered steps, a `ul` for bullets, or a `div` with direct button children for compact cards. List steps use the standard marker colours.
- For title-only cards beside a smaller figure, omit `.df-step-details` and set `data-df-step-layout="side"` on `.df-figure-steps`. The cards move below the figure when space is tight.
- Set `data-df-initial` on the local starting item, or use the default first item. The button's `data-df-animation-key` selects a named animation step. Use `start` for the animation's opening state.
- After startup, `DocForm.figureSteps.get('story-steps').select('slide')` updates the figure and detail. For a custom figure, listen for `df:figure-steps:change` on the wrapper and read `event.detail.current.key`.

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

With `zoom` enabled, clicking an image or a figure in the page opens it full screen over a frosted backdrop. <kbd>Esc</kbd>, a click on the backdrop, or the close button returns it. Animations and sliders keep working while it is enlarged, and keyboard users can open a figure with <kbd>Enter</kbd>.

- Clicks on links, buttons, sliders, tooltip terms, and animation controls inside a figure do not open it. Clicks on a chart's plot do.
- Add `data-df-no-zoom` to a figure or image to leave it out, or `data-df-zoom` to make another block zoomable.

### Presentation tools

Enable `zoom-tools` to give the zoom view a tool pill at the top of the screen for presenting a figure. Each view opens with the cursor, and closing it throws the ink away.

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

Define a parameter once, then use it in as many controls as you need. Controls with the same key in the same scope stay in sync. A separate scope can use the same key with its own value and limits.

Put the definition in your page configuration before loading `docform.js`.

```html
<script type="application/json" data-df-page>
{
  "features": {"parameters": true},
  "parameterScopes": {
    "model": {
      "gain": {"type": "range", "min": 0, "max": 5, "step": 0.1, "default": 2}
    }
  }
}
</script>
```

Bind controls and text inside a scope. To use the same parameter elsewhere, add `data-df-scope="model"` to the control, binding, or preset.

```html
<div class="df-params" data-df-parameter-scope="model">
  <div data-df-parameter="gain" data-df-parameter-label="Gain"></div>
  <p>Doubled gain is <span data-df-bind="2 * gain" data-df-digits="1">4.0</span>.</p>
  <button type="button" data-df-preset='{"gain":2}'>Baseline</button>
</div>
```

A preset applies its values together and is marked current when they all match. The same scope can include sliders, dropdowns, and switches. Write the initial result in each bound element so readers can still see it without scripts.

Use a subscription to update a figure or another output in your page script.

```js
DocForm.ready(function (DF) {
  DF.parameters.scope('model').subscribe(function (values) {
    document.getElementById('dot').setAttribute('r', values.gain * 3);
  }, { keys: ['gain'], immediate: true });
});
```

Use `"type": "multiselect"` for a checkbox group with several selected choices. Presets set these choices with an array, such as `{"runs":["r04"]}`. The [Transformer prediction page](../examples/transformers/pages/prediction.html) shows linked decoder sliders and a separate comparison with its own Reset button. The [parameter reference](../docform/docs/interact/parameters.md) lists the definition types and controller methods.

## Numbered figures and cross-references

With `references` enabled, figures and tables that have a caption or an `id` are numbered in page order, and so are display equations that have an `id`. An empty link to one of them fills in its label:

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
- Add `data-df-no-number` to skip an element, or `data-df-number` to number one without an `id`. Set `options.references.equations` to `"all"` in the manifest to number every display equation.
- With `tooltips` enabled, pointing at a link to something on the same page previews it: the figure, table, or equation, or the start of a section. Links to another page of the site preview that section from the search index. Add `data-df-no-preview` to a link to turn this off.
- Links to something on the same page are green (the `--df-xref` token), so they stand apart from blue links to other pages and from dotted tooltip terms.

## Sidenotes

Write a note where its marker should go:

```html
<p>
  The theorem is named after Pythagoras.<span class="df-note">Babylonian scribes used it a thousand years earlier.</span>
</p>
```

The `sidenotes` feature numbers the notes and replaces each with a small marker. When the window leaves room beside the reading column, the notes sit in the right margin next to their lines; otherwise they open as hover cards from the marker (with `tooltips`) or in place when the marker is clicked. Notes inside split views, tables, figures, tabs, and peek bubbles always use hover cards. Without the script a note reads as a muted aside in parentheses.

## Citations

List sources in the manifest's `options.citations.entries` (see [manifest.md](manifest.md)) and cite them by key:

```html
<p>Attention scales well <cite data-df-cite="vaswani2017"></cite>, as later work showed <cite data-df-cite="a, b"></cite>.</p>

<h2>References</h2>
<div data-df-bibliography></div>
```

Citations show as `[1]` or `[1, 2]`, numbered in the order sources are first cited on the page. Each number links to the reference list and, with `tooltips`, shows the full entry on hover. The list goes into `data-df-bibliography`; without one, a References section is added at the end of the page. Unknown keys show as `?` and are reported in the console.

## Search

The `search` feature opens a palette with `Ctrl`+`K` (`⌘`+`K` on a Mac) or the pill's search button. It searches page titles, section headings, and text; arrow keys move through the results and `Enter` opens one. With an empty query it lists the site's pages.

Pages opened from disk cannot read each other, so searching the whole site needs a prebuilt index:

1. Set `assets.search.output` in your JSON site manifest to the path where you want the index.
2. Open [the asset tool](../docform/tools/assets.html) from disk and choose your site folder.
3. Select the search index. Save it to the site folder, or download it and move it to the destination shown.

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
- Selectable points: give the chart a selection group with `"selectionGroup": "trace"` (or `data-df-selection-group="trace"` on the element), and give points a key: `{ "x": 22.3, "y": 12, "key": "retry" }`, or `data-df-key="retry"` on a table cell. Pointing or the arrow keys only read a point; a click, Enter, or Space selects its key, and doing it again clears it. Rows, buttons, and other items with the same group and key are outlined with it, and selecting one of those outlines the point. The selection is kept by key when the chart redraws or shows its table, and needs `highlight.js`.
- From a script: `DocForm.chart.get('curve')` retrieves the chart controller after startup. Call `update(spec)` to apply a new spec. `DocForm.chart.validate(spec)` lists the problems without drawing.

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

## Evaluation walkthroughs

- **Guide readers through training.** Enable `chart-playback` and put `data-df-chart-playback` on an ordered list. Point it at a numeric line chart with `data-df-target` and give each note a `data-df-key` and `data-df-x`. To advance several charts with the same x units, use the same `data-df-x-group` on the list and charts. Keep a table inside each chart host for reading with scripts off. [Guided training example](../examples/transformers/pages/diagnostics.html#guided-training)
- **Plot grouped records and supplied intervals.** For a named chart, map `x` and `value` to fields and set `group.field` to the field that names each series. A loss estimate can carry lower and upper bounds, shown as bands on lines and whiskers on scatter and bar charts. A mapped results column can display the bounds alongside its estimate. [Chart mapping and interval reference](../docform/docs/data/charts.md#named-source)
- **Share run filters.** Define a run choice in `parameterScopes`, then bind the chart and results instances to it with the same `filter`, for example `{"scope":"evaluation","fields":{"runs":"run"},"where":{"split":"test"}}`. The controls update both views. [Held-out results example](../examples/transformers/pages/diagnostics.html#heldout-results)
- **Report paired effects.** In a named scenario outcome, map the supplied difference and the field containing the baseline key with `pairedDifference`. Give that difference its own bounds when available. [Paired-loss example](../examples/transformers/pages/diagnostics.html#paired-loss)
- **Switch between counts and proportions.** Enable `matrix` and give a table `data-df-matrix` and a named source. Map actual and predicted classes to rows and columns and provide a measure for each numeric field. Supply the normalized values in the source and include both values in the authored fallback table. [Confusion matrix example](../examples/transformers/pages/diagnostics.html#token-confusion)

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
- `data-df-chips` names one-click filters for the reader. Write `Label: Column op value`, with `<`, `<=`, `>`, `>=`, `=`, or `!=`. Join conditions with `&`, list alternatives with `|` (`Optimizer = adam | sgd`), and separate chips with `;`. Columns are matched by `data-df-field` or header text, ignoring case. Text matches whole cells, ignoring case.
- A row shows when it passes every column filter and every chip that is turned on. The bar above the table shows how many rows match. Clear turns every filter and chip off.
- Heat shading and best values are worked out again over the rows that are showing. Fixed heat ranges, Pass and Fail words, and the sort order stay as they are; sorting works while rows are filtered.
- On data-file tables, filters check the rows that are loaded, and they stay on after Show more.

The [Transformer run log](../examples/transformers/pages/diagnostics.html#run-filters) filters a training sweep by date, device, seed, loss, and latency budget.

## Data files

Declare a named dataset once and use it in one or more charts, results tables, scenario comparisons, or raw data views. Enable `data-view` for raw views or `data` alongside named-source charts, results, and scenarios.

```html
<script type="text/csv" data-df-source="runs">
  run,latency_ms
  r01,12
</script>
<div data-df-source="runs" data-df-data-view="table"></div>
```

For a separate CSV, JSON, or YAML file, set its `source` and `output` under `assets.data` in the site manifest. Select that output in [the asset tool](../docform/tools/assets.html) to generate the local script. For inline data you want readers to see with scripts disabled, use a `pre` with `data-df-source` and a type such as `data-df-source-type="csv"`.

A raw data view can show a table, code, or a tree. A table template can use `data-df-field="latency_ms"` on a header labelled “Latency (ms)”. This lets the file reorder its columns without changing the table. Use `data-df-max-rows` to adjust the preview batch and `data-df-max-size` to adjust the size limit. A parsing error shows the reason and the raw text.

[Named data and mapping reference](../docform/docs/data/data-blocks.md)

### Data trees

Enable `data-view` and `tree` and set `data-df-data-view="tree"` to explore nested data. `data-df-tree-depth` sets how many levels start open. Use the arrow keys to move through and expand branches, or use Expand all and Collapse all. Long branches offer Show more.

### File dropzones

Readers can choose a CSV, JSON, or YAML file or drag it onto the zone. The browser reads the file locally. Without a destination, a dropzone displays the file below its prompt.

```html
<div data-df-dropzone data-df-accept="csv" data-df-target="curve">
  <p>Choose a CSV for this chart.</p>
</div>
<div data-df-dropzone data-df-accept="csv" data-df-target-source="runs">
  <p>Choose a CSV for the shared runs.</p>
</div>
```

`data-df-target` replaces a single view by its ID. `data-df-target-source` replaces a named dataset after all views accept the file. Reset on a local override returns to the current dataset. Reset on a shared replacement restores the original dataset.

[Transformer training diagnostics](../examples/transformers/pages/diagnostics.html#shared-runs)

## Interactive explanations

Put these patterns inside `<main class="df-page">` and opt into their features in your [page configuration](include-order.md).

### Linked selection

Give a button and its matching items the same `data-df-selection-group` and `data-df-key`. Selecting the button outlines every match. Activate it again to clear the selection. Each group has its own selection.

Enable `selection`. A page can set the start under `selectionGroups` in its configuration. For example, `{"selectionGroups":{"sales":{"initial":"total"}}}` opens the sales trace on its total.

To trace an output, tag the output and each input row, including excluded inputs. Write each row's contribution and reason in the table so readers can follow the calculation with scripts off.

```html
<p><button type="button" data-df-selection-group="sales" data-df-key="total">
  Trace the $12 sales total
</button></p>
<table>
  <caption>Inputs to the sales total</caption>
  <thead>
    <tr><th scope="col">Arrival</th><th scope="col">Sale ID</th><th scope="col">Amount</th><th scope="col">Contribution and reason</th></tr>
  </thead>
  <tbody>
    <tr data-df-selection-group="sales" data-df-key="total">
      <th scope="row">First</th><td>S41</td><td>$12</td><td>Included (+$12). First arrival for S41.</td>
    </tr>
    <tr data-df-selection-group="sales" data-df-key="total">
      <th scope="row">Second</th><td>S41</td><td>$12</td><td>Excluded (+$0). S41 has already been counted.</td>
    </tr>
  </tbody>
</table>
```

### Worked-example steppers

Enable `stepper`.

Give the ordered list an `id` and `data-df-stepper`. Each direct list item needs a unique `data-df-key` and a direct child marked `data-df-step-label`. Follow the name with the rule and what it produces. DocForm adds Previous, Next, and Reset. Mark the starting item with `data-df-initial` or use the default first step.

```html
<ol id="invoice" data-df-stepper>
  <li data-df-key="items">
    <strong data-df-step-label>Price the items</strong>
    Multiply 3 items by $4 each to get a $12 subtotal.
  </li>
  <li data-df-key="shipping">
    <strong data-df-step-label>Add shipping</strong>
    Add $2 to the $12 subtotal to get a $14 total.
  </li>
</ol>
```

To open a step from a script after startup, call `DocForm.stepper.get("invoice").select("shipping")`. It returns `false` for an unknown key. The list emits `df:stepper:change` with the key in `event.detail.current.key`.

#### Parallel event timeline

Use one table column per lane. Label each column with its time unit and clock origin. Each row shows the events at one walkthrough step. For a companion row, set `data-df-stepper-view` to the list ID and `data-df-key` to the matching step key. The current row follows the controls. With scripts off, the full sequence and table stay visible.

```html
<ol id="delivery" data-df-stepper>
  <li data-df-key="send">
    <strong data-df-step-label>Send</strong>
    The sender starts the timeout when it sends S41.
  </li>
  <li data-df-key="retry">
    <strong data-df-step-label>Retry</strong>
    The timeout expires. The sender retries with the same sale ID, and the retry arrives first.
  </li>
  <li data-df-key="late">
    <strong data-df-step-label>Handle the late arrival</strong>
    The original message arrives. The receiver sees S41 again and skips it.
  </li>
</ol>
<table>
  <caption>Delivery of sale S41</caption>
  <thead>
    <tr><th scope="col">Step</th><th scope="col">Sender (seconds since first send)</th><th scope="col">Receiver (seconds since startup)</th></tr>
  </thead>
  <tbody>
    <tr data-df-stepper-view="delivery" data-df-key="send">
      <th scope="row">Send</th><td>0 s. Send S41.</td><td>No arrival yet.</td>
    </tr>
    <tr data-df-stepper-view="delivery" data-df-key="retry">
      <th scope="row">Retry</th><td>2 s. Resend S41.</td><td>22 s. Receive the retry and count S41.</td>
    </tr>
    <tr data-df-stepper-view="delivery" data-df-key="late">
      <th scope="row">Late arrival</th><td>No new send.</td><td>23 s. Receive the original and skip S41.</td>
    </tr>
  </tbody>
</table>
```

#### Linked trace

Put `data-df-selection-group="delivery"` on the stepper, the chart, and the table rows. Use matching step and row keys, and set the chart point's `key` to the same value. Remove the rows' `data-df-stepper-view` so the full table stays visible and the selected row is outlined. Chart and stepper controls update the group automatically.

The [PCA incident timeline](../examples/pca/pages/telemetry.html#incident-timeline) links acquisition and receipt events to points on the residual trace.

### Scenario comparisons

Enable `scenarios`.

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

Ask for a prediction before revealing the reasoning. Put the worked answer in a `details` element, then give a second case with new inputs and the same rule. Use `data-df-no-bubble` to keep each answer expandable in place on pages with `peek-bubbles` enabled. Native `details` works without scripts.

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
