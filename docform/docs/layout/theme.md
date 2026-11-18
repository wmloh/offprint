# Theme

The offline entry applies the `theme` feature before paint. Saved mode takes precedence over `options.theme.mode` in the site or head page configuration. Use `light`, `dark`, or `null` for the system preference. CSS tokens are theme-aware without the script.

```html
<span data-df-theme-toggle></span>
```

- Use an empty host or button. The script creates or enhances a button with the current mode and an accessible label for the action. The [control pill](controls.md) adds its own when present.
- `DocForm.theme` provides `get()`, `set(mode)`, `next(mode)`, and `mount(idOrElement)`. Mount returns the same enhanced button on repeat. `set()` returns whether the request was accepted.
- The root `data-df-theme` reflects the mode. `snapshot()` returns `{mode}`. `subscribe(fn, {immediate: true}?)` returns an unsubscribe function. Updates commit before subscribers and `df:theme:change` on `document` with `{current, previous, origin}`. Origins include `user`, `api`, and `storage`.

[Tokens](tokens.md) · [Theme source](../../js/theme.js)
