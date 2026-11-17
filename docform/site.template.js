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
  glossary: {
    vector: 'A quantity with magnitude and direction.'
  },

  // Optional TeX macros shared by every page.
  macros: {
    '\\R': '\\mathbb{R}'
  }
};
