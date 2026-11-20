# Colour roles

Enable `roles` and define reusable colour meanings in the site or page `options.roles.colors` map, and their hover text in `options.roles.tips` (`{name: text}`; required in practice, since every tag and legend entry needs a tooltip).

```html
<span data-df-role="definition">Projection</span>
<div data-df-legend></div>
```

- Use the same role on prose, tags, callouts, math, or SVG when their styles consume the inherited accent. Use `data-df-color` for a direct palette lookup. Set one accent attribute per element for predictable selector precedence.
- `roles` injects `#df-roles` with `--df-role-<name>` and `--df-role-<name>-bg`, and case-insensitive attribute rules mapping them to `--df-accent` and `--df-accent-bg`. Markup values should use the normalized role name with no surrounding whitespace.
- Each `[data-df-legend]` receives a swatch list in role order. Labels turn runs of hyphens and underscores into spaces. With `tooltips` loaded, each `.df-legend-item` gets `data-df-tip` from its role tip (none → tooltips' warned fallback, see [tags](../reading/tags.md)); without `tooltips`, a native `title` of the tip or label. A legend with no roles warns and keeps its authored content. Unknown markup colours and roles warn during setup.
- `site.roleTips` holds normalized tips. `DocForm.roles.tip(name, site?)` → tip text or `null`; `DocForm.roles.label(name)` → display label.
- `DocForm.roles.color(name, colors?)` resolves a palette name from the configured roles or an explicit map and returns `null` for unknown roles. `DocForm.roles.css(colors)` returns stylesheet text for a role map.

[Tokens](tokens.md) · [Role source](../../js/roles.js)
