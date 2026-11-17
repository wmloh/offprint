# Manifest reference

A manifest describes a site: its pages, colour roles, glossary, and math macros. It is an ordinary script that sets `window.DocFormSite`. Start from `docform/site.template.js`, save it beside your pages as `site.js`, and load it before `core.js`:

```html
<script src="site.js" data-df-site></script>
<script src="docform/js/core.js"></script>
```

Every field is optional. A page without a manifest still gets everything except the page list, roles, and glossary.

```js
window.DocFormSite = {
  title: 'Linear Algebra Notes',
  pages: [ /* ... */ ],
  roles: { /* ... */ },
  glossary: { /* ... */ },
  macros: { /* ... */ }
};
```

## title

Shown at the top of the sidebar.

## pages

The sidebar tree, in reading order. The previous and next links at the bottom of each page follow the same order.

```js
pages: [
  { title: 'Introduction', path: 'index.html' },
  {
    title: 'Basics',
    collapsed: true,
    pages: [
      { title: 'Vectors', path: 'basics/vectors.html' },
      { title: 'Matrices', path: 'basics/matrices.html' }
    ]
  }
]
```

- `title`: the label in the sidebar.
- `path`: the page file, **relative to the manifest file**, so pages in different folders can share one manifest.
- `pages`: makes the entry a group. A group may also have its own `path`.
- `collapsed: true`: starts the group closed. The group holding the current page always opens.

## roles

Maps a role name to one of the nine colours: `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`.

```js
roles: {
  definition: 'blue',
  theorem: 'purple',
  example: 'green',
  warning: 'red'
}
```

Use a role anywhere with `data-df-role="theorem"`: on tags, callouts, math, text, and SVG shapes. Place `<div data-df-legend></div>` on a page to list the roles with their colours. Changing a colour here recolours the whole site. See [style-guide.md](style-guide.md) for choosing roles.

## glossary

Terms shown as tooltips wherever `data-df-term` is used. A definition is a string, or an object with a `title` and `text`. Definitions may contain `$…$` math.

```js
glossary: {
  vector: 'A quantity with magnitude and direction, such as $(3, 4)$.',
  'dot product': {
    title: 'Dot product',
    text: 'The number $u_1 v_1 + u_2 v_2$.'
  }
}
```

Keys ignore case, and spaces, hyphens, and underscores count as the same, so `Dot-Product` finds `dot product`. A missing term is marked on the page and reported in the console.

## macros

TeX shortcuts available in every formula on every page.

```js
macros: {
  '\\R': '\\mathbb{R}',
  '\\norm': '\\left\\lVert #1 \\right\\rVert'
}
```

Backslashes are doubled inside JavaScript strings. `#1`, `#2`, … are macro arguments.
