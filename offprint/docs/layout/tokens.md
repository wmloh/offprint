# Design tokens

Tokens load with `base` and are included in `offprint.css`. Override custom properties in a later stylesheet or on a wrapper for local styling.

| Group | Tokens |
| --- | --- |
| Named palette | `--op-<name>` and `--op-<name>-bg` for gray, brown, orange, yellow, green, blue, purple, pink, red. Each pair uses `light-dark()`. |
| Accents | `--op-accent` and `--op-accent-bg` are inherited foreground and tint variables set by `data-op-color` or `data-op-role`. Use `var(--op-accent, var(--op-text))` where no accent may be set. |
| Surfaces and borders | `--op-bg`, `--op-bg-sidebar`, `--op-bg-hover`, `--op-bg-subtle`, `--op-border`, `--op-border-strong`. |
| Text and interaction | `--op-text`, `--op-text-muted`, `--op-text-faint`, `--op-link`, `--op-xref`, `--op-selection`, `--op-focus`, `--op-table-hover`, `--op-code-bg`, `--op-code-text`. |
| Heading and emphasis colours | `--op-h1` through `--op-h4` (last covers h4–h6), `--op-strong`, `--op-em`. Set their `-light` and `-dark` inputs. Bold and italic default to `currentColor`. Directly accented headings and emphasis use their accent. |
| Chart palette | `--op-chart-1` through `--op-chart-6`. |
| Fonts | `--op-font`, `--op-font-serif`, `--op-font-mono`, `--op-font-size`, `--op-line-height`. |
| Spacing | `--op-space-1` through `--op-space-8` (4, 8, 12, 16, 24, 32, 48, 64 px). |
| Sections | `--op-space-h2` (56 px), `--op-space-h3` (32 px), `--op-section-cycle` (`blue green purple orange pink brown`; space- or comma-separated named colours), `--op-section-offset` (14 px, 9 px narrow), `--op-section-line-width` (2 px), `--op-section-line-strength` (45 % line colour mix). See [section lines](sections.md). |
| Text roles | `--op-text-label` (label colour, about 5:1 in light mode), `--op-eyebrow-size`, `--op-eyebrow-weight`, `--op-eyebrow-tracking`, `--op-eyebrow-case` (`uppercase`; `none` turns caps off), `--op-field-label-width` (11em). See [text roles](text-roles.md). |
| Radii | `--op-radius-sm`, `--op-radius`, `--op-radius-lg` (3, 4, 8 px). |
| Layout | `--op-content-width` (1120 px), `--op-figure-max-width` (`100%`; cap for outermost figures, tables, code, charts, and similar blocks, see [base](base.md)), `--op-page-gutter` (24 px), `--op-sidebar-width` (260 px). |

`data-op-color="blue"` works with base CSS alone. `color-scheme: light dark` follows the browser preference until the root has an explicit `data-op-theme="light"` or `"dark"`.

[Token source](../../css/tokens.css) · [Roles](roles.md) · [Theme](theme.md)
