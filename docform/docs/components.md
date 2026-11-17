# Component reference

Each feature needs its stylesheet in `<head>` and, where listed, its script after `core.js`. Content stays readable if a script is missing.

| Feature | Stylesheet | Script |
| --- | --- | --- |
| Layout and typography | `tokens.css`, `base.css` | `core.js` |
| Sidebar and outline | `nav.css` | `nav.js` |
| Theme toggle | `theme.css` | `theme.js` (in `<head>`) |
| Roles legend | `roles.css` | `roles.js` |
| Math | `vendor/katex/katex.min.css`, `math.css` | `vendor/katex/katex.min.js`, `math.js` |
| Tags, callouts, toggles | `blocks.css` | none |
| Tooltips and glossary | `tooltip.css` | `tooltip.js` |
| Code blocks | `code.css` | `code.js` |
| Tabs | `tabs.css` | `tabs.js` |
| Animated figures | `anim.css` | `anim.js` |
| Sliders | `params.css` | `params.js` |

## Page layout

```html
<body>
  <nav class="df-sidebar">
    <div data-df-nav></div>
    <div data-df-theme-toggle></div>
  </nav>
  <main class="df-page">
    <h1>Title</h1>
    …
  </main>
</body>
```

The sidebar lists the manifest's pages and an outline of the current page's `h2` and `h3` headings, highlighting the one in view. On narrow screens it becomes a drawer. Add `data-df-no-outline` to a heading (or a section around it) to leave it out, and `data-df-no-pager` on `main` to hide the previous and next links.

## Theme toggle

```html
<div data-df-theme-toggle></div>
```

Cycles system, light, and dark. The choice is remembered.

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

## Toggles

```html
<details>
  <summary>Show the proof</summary>
  <p>…</p>
</details>
```

Every `details` inside `.df-page` becomes a toggle.

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

Actions accept `duration`, `delay` (in milliseconds), and `easing` (`ease`, `linear`, `ease-in`, `ease-out`, `ease-in-out`, `back-out`). Options after the steps: `caption` (shown before the first step), `duration`, `easing`, `hold` (pause between steps while playing), and `autoplay` (play when scrolled into view; or put `data-df-autoplay` on the figure). Readers who prefer reduced motion see steps without animation.

SVG shapes take colours with `data-df-color` or `data-df-role` plus a paint class: `df-stroke`, `df-fill`, or `df-fill-bg` (the pale tint). `df-grid`, `df-axis`, and `df-muted` give neutral greys for backgrounds.

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
