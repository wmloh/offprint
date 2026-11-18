# Design tokens

Tokens load with `base` and are included in `docform.css`. Override custom properties in a later stylesheet or on a wrapper for local styling.

| Group | Tokens |
| --- | --- |
| Named palette | `--df-<name>` and `--df-<name>-bg` for gray, brown, orange, yellow, green, blue, purple, pink, red. Each pair uses `light-dark()`. |
| Accents | `--df-accent` and `--df-accent-bg` are inherited foreground and tint variables set by `data-df-color` or `data-df-role`. Use `var(--df-accent, var(--df-text))` where no accent may be set. |
| Surfaces and borders | `--df-bg`, `--df-bg-sidebar`, `--df-bg-hover`, `--df-bg-subtle`, `--df-border`, `--df-border-strong`. |
| Text and interaction | `--df-text`, `--df-text-muted`, `--df-text-faint`, `--df-link`, `--df-xref`, `--df-selection`, `--df-focus`, `--df-table-hover`, `--df-code-bg`, `--df-code-text`. |
| Heading and emphasis colours | `--df-h1` through `--df-h4` (last covers h4–h6), `--df-strong`, `--df-em`. Set their `-light` and `-dark` inputs. Bold and italic default to `currentColor`. Directly accented headings and emphasis use their accent. |
| Chart palette | `--df-chart-1` through `--df-chart-6`. |
| Fonts | `--df-font`, `--df-font-serif`, `--df-font-mono`, `--df-font-size`, `--df-line-height`. |
| Spacing | `--df-space-1` through `--df-space-8` (4, 8, 12, 16, 24, 32, 48, 64 px). |
| Radii | `--df-radius-sm`, `--df-radius`, `--df-radius-lg` (3, 4, 8 px). |
| Layout | `--df-content-width` (1120 px), `--df-wide-width` (1240 px), `--df-page-gutter` (24 px), `--df-sidebar-width` (260 px). |

`data-df-color="blue"` works with base CSS alone. `color-scheme: light dark` follows the browser preference until the root has an explicit `data-df-theme="light"` or `"dark"`.

[Token source](../../css/tokens.css) · [Roles](roles.md) · [Theme](theme.md)
