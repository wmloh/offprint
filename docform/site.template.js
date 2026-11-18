window.DocFormSite = {
  "title": "My Notes",
  "profile": "reading",
  "features": {
    "math": true
  },
  "pages": [
    { "title": "Introduction", "path": "index.html" },
    {
      "title": "Basics",
      "pages": [
        { "title": "Vectors", "path": "basics/vectors.html" },
        { "title": "Matrices", "path": "basics/matrices.html" }
      ]
    }
  ],
  "options": {
    "roles": {
      "colors": { "definition": "blue", "theorem": "purple", "example": "green", "warning": "red" }
    },
    "tooltips": {
      "terms": { "vector": "A quantity with magnitude and direction." },
      "autoLink": false,
      "hold": 600
    },
    "citations": {
      "entries": {
        "strang2016": {
          "author": "Gilbert Strang",
          "title": "Introduction to Linear Algebra",
          "publisher": "Wellesley-Cambridge Press",
          "year": 2016
        }
      }
    },
    "references": { "equations": "labeled" },
    "math": { "macros": { "\\R": "\\mathbb{R}" } }
  }
};
