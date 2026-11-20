# Inline tags

Enable `tags` or link `docform.css` for static styling. Put `.df-tag` on an inline element with a short, explicit label, a tooltip, and a tag class. No script is required for styling; shapes need `tooltips`.

```html
<span class="df-tag" data-df-role="default">On by default</span>  <!-- class from a listed label; tip from options.roles.tips -->
<span class="df-tag" data-df-tag-class="colour-sample" data-df-color="blue" data-df-tip="Blue.">Blue</span>
```

```js
options: { tags: {
  glossary: { Design: 'Words for how a page looks.', Data: { tip: 'Data words.', color: 'blue' } },  // circle
  classes: { availability: { shape: 'triangle', label: 'Availability', tags: ['On by default', 'On request'] },
             'colour-sample': { shape: 'square' } }
} }
```

Tags use the accent tint and foreground, with a gray background and normal text as fallback. They are smaller inside headings. Tags stay on one line by default and can wrap in concept tables.

- Shapes: `DocForm.tagShapes` = `circle, triangle, star, square, heart, spades, diamond, clubs`. Circle is reserved for glossary tags (term types); each class in `options.tags.classes` owns exactly one other shape. Shape names the class; colour (role or `data-df-color`) still distinguishes values within it. Drawn as a `::before` CSS mask in `currentColor` from `data-df-shape`, sized by `--df-tag-shape-size` (0.72em) and centred on the label's cap height (`1cap`, with a fixed fallback); triangle and star paths are optically centred.
- Normalization (`core.js`, `site.tags`) warns and ignores: glossary tags without a tip or with an unknown role/colour; classes named `glossary`, with invalid names, `circle`, unknown, or already-used shapes; non-array `tags`; a label listed twice across glossary tags and classes (first kept). Labels match by term key.
- Required class: `DocForm.tooltips.classifyTags(scope, site)` (runs before tip filling) sets `data-df-shape` from `data-df-tag-class` (a class name; `glossary` is rejected because glossary tags match by label) or the label's class. Otherwise `warnOnce` (`Tag "<label>" has no tag class…`), `.df-tag-unclassified` (dashed red outline), and shape `none` (dashed square). Returns those tags. Skips tags inside `.df-tooltip` and library chips (`.df-tag-glossary`). Legend items are not tags.
- Required tooltip: every `.df-tag` and `.df-legend-item` must have one. `DocForm.tooltips.tipTags(scope, site)` runs after glossary tag linking, in this order: own `data-df-tip`/`data-df-term` (or a descendant with one) → glossary term label match → glossary tag label's registry tip → `options.roles.tips[role]` for `data-df-role` → otherwise `warnOnce` (`Tag "<label>" has no tooltip…`), `.df-tag-untipped`, and a fallback `data-df-tip` of `Colour role: <role>` or the label text. Returns the fallback elements. `data-df-color` tags never inherit a role tip.
- Glossary terms as tags: a tag whose whole label is a glossary term (term-key match) gets `data-df-term` and that term's tooltip, outside paragraphs too; no `autoLink` needed. Tips on tags are not glossary entries and need no glossary tag. Auto-link never wraps text inside a tag. Tags with tips or terms keep the help cursor but never show the dotted underline. Opt out with `data-df-autolink="false"` on an ancestor.
- `tagChip(key | null, registry, tagName?)` builds a circle glossary chip (`.df-tag.df-tag-glossary`), or the dashed `Untagged` chip for `null`; used in tooltips and the glossary page.

[Colour roles](../layout/roles.md) · [Tooltips](tooltips.md) · [Block styles](../../css/blocks.css)
