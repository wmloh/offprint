// Offline DocForm search index. Rebuild with docform/tools/search-index.html after editing these pages.
window.DocFormSearch = {
 "generated": "2026-11-18T02:37:09.280Z",
 "pages": [
  {
   "path": "index.html",
   "title": "From text to vectors",
   "sections": [
    {
     "id": "",
     "title": "From text to vectors",
     "level": 1,
     "text": "Start with the train is. Follow three token IDs through an attention head and a feed-forward layer, then turn the last position's state into a distribution over the next token. The worked model Six vocabulary entries, two coordinates per token, one causal attention head, and one feed-forward layer. The parameters are chosen by hand so that the entire forward pass can be checked."
    },
    {
     "id": "token-ids",
     "title": "Split the prompt into token IDs",
     "level": 2,
     "text": "Our miniature tokenizer lowercases the text, treats the period as its own token, and looks up each piece in a six-entry vocabulary.The vocabulary order fixes both the input row lookup and the order of the output logits. Vocabulary lookup for the three prompt pieces. The IDs in name vocabulary rows. The difference between IDs 0 and 1 has no geometric meaning. A real tokenizer may emit pieces smaller than a word. Always use the tokenizer paired with the model's embedding and output tables. Token ID Embedding the 0 (1, 0) train 1 (0, 1) is 2 (1, 1) late 3 (0.5, 0.5) here 4 (0.5, 1) . 5 (0, 0.5) The vocabulary and its hand-set input embedding rows."
    },
    {
     "id": "lookup-code",
     "title": "Run the lookup",
     "level": 3,
     "text": "import re vocab = [\"the\", \"train\", \"is\", \"late\", \"here\", \".\"] lookup = {token: i for i, token in enumerate(vocab)} pieces = re.findall(r\"\\w+|[^\\w\\s]\", \"the train is\".lower()) # (1) ids = [lookup[piece] for piece in pieces] # (2) Group word characters and keep each punctuation mark as a separate piece. Look up each piece. A piece outside the six entries raises a lookup error in this example. const vocab = [\"the\", \"train\", \"is\", \"late\", \"here\", \".\"]; const lookup = new Map(vocab.map((token, i) => [token, i])); const pieces = \"the train is\".toLowerCase().match(/\\w+|[^\\w\\s]/g) || []; const ids = pieces.map(piece => { if (!lookup.has(piece)) throw new Error(\"Unknown token: \" + piece); return lookup.get(piece); });"
    },
    {
     "id": "position",
     "title": "Give each token a position",
     "level": 2,
     "text": "Use the rows of for token identity and add one vector per sequence position. In the example, the position vectors are . The attention layer receives: Why add position information? The same embedding is reused whenever a token appears. Position information lets a layer distinguish where each instance occurs. This example adds position vectors before the first layer, as in the original Transformer design. Check the third row The embedding for is is . Adding the third position vector gives . Take into the causal attention layer."
    }
   ]
  },
  {
   "path": "attention.html",
   "title": "Causal self-attention",
   "sections": [
    {
     "id": "",
     "title": "Causal self-attention",
     "level": 1,
     "text": "Each position uses its query to select information from earlier positions and itself. Inspect one attention head with a vocabulary and prompt from the input chapter."
    },
    {
     "id": "causal-mask",
     "title": "Score, mask, normalize",
     "level": 2,
     "text": "Queries and keys determine the weights. Values carry the information combined with those weights. This head uses identity projections, so . The causal mask sets the upper triangle to negative infinity before softmax. Scaled scores, the causal mask, and row-wise weights. Score. Take each query–key dot product and divide by , since a key has two coordinates. Mask. The first query can use one key. The second can use two. The third can use all three. The upper triangle is excluded. Normalize. Softmax turns allowed scores into weights that sum to one per row. Use each row to mix the value vectors. The drawn weights are rounded."
    },
    {
     "id": "attention-lab",
     "title": "Change the query position",
     "level": 2,
     "text": "Compare the weights for all three queries. Where can the head assign weight when the query is at position 1? What changes when a query can see a longer prefix? At query position 3, 0 of 3 keys are masked. Temperature divides the remaining scores before softmax. The worked forward pass uses 1. Attention weights for the selected query. Masked keys keep weight zero at every temperature. Weighted value vector: (1.133, 0.908). Why does the third query weight “the” and “train” equally? Its dot products with and both equal 1.5. The same scale and softmax denominator apply to both. Their value vectors still differ. Why mask before softmax? Masking before normalization gives the entire probability mass to allowed keys. If you first normalized across all keys and then zeroed future positions, the surviving weights could sum to less than one. Follow the vector onward Add the attention output back into the decoder stream and compute the next-token distribution."
    }
   ]
  },
  {
   "path": "prediction.html",
   "title": "Next-token prediction",
   "sections": [
    {
     "id": "",
     "title": "Next-token prediction",
     "level": 1,
     "text": "Carry the last position's attention output through the rest of the decoder. Then compare the possible next tokens for the train is."
    },
    {
     "id": "decoder-block",
     "title": "Finish the decoder block",
     "level": 2,
     "text": "The attention exercise gives the third position a context vector of approximately at temperature 1. The attention output projection in this example is the identity. A residual connection adds the result to the third input row, giving . Next apply the same feed-forward network independently at every position. For a row vector , this example uses: Two coordinates before and after the worked block. shows each position's state. Attention can mix positions. Once those mixtures are computed, acts on each row separately. Full-sized decoders stack many blocks, usually with multiple heads and a normalization layer around each sublayer."
    },
    {
     "id": "readout",
     "title": "Turn the last state into logits",
     "level": 2,
     "text": "Dot the last row with one output vector per vocabulary entry. These parameters are separate from the input embeddings in this model. Use softmax across vocabulary entries to convert the six logits into probabilities. Output scores and next-token probabilities at temperature 1 Token Output vector Logit Probability the (−0.25, 0.05) −0.647 3.24% train (−0.32, 0.10) −0.759 2.89% is (−0.10, −0.10) −0.488 3.80% late (0.65, 0.05) 2.025 46.84% here (0.42, 0.22) 1.667 32.73% . (0.05, 0.20) 0.530 10.50%"
    },
    {
     "id": "decoding-temperature",
     "title": "Compare decoding temperatures",
     "level": 3,
     "text": "Output temperature divides the vocabulary logits before softmax. Decoding only The attention weights and hidden state stay fixed during this comparison. At temperature 1.0, the probability of late is 46.84%. Temperature late here . (period) 0.5 64.36% 31.43% 3.24% 1.0 46.84% 32.73% 10.50% 1.5 37.47% 29.51% 13.83% 2.0 32.20% 26.92% 15.25% Probabilities for three vocabulary items at four temperatures. All six logits enter softmax. Generate one token Greedy decoding takes late, the highest-probability token. Sampling can also choose here or another token. Append the selected token and use the extended prefix to predict again. How would this work during training? Shift the target sequence by one token. For the train is late, the first three target tokens are train is late. Compute a cross-entropy loss for each position with a target, using its causally masked prediction. For the worked last position, the loss for target late is about 0.76 nats at temperature 1."
    },
    {
     "id": "readout-code",
     "title": "Implement the readout",
     "level": 2,
     "text": "Here is the dot product against every output row. Use the rounded hidden state for a quick check."
    },
    {
     "id": "stable-softmax",
     "title": "Stabilize softmax",
     "level": 3,
     "text": "Subtract the largest logit before exponentiation. Each numerator and the denominator gain the same factor, so the probabilities stay the same. The largest exponential becomes 1, avoiding overflow. from math import exp def probabilities(logits, temperature=1): weights = [exp(x / temperature) for x in logits] total = sum(weights) return [w / total for w in weights] from math import exp def probabilities(logits, temperature=1): peak = max(logits) weights = [exp((x - peak) / temperature) for x in logits] total = sum(weights) return [w / total for w in weights] @@ Normalize vocabulary logits function probabilities(logits, temperature = 1) { - const weights = logits.map(x => Math.exp(x / temperature)); + const peak = Math.max(...logits); + const weights = logits.map(x => Math.exp((x - peak) / temperature)); const total = weights.reduce((sum, w) => sum + w, 0); return weights.map(w => w / total); } Apply the updated function to the logits from the preceding snippet and compare probabilities(logits)[3] with the late row in . References"
    }
   ]
  }
 ]
};
