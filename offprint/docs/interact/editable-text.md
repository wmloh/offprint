# Editable text

Enable `editable-text`. Use a labelled `input[type=text]` for a single line or `textarea` for a block. Add `data-op-editable` to either. Enable `code` and set `data-op-lang` for live [syntax colours](../reading/code.md).

```html
<label>Title <input data-op-editable value="Reading guide"></label>
<label for="config">Configuration</label>
<textarea id="config" data-op-editable data-op-lang="yaml" rows="4" spellcheck="false">title: Reading guide
sections: 3</textarea>
```

- The native field retains its value, form attributes, editing behavior, and `input` and `change` events. Save through the page if edits should survive reload.
- Native form reset updates the colours automatically.
- Missing or unsupported highlighters leave the field editable with plain text. The authored controls work with scripts off.

[Editable text source](../../js/editable-text.js)
