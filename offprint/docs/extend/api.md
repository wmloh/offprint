# Extension API

Load an ordered classic author script after [the offline entry](../setup/setup.md). Use the public names below. Underscore-prefixed names are internal.

| API | Use |
| --- | --- |
| `OffPrint.setup(fn)` | Register a synchronous callback. Runs with `OffPrint` after the selected feature scripts and configured data wrappers load, before automatic enhancement. Returns `false` if registration fails or setup has closed. |
| `OffPrint.register(id, init)` | Register one initializer under a unique author-chosen ID during setup. It runs once during enhancement. Manifest `features` controls the bundled features. |
| `OffPrint.ready(fn)` | Run with `OffPrint` after startup or after a recoverable failure. Late registrations run in a microtask. Setup and ready callbacks run in registration order. |
| `OffPrint.util` | `slug(text)` makes a heading-style ID. `uniqueSlug(base, usedSet)` reserves a unique ID in the set. `copyText(text)` returns a promise. `hint(el, text)` sets a hover/focus hint in the shared tooltip card (empty clears); use it instead of `title`. [Tooltips](../reading/tooltips.md) |
| `OffPrint.diagnostics.list()` | Read accumulated `{code, feature, target, message, correction}` entries. Startup callback failures are reported here and via `op:diagnostic`. |
| `OffPrint.sequence.get(idOrElement)` | Control an existing sequence by key or read its committed state. [Step contract](../interact/step-contract.md) |
| `OffPrint.shortcuts.register(spec)`, `keys(id)` | Register a scoped, remappable binding and read its effective keys. Registration returns an unregister function. [Shortcuts](../interact/shortcuts.md) |
| `OffPrint.selection.group(name)`, `define(name, options?)`, `seed(name, key)` | Define or seed linked selections during setup. Read, select, clear, or subscribe through the group controller. Enable `selection`. [Linked selection](../interact/linked-highlighting.md) |
| `OffPrint.data.define(name, input)`, `source(name)`, `defineTransform(name, fn)`, `names()` | Register data and synchronous transforms in setup. Read or replace a named source through its controller. The registry also exposes `parse`, `table`, and `valueOf`. Enable `data`. [Named sources](../data/data-blocks.md) |
| `OffPrint.quiz.defineType(name, def)`, `mount(target, input, options?)`, `get(target)`, `types()` | Register custom question types in setup, mount a quiz from data, or read a quiz controller in `ready`. Enable `quiz`. [Quizzes](../interact/quiz.md) |
| `OffPrint.chart.addon(id, parts)` | Register chart types, scales, and legends before charts mount. Enable `chart`. [Chart add-ons](chart-addons.md) |

Given `<span data-page-title>Field notes</span>`, this author script fills the span during enhancement.

```js
OffPrint.setup((op) => {
  op.register('field-notes-title', () => {
    const title = document.querySelector('[data-page-title]');
    if (title) title.textContent = document.title;
  });
});
```

Keep readable HTML fallbacks. Use authored IDs and keys for integrations. Read mounted controllers in `ready`.

## Events

Use `addEventListener` and read `event.detail`. Listen during setup to observe initial state where the feature emits it. Host events bubble. Page-wide events are dispatched on `document`.

| Event | Target and detail |
| --- | --- |
| `op:diagnostic` | Document. One diagnostics entry. |
| `op:step` | Sequence host. `{key, index, origin}`. |
| `op:selection:change` | Document. `{group, current, previous, origin}`. |
| `op:data:change` | Document. `{source, current, previous, origin}` with `{revision, type}` states. |

See the feature references for additional events, including [quizzes](../interact/quiz.md#api-and-events) (`op:quiz:answer`, `op:quiz:finish`), [charts](../data/charts.md), [parameters](../interact/parameters.md#events), and [figure zoom](../interact/figure-zoom.md).
