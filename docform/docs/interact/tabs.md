# Tabs

Enable `tabs` or load `css/tabs.css` and `js/tabs.js` with core. Use `.df-tabs` or `[data-df-tabs]` and put each labelled panel directly inside it.

```html
<div class="df-tabs" data-df-selection-group="language">
  <div data-df-tab="Python" data-df-key="python" data-df-initial><p>Python example.</p></div>
  <div data-df-tab="JavaScript" data-df-key="js"><p>JavaScript example.</p></div>
</div>
```

- `data-df-tab` is the visible label. Empty labels become `Tab 1`, `Tab 2`, etc. Use a unique `data-df-key` per panel. The first `data-df-initial` panel or first panel supplies the local start.
- Grouped sets share [selection](linked-highlighting.md) by key across labels and panel orders. Set `persist: true` in the group definition for pages that share storage. Standalone sets keep independent state.
- Click or use Left, Right, Home, and End to select. Generated tab and tabpanel IDs link the controls and panels. The active tab is the roving tab stop. Without JS, all panels are visible.
- `DocForm.tabs.get(idOrHost)` returns the [item controller](linked-highlighting.md) or `null`. Snapshot `{key, index}` uses a zero-based index. `df:tabs:change` bubbles from the host with `{current, previous, origin}`.

[Card panels](card-panels.md) · [Source](../../js/tabs.js)
