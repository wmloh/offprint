# Concept tables

Use `table[data-op-concept]` inside `.op-page` for text comparisons. Link `offprint.css` for static styling, including labelled [tags](../reading/tags.md).

```html
<table data-op-concept>
  <caption>Signal representations</caption>
  <thead><tr><th scope="col">What to represent</th><th scope="col">Encoding</th></tr></thead>
  <tbody><tr><th scope="row">Sample origin</th><td><span class="op-tag" data-op-color="blue">Timestamp</span></td></tr></tbody>
</table>
```

- Horizontal rules separate rows beneath the top of the header. Subdued headings and a wider first column give row labels room. The first header cell targets 34% width with a minimum of `min(16ch, 28vw)`. Tags can wrap. Base table hover tints rows and columns.
- Use semantic captions and scoped headers. Tables wider than the column scroll sideways inside it. Use [results tables](results-tables.md) for sorting, numeric heat, verdicts, and filters.

[Base tables](../layout/base.md) · [Styles](../../css/base.css)
