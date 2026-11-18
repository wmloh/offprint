# Manifest reference

A site manifest shares navigation and feature choices across pages. Copy `docform/site.template.js` to `site.js` and include it before the entry script.

```html
<script src="site.js" data-df-site></script>
<script src="docform/docform.js"></script>
```

The script assigns a JSON object to `window.DocFormSite`. Every field is optional. The following example enables math throughout the site and sets a default theme.

```js
window.DocFormSite = {
  "title": "Linear Algebra Notes",
  "pages": [{ "title": "Introduction", "path": "index.html" }],
  "features": { "math": true },
  "options": { "theme": { "mode": "light" } }
};
```

| Setting | Purpose |
| --- | --- |
| `profile` | Start with the standard `"reading"` profile or opt in feature by feature with `"none"`. |
| `features` | Enable or disable named features with booleans. A page can override these choices in its `data-df-page` JSON block. |
| `options` | Configure features by name, for example `options.tooltips.terms` for glossary entries or `options.citations.entries` for bibliography entries. |
| `selectionGroups` | Named starting keys and optional persistence for [linked controls](components.md#linked-selection). A page can override each group’s settings. |
| `parameterScopes` | Named sets of [parameter definitions](components.md#parameters-and-presets) shared by sliders, dropdowns, switches, and presets. |
| `assets.search.output` | Location of the generated search index, relative to the manifest. |
| `assets.data` | Map of names to wrapped data descriptors, each with a relative `output` path and optional `source` and `type`. |

Use a single assignment with strict JSON. Quote keys and strings and omit comments, trailing commas, and expressions.

## title

Shown at the top of the sidebar.

## pages

The sidebar tree, in reading order. The previous and next links at the bottom of each page follow the same order.

```json
{
  "pages": [
    {
      "title": "Introduction",
      "path": "index.html"
    },
    {
      "title": "Basics",
      "collapsed": true,
      "pages": [
        {
          "title": "Vectors",
          "path": "basics/vectors.html"
        },
        {
          "title": "Matrices",
          "path": "basics/matrices.html"
        }
      ]
    }
  ]
}
```

- `title`: the label in the sidebar.
- `path`: the page file, **relative to the manifest file**, so pages in different folders can share one manifest.
- `pages`: makes the entry a group. A group may also have its own `path`.
- `collapsed: true`: starts the group closed. The group holding the current page always opens.

## options.roles.colors

Maps a role name to one of the nine colours: `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`.

```json
{
  "options": {
    "roles": {
      "colors": {
        "definition": "blue",
        "theorem": "purple",
        "example": "green",
        "warning": "red"
      }
    }
  }
}
```

Use a role anywhere with `data-df-role="theorem"`: on tags, callouts, math, text, and SVG shapes. Place `<div data-df-legend></div>` on a page to list the roles with their colours. Changing a colour here recolours the whole site. See [style-guide.md](style-guide.md) for choosing roles.

## options.tooltips.terms

Terms shown as tooltips wherever `data-df-term` is used. A definition is a string, or an object with a `title`, `text`, and optional `more`. Definitions may contain `$…$` math.

```json
{
  "options": {
    "tooltips": {
      "terms": {
        "vector": "A quantity with magnitude and direction, such as $(3, 4)$.",
        "dot product": {
          "title": "Dot product",
          "text": "The number $u_1 v_1 + u_2 v_2$.",
          "more": "<p>It is zero exactly when $u$ and $v$ are perpendicular.</p>"
        }
      }
    }
  }
}
```

`more` is a longer explanation written as HTML, with `$…$` math allowed. Terms that have it show a small ring in their tooltip; pressing and holding the term fills the ring and grows the tooltip into a larger card.

Keys ignore case, and spaces, hyphens, and underscores count as the same, so `Dot-Product` finds `dot product`. A missing term is marked on the page and reported in the console.

## glossaryPage

The page holding the site glossary (`<div data-df-glossary></div>`, see the Glossary page section of [components.md](components.md)), relative to the manifest. It is added as the last entry of the sidebar, titled "Glossary", unless `pages` already lists it. Give it another title with an object:

```json
{
  "glossaryPage": {
    "path": "glossary.html",
    "title": "Terms"
  }
}
```

## options.tooltips

Options for glossary terms.

```json
{
  "options": {
    "tooltips": {
      "autoLink": true,
      "hold": 600
    }
  }
}
```

- `autoLink: true`: turns every glossary term in paragraphs and list items into a tooltip term, without writing `data-df-term` by hand. Matching ignores case and only takes whole words, so `vector` does not match `vectors` or `eigenvector`. Where two terms overlap, the one starting first wins, and the longer one wins when both start at the same word. Headings, code, math, links, and existing terms are left alone. Off by default.
- `hold`: how long, in milliseconds, a reader presses a term before its extended card opens. Defaults to 600.

## options.math.macros

TeX shortcuts available in every formula on every page.

```json
{
  "options": {
    "math": {
      "macros": {
        "\\R": "\\mathbb{R}",
        "\\norm": "\\left\\lVert #1 \\right\\rVert"
      }
    }
  }
}
```

Backslashes are doubled inside JavaScript strings. `#1`, `#2`, … are macro arguments.

## options.citations.entries

Sources for `<cite data-df-cite="key"></cite>`, keyed by the name you cite them with.

```json
{
  "options": {
    "citations": {
      "entries": {
        "vaswani2017": {
          "author": "Ashish Vaswani and Noam Shazeer and Niki Parmar",
          "title": "Attention is all you need",
          "booktitle": "Advances in Neural Information Processing Systems",
          "year": 2017,
          "url": "https://arxiv.org/abs/1706.03762"
        },
        "notes": "J. Doe. Lecture notes, 2024."
      }
    }
  }
}
```

- `author` is a string with names joined by `and`, or `authors` is a list of names.
- `title`, `year`, and one of `venue`, `journal`, `booktitle`, or `publisher` make up the entry; `volume`, `pages`, `note`, `url`, and `doi` are optional.
- A plain string is shown exactly as written.

Entries appear as `Authors. Title. Venue, Year.` with a link when there is a `url` or `doi`.

## options.references

Numbering options for figures, tables, and equations.

```json
{
  "options": {
    "references": {
      "equations": "all"
    }
  }
}
```

- `"equations": "all"` numbers every display equation. By default only equations with an `id` are numbered.

## Asset generation

Open [the asset tool](../docform/tools/assets.html) from disk and choose the site folder. Configure output paths relative to the manifest. The tool uses `pages` and `glossaryPage` for the search index unless you supply `assets.search.include`. Data scripts use the corresponding raw files.

```json
{
  "assets": {
    "search": {"output": "generated/search.js"},
    "data": {
      "runs": {"source": "data/runs.csv", "output": "generated/runs.js"}
    }
  }
}
```
