# Component reference

Each feature needs its stylesheet in `<head>` and, where listed, its script after `core.js`. Content stays readable if a script is missing.

| Feature | Stylesheet | Script |
| --- | --- | --- |
| Layout and typography | `tokens.css`, `base.css` | `core.js` |
| Sidebar and outline | `nav.css` | `nav.js` |
| Theme toggle | `theme.css` | `theme.js` (in `<head>`) |
| Control pill, focus mode, shortcuts | `controls.css` | `controls.js` |
| Roles legend | `roles.css` | `roles.js` |
| Math | `vendor/katex/katex.min.css`, `math.css` | `vendor/katex/katex.min.js`, `math.js` |
| Tags and callouts | `blocks.css` | none |
| Peek bubbles | `blocks.css`, `bubble.css` | `bubble.js` |
| Tooltips and glossary | `tooltip.css` | `tooltip.js` |
| Code blocks | `code.css` | `code.js` |
| Tabs | `tabs.css` | `tabs.js` |
| Animated figures | `anim.css` | `anim.js` |
| Pinned scrolling figures | `anim.css`, `scrolly.css` | `anim.js`, `scrolly.js` |
| Reveals and split views | `reveal.css` | `reveal.js` |
| Figure zoom | `zoom.css` | `zoom.js` |
| Sliders | `params.css` | `params.js` |

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

## Control pill

Load `controls.css` and `controls.js` and a small frosted pill appears in the top-left corner of the page, beside the sidebar. It needs no markup. It holds:

- a ring that fills as the reader scrolls through the page;
- a sidebar button that slides the navigation away and recentres the page, or opens the drawer on narrow screens;
- a focus-mode button that keeps the section in the middle of the screen, everything in the central part of the screen, and the page title sharp, and blurs the rest; pointing at a blurred block sharpens it;
- the theme toggle, when `theme.js` is loaded.

The page scrollbar stays hidden until the pointer comes near the right edge. The sidebar and focus-mode choices are remembered across pages. Keyboard shortcuts work anywhere except while typing in a form field:

| Key | Action |
| --- | --- |
| `T` | Switch theme |
| `F` | Focus mode |
| `N` | Sidebar |
| `J` / `K` | Next / previous section |

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

## Code blocks

```html
<pre><code class="language-python">print("hello")</code></pre>
```

Adds a language label and a copy button, and highlights JavaScript, JSON, Python, HTML, CSS, and shell. The language can also be given as `data-df-lang="js"`. Add `data-df-no-code` to a `pre` to leave it plain.

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

## Pinned scrolling figures

A figure inside `.df-scrolly` stays pinned near the top of the window while the step cards below it scroll past. The card in view drives the figure's animation, forwards as the reader scrolls down and backwards as they scroll up.

```html
<div class="df-scrolly">
  <figure id="story">
    <svg viewBox="0 0 200 100">…</svg>
  </figure>
  <div class="df-scrolly-steps">
    <div data-df-step><p>First, draw the line.</p></div>
    <div data-df-step><p>Then slide the dot.</p></div>
    <div data-df-step="2"><p>A note that keeps step 2 on screen.</p></div>
  </div>
</div>

<script>
  DocForm.anim('story', [ /* one step per card */ ]);
</script>
```

- Each card shows the animation step with its own number: the first card is step 1, and so on. Give `data-df-step` a number to choose another step.
- The playback bar is hidden because scrolling replaces it.
- Without an animation, the figure still gets `data-df-active-step` and a `df:scrollystep` event (`detail.step`, `detail.index`), so page scripts can update it themselves.

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
