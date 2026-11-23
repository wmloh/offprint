# Theme

The offline entry applies the `theme` feature before paint. Saved mode takes precedence over `options.theme.mode` in the site or head page configuration. Use `light`, `dark`, or `null` for the system preference. CSS tokens are theme-aware without the script.

```html
<span data-op-theme-toggle></span>
```

- Use an empty host or button. The script creates or enhances a button with the current mode and an accessible label for the action. The [control pill](controls.md) adds its own when present.
- The root `data-op-theme` reflects the mode. On `document`, `op:theme:change` reports `{current, previous, origin}` with `{mode}` states.

[Tokens](tokens.md) · [Theme source](../../js/theme.js)
