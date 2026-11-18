# Inline tags

Enable `tags` or link `docform.css` for static styling. Put `.df-tag` on an inline element with a short, explicit label. No script is required.

```html
<span class="df-tag" data-df-color="orange">Draft</span>
<h2>Projection <span class="df-tag" data-df-role="definition">Definition</span></h2>
```

Tags use the accent tint and foreground, with a gray background and normal text as fallback. They are smaller inside headings. Tags stay on one line by default and can wrap in concept tables.

[Colour roles](../layout/roles.md) · [Block styles](../../css/blocks.css)
