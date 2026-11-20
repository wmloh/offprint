# Inline tags

Enable `tags` or link `docform.css` for static styling. Put `.df-tag` on an inline element with a short, explicit label and a tooltip. No script is required for styling.

```html
<span class="df-tag" data-df-color="orange" data-df-tip="Not yet reviewed.">Draft</span>
<h2>Projection <span class="df-tag" data-df-role="definition">Definition</span></h2> <!-- tip from options.roles.tips -->
```

Tags use the accent tint and foreground, with a gray background and normal text as fallback. They are smaller inside headings. Tags stay on one line by default and can wrap in concept tables.

- Required tooltip: every `.df-tag` and `.df-legend-item` must have one. With `tooltips` enabled, `DocForm.tooltips.tipTags(scope, site)` runs after glossary tag linking, in this order: own `data-df-tip`/`data-df-term` (or a descendant with one) → glossary label match → `options.roles.tips[role]` for `data-df-role` → otherwise `warnOnce` (`Tag "<label>" has no tooltip…`), `.df-tag-untipped`, and a fallback `data-df-tip` of `Colour role: <role>` or the label text. Returns the fallback elements. `data-df-color` tags never inherit a tip; give them `data-df-tip`.
- Glossary tags: with `tooltips` enabled, a tag whose whole label is a glossary term (term-key match) gets `data-df-term` and that term's tooltip, outside paragraphs too; no `autoLink` needed. Give other tags `data-df-tip` or `data-df-term`. Auto-link never wraps text inside a tag. Tags with tips or terms keep the help cursor but never show the dotted underline. Opt out with `data-df-autolink="false"` on an ancestor.

[Colour roles](../layout/roles.md) · [Block styles](../../css/blocks.css)
