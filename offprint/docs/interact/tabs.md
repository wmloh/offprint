# Tabs

Enable `tabs`. Use `.op-tabs` or `[data-op-tabs]` and put each labelled panel directly inside it.

```html
<div class="op-tabs" data-op-selection-group="language">
  <div data-op-tab="Python" data-op-key="python" data-op-initial><p>Python example.</p></div>
  <div data-op-tab="JavaScript" data-op-key="js"><p>JavaScript example.</p></div>
</div>
```

- `data-op-tab` is the visible label. Empty labels become `Tab 1`, `Tab 2`, etc. Use a unique `data-op-key` per panel. The first `data-op-initial` panel or first panel supplies the local start.
- Grouped sets share [selection](linked-highlighting.md) by key across labels and panel orders. Set `persist: true` in the group definition for pages that share storage. Standalone sets keep independent state.
- Click or use Left, Right, Home, and End to select. Generated tab and tabpanel IDs link the controls and panels. The active tab is the roving tab stop. Without JS, all panels are visible.
- `op:tabs:change` bubbles from the host with `{current, previous, origin}` and `{key, index}` states. The index is zero-based.

[Card panels](card-panels.md) · [Source](../../js/tabs.js)
