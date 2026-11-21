# Dropdowns

Enable `dropdowns`. Pair a direct `button[popovertarget]` with a direct `.df-dropdown-panel[popover="auto"]` using a unique ID. Each list item can contain a link, a button, or a `details` branch with a `summary` and another list. Repeat that structure at any depth.

```html
<div class="df-dropdown" id="resources-menu">
  <button type="button" class="df-button" popovertarget="resources">Resources</button>
  <div class="df-dropdown-panel" id="resources" popover="auto">
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
- `DocForm.dropdowns.follow(trigger, panel)` places an open popover panel below its trigger (above when there is more room), keeps it there through scrolling and resizing, hides it once the trigger leaves the viewport, and returns a stop function. Parameter comboboxes use it.
- `DocForm.dropdowns.mount(idOrHost)` prepares a dropdown added after startup and returns its popover or `null`. The native Popover API and `details` handle opening and keyboard access with scripts off in supporting browsers.

[Buttons](../layout/buttons.md) · [Dropdowns source](../../js/dropdowns.js)
