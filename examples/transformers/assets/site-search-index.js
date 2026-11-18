// DocForm search index, made with the DocForm search extractor. Rebuild it with docform/tools/search-index.html.
window.DocFormSearch = {
 "generated": "2026-11-18T15:22:36.692Z",
 "pages": [
  {
   "path": "../index.html",
   "title": "From text to vectors",
   "sections": [
    {
     "id": "",
     "title": "From text to vectors",
     "level": 1,
     "text": ""
    },
    {
     "id": "token-ids",
     "title": "Split the prompt into token IDs",
     "level": 2,
     "text": ""
    },
    {
     "id": "lookup-code",
     "title": "Run the lookup",
     "level": 3,
     "text": ""
    },
    {
     "id": "position",
     "title": "Give each token a position",
     "level": 2,
     "text": "Start with the train is. Follow three token IDs through an attention head and a feed-forward layer, then turn the last position's state into a distribution over the next token. The worked model Six vocabulary entries, two coordinates per token, one causal attention head, and one feed-forward layer. The parameters are chosen by hand so that the entire forward pass can be checked. Trace a token to its attention weights and output. Our miniature tokenizer lowercases the text, treats the period as its own token, and looks up each piece in a six-entry vocabulary.The vocabulary order fixes both the input row lookup and the order of the output logits. Vocabulary lookup for the three prompt pieces. The IDs in name vocabulary rows. The difference between IDs 0 and 1 has no geometric meaning. A real tokenizer may emit pieces smaller than a word. Always use the tokenizer paired with the model's embedding and output tables. TokenIDEmbedding the0(1, 0) train1(0, 1) is2(1, 1) late3(0.5, 0.5) here4(0.5, 1) .5(0, 0.5) The vocabulary and its hand-set input embedding rows. import re vocab = [\"the\", \"train\", \"is\", \"late\", \"here\", \".\"] lookup = {token: i for i, token in enumerate(vocab)} pieces = re.findall(r\"\\w+|[^\\w\\s]\", \"the train is\".lower()) # (1) ids = [lookup[piece] for piece in pieces] # (2) Group word characters and keep each punctuation mark as a separate piece. Look up each piece. A piece outside the six entries raises a lookup error in this example. const vocab = [\"the\", \"train\", \"is\", \"late\", \"here\", \".\"]; const lookup = new Map(vocab.map((token, i) => [token, i])); const pieces = \"the train is\".toLowerCase().match(/\\w+|[^\\w\\s]/g) || []; const ids = pieces.map(piece => { if (!lookup.has(piece)) throw new Error(\"Unknown token: \" + piece); return lookup.get(piece); }); Use the rows of for token identity and add one vector per sequence position. In the example, the position vectors are . The attention layer receives: Why add position information? The same embedding is reused whenever a token appears. Position information lets a layer distinguish where each instance occurs. This example adds position vectors before the first layer, as in the original Transformer design. Check the third row The embedding for is is . Adding the third position vector gives . Take into the causal attention layer."
    }
   ],
   "terms": [
    {
     "text": "token",
     "term": "token",
     "section": ""
    },
    {
     "text": "token",
     "term": "token",
     "section": "token-ids"
    },
    {
     "text": "embedding",
     "term": "embedding",
     "section": "token-ids"
    },
    {
     "text": "token",
     "term": "token",
     "section": "position"
    },
    {
     "text": "embedding",
     "term": "embedding",
     "section": "position"
    }
   ]
  },
  {
   "path": "../pages/attention.html",
   "title": "Causal self-attention",
   "sections": [
    {
     "id": "",
     "title": "Causal self-attention",
     "level": 1,
     "text": ""
    },
    {
     "id": "causal-mask",
     "title": "Score, mask, normalize",
     "level": 2,
     "text": ""
    },
    {
     "id": "trace-query",
     "title": "Trace a token through attention",
     "level": 2,
     "text": ""
    },
    {
     "id": "attention-lab",
     "title": "Change the query position",
     "level": 2,
     "text": "Each position uses its query to select information from earlier positions and itself. Inspect one attention head with a vocabulary and prompt from the input chapter. Queries and keys determine the weights. Values carry the information combined with those weights. This head uses identity projections, so . The causal mask sets the upper triangle to negative infinity before softmax. Scaled scores, the causal mask, and row-wise weights. Score Mask Normalize Scaled dot products Take each query–key dot product and divide by , since a key has two coordinates. Block keys beyond the query The first query can use one key. The second can use two. The third can use all three. The upper triangle is excluded. Normalize each row Softmax turns allowed scores into weights that sum to one per row. Use each row to mix the value vectors. The drawn weights are rounded. Each prompt position supplies one query row. At temperature 1, the weights for that row mix the value vectors for the (1, 0), train (0, 1.5), and is (1.5, 1). The output is the resulting weighted sum. Future keys are masked and contribute zero. Query vectors, attention weights, and outputs at temperature 1 (rounded) Query rowWeight on theWeight on train Weight on isAttention output 1 · the (1, 0)1.0000 (masked)0 (masked)(1.000, 0.000) 2 · train (0, 1.5)0.1690.8310 (masked)(0.169, 1.246) 3 · is (1.5, 1)0.1840.1840.633(1.133, 0.908) For train, multiply the first value by about 0.169 and the second by about 0.831. Adding those contributions gives (0.169, 1.246). Both output coordinates are rounded after the calculation. Compare the weights for all three queries. Where can the head assign weight when the query is at position 1? What changes when a query can see a longer prefix? At query position 3, 0 of 3 keys are masked. Temperature divides the remaining scores before softmax. The worked forward pass uses 1. Attention weights for the selected query. Masked keys keep weight zero at every temperature. Weighted value vector: (1.133, 0.908). Why does the third query weight “the” and “train” equally? Its dot products with and both equal 1.5. The same scale and softmax denominator apply to both. Their value vectors still differ. Why mask before softmax? Masking before normalization gives the entire probability mass to allowed keys. If you first normalized across all keys and then zeroed future positions, the surviving weights could sum to less than one. Follow the vector onward Add the attention output back into the decoder stream and compute the next-token distribution."
    }
   ],
   "terms": [
    {
     "text": "causal mask",
     "term": "causal mask",
     "section": "causal-mask"
    },
    {
     "text": "softmax",
     "term": "softmax",
     "section": "causal-mask"
    },
    {
     "text": "Softmax",
     "term": "softmax",
     "section": "causal-mask"
    },
    {
     "text": "softmax",
     "term": "softmax",
     "section": "attention-lab"
    }
   ]
  },
  {
   "path": "../pages/prediction.html",
   "title": "Next-token prediction",
   "sections": [
    {
     "id": "",
     "title": "Next-token prediction",
     "level": 1,
     "text": ""
    },
    {
     "id": "decoder-block",
     "title": "Finish the decoder block",
     "level": 2,
     "text": ""
    },
    {
     "id": "readout",
     "title": "Turn the last state into logits",
     "level": 2,
     "text": ""
    },
    {
     "id": "decoding-temperature",
     "title": "Compare decoding temperatures",
     "level": 3,
     "text": ""
    },
    {
     "id": "decoding-setup",
     "title": "Choose a decoding setup",
     "level": 3,
     "text": ""
    },
    {
     "id": "readout-code",
     "title": "Implement the readout",
     "level": 2,
     "text": ""
    },
    {
     "id": "stable-softmax",
     "title": "Stabilize softmax",
     "level": 3,
     "text": ""
    },
    {
     "id": "learning-rate-sweep",
     "title": "Sweep the learning rate",
     "level": 2,
     "text": "Carry the last position's attention output through the rest of the decoder. Then compare the possible next tokens for the train is. The attention exercise gives the third position a context vector of approximately at temperature 1. The attention output projection in this example is the identity. A residual connection adds the result to the third input row, giving . Next apply the same feed-forward network independently at every position. For a row vector , this example uses: Two coordinates before and after the worked block. shows each position's state. Attention can mix positions. Once those mixtures are computed, acts on each row separately. Full-sized decoders stack many blocks, usually with multiple heads and a normalization layer around each sublayer. Dot the last row with one output vector per vocabulary entry. These parameters are separate from the input embeddings in this model. Use softmax across vocabulary entries to convert the six logits into probabilities. Output scores and next-token probabilities at temperature 1 TokenOutput vectorLogitProbability the(−0.25, 0.05)−0.6473.24% train(−0.32, 0.10)−0.7592.89% is(−0.10, −0.10)−0.4883.80% late(0.65, 0.05)2.02546.84% here(0.42, 0.22)1.66732.73% .(0.05, 0.20)0.53010.50% Output temperature divides the vocabulary logits before softmax. Decoding only The attention weights and hidden state stay fixed during this comparison. At temperature 1.0, the probability of late is 46.84%. Temperaturelatehere. (period) 0.564.36%31.43%3.24% 1.046.84%32.73%10.50% 1.537.47%29.51%13.83% 2.032.20%26.92%15.25% Probabilities for three vocabulary items at four temperatures. All six logits enter softmax. Generate one token Greedy decoding takes late, the highest-probability token. Sampling can also choose here or another token. Append the selected token and use the extended prefix to predict again. A decoding setup combines a temperature, a rule for choosing the next token, and optional token blocking. Pick a named setup or adjust each control. Both temperature sliders share one value. Greedy Top-2 sampling Full sampling With the period allowed, greedy decoding always appends late. How would this work during training? Shift the target sequence by one token. For the train is late, the first three target tokens are train is late. Compute a cross-entropy loss for each position with a target, using its causally masked prediction. For the worked last position, the loss for target late is about 0.76 nats at temperature 1. Here is the dot product against every output row. Use the rounded hidden state for a quick check. Subtract the largest logit before exponentiation. Each numerator and the denominator gain the same factor, so the probabilities stay the same. The largest exponential becomes 1, avoiding overflow. from math import exp def probabilities(logits, temperature=1): weights = [exp(x / temperature) for x in logits] total = sum(weights) return [w / total for w in weights] from math import exp def probabilities(logits, temperature=1): peak = max(logits) weights = [exp((x - peak) / temperature) for x in logits] total = sum(weights) return [w / total for w in weights] @@ Normalize vocabulary logits function probabilities(logits, temperature = 1) { - const weights = logits.map(x => Math.exp(x / temperature)); + const peak = Math.max(...logits); + const weights = logits.map(x => Math.exp((x - peak) / temperature)); const total = weights.reduce((sum, w) => sum + w, 0); return weights.map(w => w / total); } Apply the updated function to the logits from the preceding snippet and compare probabilities(logits)[3] with the late row in . Before training on a larger corpus, run the same short training job at several learning rates and compare the final cross-entropy losses. Learning rates are usually tried in steps of about 3×, so a log scale places each step the same distance apart. Losses also span two orders of magnitude here, so both axes use log scales. The numbers are illustrative. Learning"
    }
   ],
   "terms": [
    {
     "text": "residual connection",
     "term": "residual connection",
     "section": "decoder-block"
    },
    {
     "text": "normalization layer",
     "tip": "Rescales a position's hidden coordinates. Its placement varies by architecture.",
     "section": "decoder-block"
    },
    {
     "text": "softmax",
     "term": "softmax",
     "section": "readout"
    },
    {
     "text": "softmax",
     "term": "softmax",
     "section": "decoding-temperature"
    },
    {
     "text": "token",
     "term": "token",
     "section": "decoding-setup"
    },
    {
     "text": "logit",
     "term": "logit",
     "section": "stable-softmax"
    }
   ]
  },
  {
   "path": "../pages/diagnostics.html",
   "title": "Inspect training runs",
   "sections": [
    {
     "id": "",
     "title": "Inspect training runs",
     "level": 1,
     "text": ""
    },
    {
     "id": "run-filters",
     "title": "Filter the run log",
     "level": 2,
     "text": ""
    },
    {
     "id": "configurations",
     "title": "Compare complete training setups",
     "level": 2,
     "text": ""
    },
    {
     "id": "training-history",
     "title": "Replace the training curve",
     "level": 2,
     "text": ""
    },
    {
     "id": "latency-summary",
     "title": "Replace a static results table",
     "level": 2,
     "text": ""
    },
    {
     "id": "config-tree",
     "title": "Browse the configuration and metrics",
     "level": 2,
     "text": ""
    },
    {
     "id": "data-views",
     "title": "Read data as a table or code",
     "level": 2,
     "text": ""
    },
    {
     "id": "limits-errors",
     "title": "Check file limits and parse errors",
     "level": 2,
     "text": ""
    },
    {
     "id": "package-results",
     "title": "Package results for offline viewing",
     "level": 2,
     "text": "Compare synthetic follow-up runs for the learning-rate sweep. Look for low validation loss within a 25 ms decoding budget. The fixtures also exercise file replacement, parsing errors, and view limits in an offline document. Try the Under budget or Laptop candidates chips, a date range in the Started column, or a maximum in Validation loss. Seed uses a value list. Select Show more to load the rest of the runs with your filters still on. Run r04 has the lowest loss among the recorded runs that meet the latency budget. Follow-up runs for the six-token decoder RunStartedDeviceSeed Learning rateBatch Validation loss Latency (ms) Notes Open the source run log (CSV). Replace the run log with rerun.csv. Reset restores the original runs. Run r01 is the baseline. Both candidates change the learning rate and batch size. Each difference in loss or latency describes the whole setup, including the machine it ran on. Baseline and two candidate training runs MeasureUnitBaseline r01Lowest loss r03Under budget r04 Learning rate0.00010.00030.0003 Batch sizesequences83216 DeviceLaptopLab GPULaptop Validation lossnats0.720.550.57 Latencyms202922 The reference curve is for r04. Drop history.csv to plot a rerun on the same axes. The first column is the epoch and the other columns are loss series. Reset brings back the reference data, including its original Table view. EpochTrainValidation 11.551.61 21.141.24 30.820.94 40.650.77 50.510.64 60.430.57 Training and validation losses for r04 or a local rerun. Drop a training history (CSV). The summary below is written directly in HTML. Drop rerun.csv here to reuse the same columns and budget rule, then Reset to restore the authored rows. Latency check for the baseline and the selected run RunValidation loss Latency (ms) r010.7220 r040.5722 (selected) Drop a latency summary (CSV). Expand branches or use the arrow keys to inspect the training configuration. The short list under Seeds has its own Show more row. Open the source YAML to view the whole file. Load metrics.json to open a separate metrics tree. Try notes.txt to check the unsupported-file message. Files stay on this computer. Drop decoder metrics (JSON or YAML). The checkpoint table is stored as CSV inside the page. The run summary beneath it is registered with an inline JSON script and displayed as source code. checkpoint,epoch,retained \"r04, early\",3,false \"r04, final\",6,true The configuration can also render as highlighted YAML. This second view of the run log has a 256-byte limit. Select Show anyway to display the CSV as code. The draft metrics underneath intentionally omit a comma so you can see the parser's error and the source. { \"run\": \"r04\" \"validation_loss\": 0.57 } To swap the built-in run log, keep its column names and wrap the edited CSV with the offline data file converter. Load the resulting script before DocForm core. The shell command checks the first few lines, and the HTML and CSS show the markup for a wide data view and a limit on its width. head -n 5 runs.csv <div class=\"run-log\" data-df-data=\"runs\" data-df-wide></div> .run-log { --df-wide-width: 1120px; }"
    }
   ],
   "terms": []
  }
 ]
};
