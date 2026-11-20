# Concept tables

Use `table[data-df-concept]` inside `.df-page` for text comparisons. Link `docform.css` for static styling, including labelled [tags](../reading/tags.md).

```html
<table data-df-concept>
  <caption>Signal representations</caption>
  <thead><tr><th scope="col">What to represent</th><th scope="col">Encoding</th></tr></thead>
  <tbody><tr><th scope="row">Sample origin</th><td><span class="df-tag" data-df-color="blue">Timestamp</span></td></tr></tbody>
</table>
```

- Horizontal rules separate rows beneath the top of the header. Subdued headings and a wider first column give row labels room. The first header cell targets 34% width with a minimum of `min(16ch, 28vw)`. Tags can wrap. Base table hover tints rows and columns.
- Use semantic captions and scoped headers. Tables wider than the column scroll sideways inside it. Use [results tables](results-tables.md) for sorting, numeric heat, verdicts, and filters.

[Base tables](../layout/base.md) · [Transformer input example](../../../examples/transformers/index.html#input-representations) · [Styles](../../css/base.css)
