# Colour roles

Enable `roles` and define reusable colour meanings in the site or page `options.roles.colors` map.

```html
<span data-df-role="definition">Projection</span>
<div data-df-legend></div>
```

- Use the same role on prose, tags, callouts, math, or SVG when their styles consume the inherited accent. Use `data-df-color` for a direct palette lookup. Set one accent attribute per element for predictable selector precedence.
- `roles` injects `#df-roles` with `--df-role-<name>` and `--df-role-<name>-bg`, and case-insensitive attribute rules mapping them to `--df-accent` and `--df-accent-bg`. Markup values should use the normalized role name with no surrounding whitespace.
- Each `[data-df-legend]` receives a swatch list in role order. Labels turn runs of hyphens and underscores into spaces. A legend with no roles warns and keeps its authored content. Unknown markup colours and roles warn during setup.
- `DocForm.roles.color(name, colors?)` resolves a palette name from the configured roles or an explicit map and returns `null` for unknown roles. `DocForm.roles.css(colors)` returns stylesheet text for a role map.

[Tokens](tokens.md) · [Role source](../../js/roles.js)
