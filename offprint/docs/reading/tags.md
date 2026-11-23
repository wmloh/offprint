# Inline tags

Enable `tags` or link `offprint.css` for static styling. Put `.op-tag` on an inline element with a short, explicit label, a tooltip, and a tag class. No script is required for styling; shapes need `tooltips`.

```html
<span class="op-tag" data-op-role="default">On by default</span>  <!-- class from a listed label; tip from options.roles.tips -->
<span class="op-tag" data-op-tag-class="colour-sample" data-op-color="blue" data-op-tip="Blue.">Blue</span>
```

```js
options: { tags: {
  glossary: { Design: 'Words for how a page looks.', Data: { tip: 'Data words.', color: 'blue' } },  // circle
  classes: { availability: { shape: 'triangle', label: 'Availability', tags: ['On by default', 'On request'] },
             'colour-sample': { shape: 'square' } }
} }
```

Tags use the accent tint and foreground, with a gray background and normal text as fallback. They are smaller inside headings. Tags stay on one line by default and can wrap in concept tables.

- Shapes: `circle, triangle, star, square, heart, spades, diamond, clubs`. Circle is reserved for glossary tags (term types); each class in `options.tags.classes` owns exactly one other shape. Shape names the class; colour (role or `data-op-color`) still distinguishes values within it. Drawn as a `::before` CSS mask in `currentColor` from `data-op-shape`, sized by `--op-tag-shape-size` (0.72em) and centred on the label's cap height (`1cap`, with a fixed fallback); triangle and star paths are optically centred.
- Invalid and duplicate tag definitions warn. Labels match by term key and the first accepted registration wins.
- Explicit classes come from `data-op-tag-class` or the label registry. Glossary tags match by label. An unclassified tag warns and gets a dashed outline.
- Each `.op-tag` and `.op-legend-item` needs a tooltip. Precedence is an authored tip or term, a matching glossary term, the glossary tag tip, and the configured role tip. Missing tips warn and fall back to the role or label text.
- Glossary terms as tags: a tag whose whole label is a glossary term (term-key match) gets `data-op-term` and that term's tooltip, outside paragraphs too; no `autoLink` needed. Tips on tags are not glossary entries and need no glossary tag. Auto-link never wraps text inside a tag. Tags with tips or terms keep the help cursor but never show the dotted underline. Opt out with `data-op-autolink="false"` on an ancestor.

[Colour roles](../layout/roles.md) · [Tooltips](tooltips.md) · [Block styles](../../css/blocks.css)
