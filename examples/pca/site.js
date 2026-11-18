window.DocFormSite = {
  title: 'Pump Monitoring with PCA',
  pages: [
    { title: 'Set up the monitoring study', path: 'index.html' },
    {
      title: 'Analysis',
      collapsed: true,
      pages: [
        { title: 'Fit and interpret PCA', path: 'fit.html' },
        { title: 'Choose a component count', path: 'monitor.html' }
      ]
    }
  ],

  roles: {
    baseline: 'blue',
    projection: 'purple',
    decision: 'green',
    alert: 'orange'
  },

  glossary: {
    'baseline': 'Known-good operating windows used to fit the scaler and the PCA basis.',
    'component score': 'The coordinate of a standardized sensor window along a principal direction.',
    'explained variance': {
      text: 'The share of baseline variance along a component, $\\lambda_j / \\sum_i \\lambda_i$.',
      more: '<p>With sample-standardized features, the sum of the eigenvalues equals the feature count. ' +
        'Here it is 4, so the first component explains $2.48 / 4 = 62\\%$ of baseline variance.</p>'
    },
    'residual': 'The part of a standardized sensor window left after reconstruction from the retained components.',
    'common-mode shift': 'A change that moves several sensors in the same direction.'
  },

  terms: { autoLink: true },
  macros: {
    '\\norm': '\\left\\lVert #1 \\right\\rVert'
  },
  bibliography: {
    jolliffe: {
      author: 'Ian T. Jolliffe',
      title: 'Principal Component Analysis',
      publisher: 'Springer',
      year: 2002
    },
    jackson: {
      author: 'J. Edward Jackson and Govind S. Mudholkar',
      title: 'Control Procedures for Residuals Associated With Principal Component Analysis',
      journal: 'Technometrics',
      year: 1979
    }
  },
  refs: { equations: 'labeled' },
  search: 'search-index.js'
};
