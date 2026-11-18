# Style guide

DocForm follows Notion's look: calm pages where the writing comes first and every highlight earns its place.

## Principles

- **Text first.** Most of a page should be plain paragraphs. Reach for callouts, tags, and figures only when they help a reader understand or find something.
- **Quiet by default.** White space, one reading column, system fonts, thin borders, and muted colours. Avoid stacking several callouts or colouring whole paragraphs.
- **Colour means something.** Use colour to say *what kind of thing* this is, never only to decorate. A reader should be able to learn the meaning of each colour from the legend.
- **One idea per block.** A callout makes one point, a figure shows one process, a peek bubble holds one optional detail.
- **Works in both themes.** Every colour has a light and a dark version, so use the named colours and roles instead of your own hex codes.

## The palette

Nine muted colours, each with a text shade and a pale background tint:

| Colour | Typical use |
| --- | --- |
| `gray` | Side notes, metadata, de-emphasized items |
| `brown` | History, background, sources |
| `orange` | Work in progress, attention |
| `yellow` | Tips and insights |
| `green` | Examples, success, results |
| `blue` | Definitions, information |
| `purple` | Theorems, key results |
| `pink` | Special cases, asides |
| `red` | Warnings, errors, pitfalls |

These are suggestions, not rules; what matters is that a site uses each colour consistently.

## Heading and emphasis colours

Headings, bold, and italic text can each take their own colour, set separately for light and dark mode. Override the tokens in a stylesheet loaded after `tokens.css`:

```css
:root {
  --df-h2-light: #2f3f5c;
  --df-h2-dark: #c9d6ee;
  --df-strong-light: #2b2a26;
  --df-strong-dark: #f2f0ea;
}
```

The tokens are `--df-h1` to `--df-h4` (`h4` also covers `h5` and `h6`), `--df-strong` (bold), and `--df-em` (italic), each with `-light` and `-dark` versions. Stay close to the default text colour so emphasis still reads as text, not as a role. Bold and italic text keep the surrounding colour by default, and elements with `data-df-color` or `data-df-role` keep theirs.

## Choosing roles

A role is a named meaning, such as `definition` or `warning`, mapped to a colour in the manifest. Prefer roles over raw colours:

- **Name the meaning, not the look.** `theorem: 'purple'` rather than writing `data-df-color="purple"` on every theorem. If you later change the colour, every page follows.
- **Keep the set small.** Four to six roles are usually enough. If two roles always appear together or are hard to tell apart, merge them.
- **One colour per role.** Two roles may share a colour only if they never appear side by side.
- **Reuse roles in figures.** If vector *u* is blue in the text, give its arrow in the figure the same role, so readers can match formula and picture at a glance.
- **Show a legend** with `<div data-df-legend></div>` on the first page, or wherever colours carry meaning.

Use `data-df-color` directly only for one-off highlights that carry no recurring meaning.

## Small habits

- Keep headings short; they become the sidebar outline.
- Put long proofs and optional detail in peek bubbles (`details`).
- Give tooltips to the words a newcomer might not know, and put shared terms in the glossary so every page explains them the same way.
- Caption every animation step in one short sentence.
- Check each page in light and dark mode and at phone width.
