# Keyboard shortcuts

Set `options.shortcuts` in the site manifest or page JSON. Each entry replaces all defaults for that ID. Use a key string to rebind or `null` to disable. Page entries override site entries by ID. Invalid values generate a diagnostic and use the default.

```json
{"options":{"shortcuts":{"search.open":"Ctrl+K","controls.focus":null}}}
```

Bindings use `KeyboardEvent.key`, such as `K`, `Escape`, `ArrowRight`, or `Space`. Chords join the key and modifiers with `+`. Use `Control` (`Ctrl`), `Meta` (`Cmd`), `Alt`, or `Shift`. Key names are case-insensitive. Unmodified characters can match when Shift is held. An explicit Shift binding wins in the same scope. Zoom tools require an explicit Shift binding.

| ID | Default | Scope and action |
| --- | --- | --- |
| `controls.theme` | T | Page, switch theme |
| `controls.focus` | F | Page, toggle focus mode |
| `controls.nav` | N | Page, change sidebar mode or toggle drawer |
| `controls.next`, `controls.prev` | J, K | Page, next or previous heading |
| `search.open` | S | Page, open search |
| `search.close` | Escape | Open search palette, close |
| `navigation.close-drawer` | Escape | Open navigation drawer, close |
| `controls.close-peek` | Escape | Visible auto-hide sidebar, close |
| `tooltips.dismiss` | Escape | Active tooltip or extended card, dismiss |
| `selection.activate` | Enter or Space | Focused custom linked-selection button, toggle |
| `zoom.open` | Enter or Space | Focused zoom trigger, enlarge |
| `zoom.close` | Escape | Open zoom view, close |
| `zoom-tools.cursor`, `zoom-tools.magnifier`, `zoom-tools.laser` | V, M, L | Open zoom view, choose a tool |
| `zoom-tools.pen`, `zoom-tools.highlighter`, `zoom-tools.measure` | P, H, C | Open zoom view, choose a tool |
| `zoom-tools.zoom-out`, `zoom-tools.zoom-in` | `[`, `]` | Active magnifier, decrease or increase magnification |
| `zoom-tools.undo` | Control+Z or Meta+Z | Zoom view with ink, undo a stroke |

## Registration and routing

- `DocForm.shortcuts.register({id, key, scope?, label, run})` in `DocForm.setup` or after startup. Use a unique ID and a key string or array of alternative defaults. Returns an unregister function. `DocForm.shortcuts.keys(id)` returns a copy of the effective bindings.
- Omit `scope` or use `'global'` for page-wide shortcuts. An element scope is active when focus is inside it or when its optional `active()` callback returns true. A scope resolver `(event, target) => element | null` activates the returned scope. Use the same scope element or resolver for actions that share a scope.
- One capture listener routes matching keys to the innermost active scope. With unrelated scopes, a focused scope takes precedence over one active elsewhere. `run(event, target)` receives the event and its target. A handled shortcut consumes the key.
- Same-key bindings in the same scope keep the first registration and report `shortcut-conflict` via `DocForm.diagnostics.list()` and `df:diagnostic`. Resolved scopes that coincide are checked when both bindings match. Separate scopes can reuse the same key.
- Editable targets, composition, AltGraph, and already handled events are guarded. Search and zoom dismissal accept Escape and explicit Control, Meta, or Alt chords from fields in their open views. Native buttons, tabbing, and widget-specific navigation keep their own keyboard behavior.

[Site manifest](../setup/manifest.md) · [Core source](../../js/core.js)
