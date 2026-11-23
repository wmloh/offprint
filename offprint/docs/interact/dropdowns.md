# Dropdowns

Enable `dropdowns`. Pair a direct `button[popovertarget]` with a direct `.op-dropdown-panel[popover="auto"]` using a unique ID. Each list item can contain a link, a button, or a `details` branch with a `summary` and another list. Repeat that structure at any depth.

```html
<div class="op-dropdown" id="resources-menu">
  <button type="button" class="op-button" popovertarget="resources">Resources</button>
  <div class="op-dropdown-panel" id="resources" popover="auto">
    <ul>
      <li><a href="guide.html">Guide</a></li>
      <li><details>
        <summary>More resources</summary>
        <ul>
          <li><a href="examples.html">Examples</a></li>
          <li><button type="button" id="copy-link">Copy link</button></li>
        </ul>
      </details></li>
    </ul>
  </div>
</div>
```

- The inline-sized host can sit within a toolbar.
- Click, tap, or use Enter or Space on a trigger or branch. Tab moves through the visible entries. Escape closes the open branch containing focus, or dismisses the popover. Outside clicks and leaf actions dismiss the popover.
- Links follow their native behavior. Attach a page action to an ordinary button's `click` event. The panel enters the browser's top layer, positions within the viewport, and scrolls when it exceeds the available space.
- The native Popover API and `details` provide opening and keyboard access.

[Buttons](../layout/buttons.md) · [Dropdowns source](../../js/dropdowns.js)
