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
| Sections | `--df-space-h2` (56 px), `--df-space-h3` (32 px), `--df-section-cycle` (`blue green purple orange pink brown`; space- or comma-separated named colours), `--df-section-offset` (14 px, 9 px narrow), `--df-section-line-width` (2 px), `--df-section-line-strength` (45 % line colour mix). See [section lines](sections.md). |
| Text roles | `--df-text-label` (label colour, about 5:1 in light mode), `--df-eyebrow-size`, `--df-eyebrow-weight`, `--df-eyebrow-tracking`, `--df-eyebrow-case` (`uppercase`; `none` turns caps off), `--df-field-label-width` (11em). See [text roles](../reading/text-roles.md). |
| Radii | `--df-radius-sm`, `--df-radius`, `--df-radius-lg` (3, 4, 8 px). |
| Layout | `--df-content-width` (1120 px), `--df-figure-max-width` (`100%`; cap for outermost figures, tables, code, charts, and similar blocks, see [base](base.md)), `--df-page-gutter` (24 px), `--df-sidebar-width` (260 px). |

`data-df-color="blue"` works with base CSS alone. `color-scheme: light dark` follows the browser preference until the root has an explicit `data-df-theme="light"` or `"dark"`.

[Token source](../../css/tokens.css) · [Roles](roles.md) · [Theme](theme.md)
