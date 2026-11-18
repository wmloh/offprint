# Tabs

Load `css/tabs.css` and `js/tabs.js` after core. Use `.df-tabs` or `[data-df-tabs]` and put each labelled panel directly inside it.

```html
<div class="df-tabs" data-df-tab-group="language">
  <div data-df-tab="Python" data-df-selected><p>Python example.</p></div>
  <div data-df-tab="JavaScript"><p>JavaScript example.</p></div>
</div>
```

- Startup selects the first `data-df-selected` panel or the first panel. A saved matching group label takes precedence. Empty labels become `Tab 1`, `Tab 2`, etc.
- Grouped sets synchronize by trimmed, case-insensitive label, regardless of panel order. Sets missing the label keep their selection. Storage key `docform-tab:<group>` carries the choice to other pages where browser storage is shared. Blocked or isolated storage still allows same-page sync.
- Click or use Left, Right, Home, and End to select. The module generates a tablist, linked tab and tabpanel IDs, and a roving tab stop. Inactive panels are hidden. Without JS, all authored panels are visible.
- `DocForm.tabs.select(group, label)` selects matching panels and saves the label without moving focus.

[Card panels](card-panels.md) · [Code panels](../reading/code.md) · [Source](../../js/tabs.js)
