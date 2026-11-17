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
    { title: 'Linear transformations', path: 'transformations.html' }
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
    basis: 'Vectors that span a space and are linearly independent, so each point has one set of coordinates.',
    'dot product': '$\\vec u \\cdot \\vec v = u_1 v_1 + u_2 v_2 = \\norm{\\vec u}\\norm{\\vec v}\\cos\\theta$.',
    matrix: 'A rectangular grid of numbers. An $m \\times n$ matrix maps $\\R^n$ to $\\R^m$.',
    'linear map': 'A function $T$ with $T(\\vec u + \\vec v) = T\\vec u + T\\vec v$ and $T(k\\vec v) = kT\\vec v$.',
    determinant: 'The factor $\\det A$ by which $A$ scales areas; negative when it flips orientation.',
    eigenvector: 'A non-zero $\\vec v$ with $A\\vec v = \\lambda \\vec v$: the map only stretches it.'
  },

  macros: {
    '\\R': '\\mathbb{R}',
    '\\vec': '\\mathbf{#1}',
    '\\norm': '\\left\\lVert #1 \\right\\rVert'
  }
};
