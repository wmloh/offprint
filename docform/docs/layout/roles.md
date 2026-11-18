# Colour roles

Define reusable colour meanings with `roles: {definition: 'blue', warning: 'red'}` in the [manifest](../setup/manifest.md). Load `js/roles.js` for generated CSS and `css/roles.css` for the legend.

```html
<span data-df-role="definition">Projection</span>
<div data-df-legend></div>
```

- Use the same role on prose, tags, callouts, math, or SVG when their styles consume the inherited accent. Use `data-df-color` for a direct palette lookup. Set one accent attribute per element for predictable selector precedence.
- `roles.js` injects `#df-roles` with `--df-role-<name>` and `--df-role-<name>-bg`, and case-insensitive attribute rules mapping them to `--df-accent` and `--df-accent-bg`. Markup values should use the normalized role name with no surrounding whitespace.
- Each `[data-df-legend]` receives a swatch list in role order. Labels turn runs of hyphens and underscores into spaces. A legend with no roles warns and stays empty. Unknown markup colours and roles warn during setup.
- `DocForm.roleColor(name, site?)` resolves a role to its palette name or returns `null` and warns. `DocForm.roleCss(roles)` returns the stylesheet text for a normalized role map.

[Tokens](tokens.md) · [Role source](../../js/roles.js)
