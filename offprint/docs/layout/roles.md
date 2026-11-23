# Colour roles

Enable `roles` and define reusable colour meanings in the site or page `options.roles.colors` map, and their hover text in `options.roles.tips` (`{name: text}`; required in practice, since every tag and legend entry needs a tooltip).

```html
<span data-op-role="definition">Projection</span>
<div data-op-legend></div>
```

- Use the same role on prose, tags, callouts, math, or SVG when their styles consume the inherited accent. Use `data-op-color` for a direct palette lookup. Set one accent attribute per element for predictable selector precedence.
- `roles` injects `#op-roles` with `--op-role-<name>` and `--op-role-<name>-bg`, and case-insensitive attribute rules mapping them to `--op-accent` and `--op-accent-bg`. Markup values should use the normalized role name with no surrounding whitespace.
- Each `[data-op-legend]` receives a swatch list in role order. Labels turn runs of hyphens and underscores into spaces. With `tooltips` loaded, each `.op-legend-item` gets `data-op-tip` from its role tip (none → tooltips' warned fallback, see [tags](../reading/tags.md)); without `tooltips`, a native `title` of the tip or label. A legend with no roles warns and keeps its authored content. Unknown markup colours and roles warn during setup.

[Tokens](tokens.md) · [Role source](../../js/roles.js)
