// Starter manifest. Copy it beside your pages as site.js, edit it, and load it
// before core.js with: <script src="site.js" data-df-site></script>
// Page paths are relative to this file.
window.DocFormSite = {
  title: 'My Notes',

  // A page is { title, path }; a group adds `pages` and may also have a path.
  // Set `collapsed: true` to start a group closed.
  pages: [
    { title: 'Introduction', path: 'index.html' },
    {
      title: 'Basics',
      pages: [
        { title: 'Vectors', path: 'basics/vectors.html' },
        { title: 'Matrices', path: 'basics/matrices.html' }
      ]
    }
  ],

  // Role name -> colour: gray, brown, orange, yellow, green, blue, purple, pink, red.
  roles: {
    definition: 'blue',
    theorem: 'purple',
    example: 'green',
    warning: 'red'
  },

  // Term key -> definition shown in tooltips. Definitions may contain TeX.
  // Use { title, text, more } to add a longer HTML card that opens when the reader holds the term.
  glossary: {
    vector: 'A quantity with magnitude and direction.'
  },

  // Set autoLink to underline every glossary term in paragraphs and lists; hold is the press time in ms.
  terms: {
    autoLink: false,
    hold: 600
  },

  // Sources for <cite data-df-cite="key"></cite>: { author, title, venue, year, url } or a plain string.
  bibliography: {
    strang2016: {
      author: 'Gilbert Strang',
      title: 'Introduction to Linear Algebra',
      publisher: 'Wellesley-Cambridge Press',
      year: 2016
    }
  },

  // Set equations to 'all' to number every display equation, not only those with an id.
  refs: {
    equations: 'labeled'
  },

  // Search index made with docform/tools/search-index.html, relative to this file.
  // search: 'search-index.js',

  // Optional TeX macros shared by every page.
  macros: {
    '\\R': '\\mathbb{R}'
  }
};
