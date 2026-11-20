# Editable text

Enable `editable-text`. Use a labelled `input[type=text]` for a single line or `textarea` for a block. Add `data-df-editable` to either. Enable `code` and set `data-df-lang` for live [syntax colours](../reading/code.md).

```html
<label>Title <input data-df-editable value="Reading guide"></label>
<label for="config">Configuration</label>
<textarea id="config" data-df-editable data-df-lang="yaml" rows="4" spellcheck="false">title: Reading guide
sections: 3</textarea>
```

- The native field retains its value, form attributes, editing behavior, and `input` and `change` events. Save through the page if edits should survive reload.
- `DocForm.editableText.mount(idOrField)` prepares a field added after startup and returns it or `null`. Call `DocForm.editableText.refresh(idOrField)` after assigning `.value` from script. Native form reset updates the colours automatically.
- Missing or unsupported highlighters leave the field editable with plain text. The authored controls work with scripts off.

[Editable text source](../../js/editable-text.js)
