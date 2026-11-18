# Code, annotations, and diffs

Load `css/code.css` and `js/code.js`. Write `<pre><code class="language-python">…</code></pre>` or put `data-df-lang` on `pre` or its direct `code`. `lang-*` classes also work. Escape HTML-sensitive code. Add `data-df-no-code` to a `pre` for the base styling only.

- Enhancement covers blocks within `.df-page`, falling back to the body if no page exists. It removes one initial blank line, trailing whitespace, and common indentation. Unsupported languages still get plain code and Copy.
- Built-in lexers accept `js`/`javascript`/`mjs`/`cjs`, `json`, `yaml`/`yml`, `python`/`py`, `html`/`xml`/`svg`, `css`, `shell`/`sh`/`bash`/`zsh`/`console`, `sql`, and `csharp`/`cs`/`c#`. HTML lexes embedded script and style bodies.

```html
<pre data-df-annotate="#notes" data-df-lines="1, 3-4"><code class="language-python">
count = 0  # (1)
count += 1
</code></pre>
<ol id="notes"><li>Start with an empty count.</li></ol>
```

- `data-df-lines` takes one-based line numbers and ranges separated by spaces or commas. `data-df-annotate` extracts trailing marker-only comments such as `# (1)` or `// (2) (3)` from code and copied text. Use the following sibling `ol` or point at one with `data-df-annotate="#id"`. Numbering respects `ol[start]`.
- A marker and its list item highlight together on hover/focus. Clicking a marker scrolls to its note. Load `tooltip.js` and `tooltip.css` for marker previews. List item `data-df-highlight-group` and `data-df-highlight-key` are copied to its markers for linked views.

```html
<div class="df-diff" data-df-lang="python">
  <pre data-df-diff="before">count = count + 1</pre>
  <pre data-df-diff="after">count += 1</pre>
</div>
```

- A paired diff uses a line-based comparison. Alternatively, on a single `pre[data-df-diff]`, prefix rows with `+`, `-`, or space. `@@` marks hunks and leading `---` / `+++` file headers are metadata. Highlights count displayed rows. Copy omits removed and metadata rows. Annotations apply to ordinary code blocks.
- `DocForm.code.enhance(pre)` enhances a newly inserted block once. `tokenize(src, lang)` returns `{type, text}` tokens. `highlight(src, lang)` returns escaped highlighted HTML.

[Tooltip cards](tooltips.md) · [Code source](../../js/code.js)
