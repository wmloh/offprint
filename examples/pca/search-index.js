// Offline DocForm search index. Rebuild with docform/tools/search-index.html after editing these pages.
window.DocFormSearch = {
 "generated": "2026-11-18T04:10:30.333Z",
 "pages": [
  {
   "path": "index.html",
   "title": "Set up the monitoring study",
   "sections": [
    {
     "id": "",
     "title": "Set up the monitoring study",
     "level": 1,
     "text": "A cooling-loop pump already has four sensors. Use its healthy operating history to decide how many principal components to keep in a reconstruction-based fault screen. Decision rule Start with the smallest model that retains at least 90% of baseline variance. Check what it flags on six held-out windows before recommending a setting."
    },
    {
     "id": "sensor-windows",
     "title": "What the sensors record",
     "level": 2,
     "text": "Window Flow 1 139.29 2 137.70 3 133.47 4 127.90 5 122.54 6 118.57 7 116.39 8 115.65 Flow in the first eight baseline windows, rounded to two decimals. Each row pairs the mean flow, discharge pressure, vibration RMS, and bearing temperature measured over the same five-minute window.RMS summarizes vibration amplitude over a window. The example starts with these window summaries. The smooth drop in the flow trace represents a scheduled load change. A healthy pump can move through a wide range of readings as demand changes."
    },
    {
     "id": "baseline-scales",
     "title": "Baseline units and scales",
     "level": 3,
     "text": "Training only Estimate these values from the 32 baseline windows before scoring any new windows. Signal Unit Mean Sample SD Flow L/min 120 8 Discharge pressure kPa 240 12 Vibration RMS mm/s 3.0 0.45 Bearing temperature °C 64 2.5 Design values for the 32 healthy training windows. Using raw covariance would give numerically larger signals more influence. Sample-standardize each column with the statistics in , then freeze those statistics for later windows. How the synthetic run was designed Four smooth, orthogonal operating traces drive the baseline. The first moves all sensors together. The second pairs flow and pressure against vibration and temperature. The two smaller traces give the model some baseline variation in the remaining directions. The baseline recipe regenerates all 32 windows. What came from field measurements? All readings and scenario labels are synthetic. The units, time-window structure, and need to keep evaluation separate from fitting reflect a typical monitoring workflow."
    },
    {
     "id": "plan",
     "title": "Analysis plan",
     "level": 2,
     "text": "Fit and interpret the PCA basis. Reconstruct held-out windows and measure the residual. Compare ranks against the alerting objective. Compare alert thresholds on the same six windows."
    }
   ]
  },
  {
   "path": "fit.html",
   "title": "Fit and interpret PCA",
   "sections": [
    {
     "id": "",
     "title": "Fit and interpret PCA",
     "level": 1,
     "text": "Transform four signals with different units into a common coordinate system. Then find the directions in which the healthy pump varies most."
    },
    {
     "id": "fit",
     "title": "From units to component scores",
     "level": 2,
     "text": "Let be the 32-by-4 baseline matrix. In the first two principal directions, this scroll-through follows one window as it is projected onto PC1. The baseline's first window in a two-component view. Standardize. Subtract each training mean and divide by its sample standard deviation. This gives each sensor unit variance in the baseline. Find the highest-variance direction. Diagonalize the covariance of the standardized rows. Order the eigenvectors by descending eigenvalue. Project. A component score is a dot product. Keeping only PC1 drops the PC2 coordinate shown here, along with the two smaller coordinates outside the drawing. uses sample covariance. The columns of are unit directions and contains the scores. We use the word loading for an entry of ."
    },
    {
     "id": "loadings",
     "title": "Read the loadings",
     "level": 3,
     "text": "Sensor PC1 PC2 PC3 PC4 Flow +0.5 +0.5 +0.5 +0.5 Pressure +0.5 +0.5 −0.5 −0.5 Vibration +0.5 −0.5 +0.5 −0.5 Temperature +0.5 −0.5 −0.5 +0.5 PC1 moves all four signals in the same direction. PC2 distinguishes a hydraulic shift from a vibration and temperature shift.A numerical eigensolver can flip any entire column of loadings. Flip the matching score column too and the reconstruction stays the same."
    },
    {
     "id": "rotate",
     "title": "Try a different direction",
     "level": 3,
     "text": "Turn a unit axis within the PC1–PC2 plane. It captures the most variance at 0°, along PC1. Trial direction in the leading two-dimensional subspace. Share of all four sensors' standardized variance along this axis: 62.0%."
    },
    {
     "id": "baseline-recipe",
     "title": "Reproduce the baseline",
     "level": 2,
     "text": "The recipe builds all 32 windows without sampling noise. Four cosine columns have mean zero and sum of squares 16 over the run. Multiplying each by gives it the desired sample variance. The orthonormal loading matrix above then mixes the traces into sensor space. from math import cos, pi, sqrt signs = ((1, 1, 1, 1), (1, 1, -1, -1), (1, -1, 1, -1), (1, -1, -1, 1)) eigenvalues = (2.48, 1.16, 0.28, 0.08) means, scales = (120, 240, 3, 64), (8, 12, 0.45, 2.5) def sensor_window(t): scores = [sqrt(v * 31 / 16) * cos(2*pi*(i+1)*t/32) for i, v in enumerate(eigenvalues)] # (1) z = [sum(s * row[j] / 2 for s, row in zip(scores, signs)) for j in range(4)] # (2) return [m + sd*x for m, sd, x in zip(means, scales, z)] baseline = [sensor_window(t) for t in range(32)] Each cosine supplies one component's score over time. Mix scores using the loading matrix, then return the result to sensor units. const signs = [[1, 1, 1, 1], [1, 1, -1, -1], [1, -1, 1, -1], [1, -1, -1, 1]]; const eigenvalues = [2.48, 1.16, 0.28, 0.08]; const means = [120, 240, 3, 64]; const scales = [8, 12, 0.45, 2.5]; const baseline = Array.from({ length: 32 }, (_, t) => { const scores = eigenvalues.map((v, i) => Math.sqrt(v * 31 / 16) * Math.cos(2 * Math.PI * (i + 1) * t / 32)); return means.map((mean, j) => { const z = scores.reduce((sum, s, i) => sum + s * signs[i][j] / 2, 0); return mean + scales[j] * z; }); }); From scores to alerts The leading scores describe familiar operating variation. Next, measure what remains when a later window is reconstructed from those scores."
    }
   ]
  },
  {
   "path": "monitor.html",
   "title": "Choose a component count",
   "sections": [
    {
     "id": "",
     "title": "Choose a component count",
     "level": 1,
     "text": "Apply the frozen scaler and PCA basis to six new pump windows. Compare how much routine variation each rank retains and which fault scenarios still produce a large residual."
    },
    {
     "id": "reconstruction",
     "title": "How a window becomes an alert",
     "level": 2,
     "text": "Retain the first directions in . Reconstruct the standardized row and sum the squared residuals. Because the four directions form an orthonormal basis, the right side of gives the same score directly from the discarded components. Projection and residual, shown schematically. The reconstruction captures variation similar to the baseline. A large residual means the sensor combination departed from those learned directions. For this exercise, every rank uses the same threshold. Flag a window when in squared standardized units."
    },
    {
     "id": "evaluation",
     "title": "Held-out pump windows",
     "level": 2,
     "text": "The six scenarios are specified in score space. To reproduce their raw sensor readings, multiply each row by , then multiply by the sensor scales and add the means from baseline units and scales. Component scores for each evaluation scenario Scenario Label PC1 PC2 PC3 PC4 Higher cooling demand Healthy 1.20 1.00 0.20 0.10 Demand drops Healthy −0.80 −0.90 0.10 −0.20 Steady load Healthy 0.60 0.40 −0.25 0.10 Pressure reads low relative to flow Fault 0.90 0.30 1.20 0.10 Pressure reads high relative to flow Fault −0.50 −0.40 −1.10 0.20 Common-mode offset Fault 3.20 0.10 0.20 0.10 Held-out scores in the two leading directions. The table above includes PC3 and PC4. The common-mode offset is extreme along PC1 in . Much of that shift survives reconstruction, so its residual remains small."
    },
    {
     "id": "rank-exercise",
     "title": "Try the ranks on one fault",
     "level": 3,
     "text": "Vary the retained rank for the low-pressure scenario. Which component carries most of its residual? Decision at the exercise threshold: flag this window."
    },
    {
     "id": "trade-offs",
     "title": "Compare rank trade-offs",
     "level": 2,
     "text": "Cumulative explained variance on the baseline. Rank Faults flagged Healthy windows flagged 1 PC 2 2 2 PCs 2 0 3 PCs 0 0 4 PCs 0 0 Alerts at the same 0.80 threshold for all ranks. Rank comparison on three healthy and three fault windows Rank Variance retained False alerts Faults flagged Outcome 1 62% 2 2 Flags routine variation 2 91% 0 2 Meets the exercise target 3 98% 0 0 Absorbs both pressure faults 4 100% 0 0 Reconstructs every window exactly Keep two components for this exercise Two retain 91% of baseline variance and catch both pressure scenarios without flagging the healthy windows. The common-mode offset is a blind spot for the residual rule. How could an operator catch the common-mode offset? Watch retained scores as well as residuals. One option is a score-space statistic such as . Set and assess the thresholds on separate operating periods that include the healthy load range.The six scenarios illustrate mechanisms. A production alert rate needs a larger, representative validation period."
    },
    {
     "id": "alert-thresholds",
     "title": "Compare pump-alert thresholds",
     "level": 2,
     "text": "Keep two components and use the same six held-out windows for every threshold. The residual is the sum of the squared PC3 and PC4 scores. Alert only when the residual is above the threshold. In the comparison, 1 means alert and 0 means pass. Rank-two alert decisions by threshold Window Unit Exercise baseline More sensitive Less sensitive Residual threshold squared standardized units 0.80 0.06 1.30 Higher demand Alert (0 or 1) 0 0 0 Demand drops Alert (0 or 1) 0 0 0 Steady load Alert (0 or 1) 0 1 0 Pressure low Alert (0 or 1) 1 1 1 Pressure high Alert (0 or 1) 1 1 0 Common-mode offset Alert (0 or 1) 0 0 0 At 0.06, the steady-load residual of 0.0725 causes a new false alert. At 1.30, the high-pressure residual of 1.25 now passes, so that fault is missed. The low-pressure residual of 1.45 still triggers an alert at every threshold."
    },
    {
     "id": "implementation",
     "title": "Implement the residual rule",
     "level": 2,
     "text": "Use the same post-fit score convention in both languages. The change below replaces a rule that monitors all score energy with one that isolates energy outside the retained subspace. def residual_score(scores, rank): return sum(score**2 for score in scores) def residual_score(scores, rank): return sum(score**2 for score in scores[rank:]) @@ Residual scoring function residualScore(scores, rank) { - return scores.reduce((sum, score) => sum + score ** 2, 0); + return scores.slice(rank).reduce((sum, score) => sum + score ** 2, 0); }"
    },
    {
     "id": "check-residual",
     "title": "Check an alert and a pass",
     "level": 3,
     "text": "Run this with the updated function above. The low-pressure window triggers an alert at rank two and passes at rank three. At rank two, the low-pressure window's discarded scores give . Compare the input order with the loading matrix. References"
    }
   ]
  }
 ]
};
