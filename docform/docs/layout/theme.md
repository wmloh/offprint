# Theme

Load `css/theme.css` and synchronous `js/theme.js` in `<head>` after the styles. The script is standalone and applies saved `light` or `dark` before paint. With no readable saved value it checks `prefers-color-scheme`. CSS tokens are theme-aware without the script.

```html
<span data-df-theme-toggle></span>
```

- Use an empty host or button. The script creates or enhances a button with the current mode and an accessible label for the action. The [control pill](controls.md) adds its own when present.
- `window.DocFormTheme` provides `get()` / `current()`, `set('light'|'dark')`, `next(mode)`, and `toggle(host)`. `toggle(host)` installs a toggle and returns its button. `DocForm.theme` aliases this object when core is present at theme initialization.
- Sets `data-df-theme` on `html` and persists via `localStorage` under `docform-theme` where storage is available. Storage events refresh existing toggles. Explicit mode changes dispatch `df:themechange` on `document` with `detail: {mode, theme}`. Both keys carry the mode.

[Tokens](tokens.md) · [Theme source](../../js/theme.js)
