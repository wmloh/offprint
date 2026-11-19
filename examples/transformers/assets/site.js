window.DocFormSite = {
  "title": "A Decoder-Only Transformer",
  "features": {
    "math": true,
    "reveals": true
  },
  "selectionGroups": {
    "transformer-language": {
      "persist": true
    }
  },
  "pages": [
    {
      "title": "From text to vectors",
      "path": "../index.html"
    },
    {
      "title": "Inside the decoder",
      "collapsed": true,
      "pages": [
        {
          "title": "Causal self-attention",
          "path": "../pages/attention.html"
        },
        {
          "title": "Next-token prediction",
          "path": "../pages/prediction.html"
        },
        {
          "title": "Inspect training runs",
          "path": "../pages/diagnostics.html"
        }
      ]
    }
  ],
  "options": {
    "roles": {
      "colors": {
        "input": "blue",
        "context": "purple",
        "output": "green",
        "masked": "orange"
      }
    },
    "tooltips": {
      "terms": {
        "token": "A unit from a tokenizer vocabulary, identified by an integer.",
        "embedding": "A learned vector looked up by token ID.",
        "causal mask": {
          "text": "A rule that lets a query read keys only at its own position or earlier.",
          "more": "<p>Write $-\\infty$ at key positions $j > i$ for query $i$ before softmax. Those positions receive probability zero. Each query can at least read itself.</p>"
        },
        "residual connection": "An addition that carries the input of a sublayer around that sublayer.",
        "logit": "An unnormalized score. Softmax converts a vector of logits to a probability distribution.",
        "softmax": "The function $\\operatorname{softmax}(s)_j=e^{s_j}/\\sum_k e^{s_k}$."
      },
      "autoLink": true
    },
    "math": {
      "macros": {
        "\\softmax": "\\operatorname{softmax}"
      }
    },
    "citations": {
      "entries": {
        "vaswani": {
          "authors": [
            "Ashish Vaswani",
            "Noam Shazeer",
            "Niki Parmar",
            "Jakob Uszkoreit",
            "Llion Jones",
            "Aidan N. Gomez",
            "Łukasz Kaiser",
            "Illia Polosukhin"
          ],
          "title": "Attention Is All You Need",
          "booktitle": "Advances in Neural Information Processing Systems",
          "year": 2017,
          "url": "https://arxiv.org/abs/1706.03762"
        },
        "radford": "Alec Radford, Jeffrey Wu, Rewon Child, David Luan, Dario Amodei, and Ilya Sutskever. Language Models are Unsupervised Multitask Learners. 2019."
      }
    },
    "references": {
      "equations": "all"
    }
  },
  "assets": {
    "search": {
      "output": "generated/search.js"
    },
    "data": {
      "runs": {
        "source": "runs.csv",
        "output": "generated/runs.js"
      },
      "sweep": {
        "source": "sweep.yaml",
        "output": "generated/sweep.js"
      }
    }
  }
};
