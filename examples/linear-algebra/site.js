window.DocFormSite = {
  title: 'Linear Algebra Notes',

  pages: [
    { title: 'Introduction', path: 'index.html' },
    {
      title: 'Foundations',
      pages: [
        { title: 'Vectors', path: 'vectors.html' },
        { title: 'Matrices', path: 'matrices.html' }
      ]
    },
    { title: 'Linear transformations', path: 'transformations.html' },
    { title: 'Computing', path: 'computing.html' }
  ],

  roles: {
    definition: 'blue',
    theorem: 'purple',
    example: 'green',
    warning: 'red',
    u: 'blue',
    v: 'orange',
    result: 'purple'
  },

  glossary: {
    vector: 'An ordered list of numbers, such as $\\vec v = (2, 1)$, drawn as an arrow from the origin.',
    scalar: 'A single real number $k \\in \\R$ used to stretch or shrink vectors.',
    'linear combination': 'A sum of scaled vectors, $c_1 \\vec v_1 + \\dots + c_n \\vec v_n$.',
    span: 'The set of every linear combination of some vectors.',
    basis: {
      title: 'Basis',
      text: 'Vectors that span a space and are linearly independent, so each point has one set of coordinates.',
      more: '<p>The standard basis of $\\R^2$ is $\\vec e_1 = (1, 0)$ and $\\vec e_2 = (0, 1)$, so $(3, 2) = 3\\vec e_1 + 2\\vec e_2$.</p>' +
        '<p>Any two vectors that do not lie on one line also form a basis; the coordinates change, the point does not.</p>'
    },
    'dot product': '$\\vec u \\cdot \\vec v = u_1 v_1 + u_2 v_2 = \\norm{\\vec u}\\norm{\\vec v}\\cos\\theta$.',
    matrix: 'A rectangular grid of numbers. An $m \\times n$ matrix maps $\\R^n$ to $\\R^m$.',
    'linear map': 'A function $T$ with $T(\\vec u + \\vec v) = T\\vec u + T\\vec v$ and $T(k\\vec v) = kT\\vec v$.',
    determinant: {
      title: 'Determinant',
      text: 'The factor $\\det A$ by which $A$ scales areas; negative when it flips orientation.',
      more: '<p>For $A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$, $\\det A = ad - bc$.</p>' +
        '<ul><li>$\\det A = 0$: the plane collapses onto a line or a point.</li>' +
        '<li>$\\det(AB) = \\det A \\det B$: areas scale one map after another.</li></ul>'
    },
    eigenvector: 'A non-zero $\\vec v$ with $A\\vec v = \\lambda \\vec v$: the map only stretches it.'
  },

  // Sources for <cite data-df-cite="key"></cite>, numbered by first citation on each page.
  bibliography: {
    strang: {
      author: 'Gilbert Strang',
      title: 'Introduction to Linear Algebra',
      publisher: 'Wellesley-Cambridge Press',
      year: 2016
    },
    axler: {
      author: 'Sheldon Axler',
      title: 'Linear Algebra Done Right',
      publisher: 'Springer',
      year: 2024
    },
    '3b1b': {
      author: 'Grant Sanderson',
      title: 'Essence of Linear Algebra',
      venue: '3Blue1Brown video series',
      year: 2016,
      url: 'https://www.3blue1brown.com/topics/linear-algebra'
    }
  },

  // Build search-index.js with docform/tools/search-index.html, save it beside this file, then uncomment:
  // search: 'search-index.js',

  // Link every glossary term in paragraphs and list items; press and hold a term with `more` to read further.
  terms: {
    autoLink: true,
    hold: 600
  },

  macros: {
    '\\R': '\\mathbb{R}',
    '\\vec': '\\mathbf{#1}',
    '\\norm': '\\left\\lVert #1 \\right\\rVert'
  }
};
