# Inline tags

Enable `tags` or link `docform.css` for static styling. Put `.df-tag` on an inline element with a short, explicit label. No script is required.

```html
<span class="df-tag" data-df-color="orange">Draft</span>
<h2>Projection <span class="df-tag" data-df-role="definition">Definition</span></h2>
```

Tags use the accent tint and foreground, with a gray background and normal text as fallback. They are smaller inside headings. Tags stay on one line by default and can wrap in concept tables.

- Tooltips: with `tooltips` enabled, a tag whose whole label is a glossary term (term-key match) gets `data-df-term` and that term's tooltip, outside paragraphs too; no `autoLink` needed. Give other tags `data-df-tip` or `data-df-term`. Auto-link never wraps text inside a tag. Tags with tips or terms keep the help cursor but never show the dotted underline. Opt out with `data-df-autolink="false"` on an ancestor.

[Colour roles](../layout/roles.md) · [Block styles](../../css/blocks.css)
