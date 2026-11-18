// DocForm search index, made with the DocForm search extractor. Rebuild it with docform/tools/search-index.html.
window.DocFormSearch = {
 "generated": "2026-11-18T15:22:36.685Z",
 "pages": [
  {
   "path": "../index.html",
   "title": "Set up the monitoring study",
   "sections": [
    {
     "id": "",
     "title": "Set up the monitoring study",
     "level": 1,
     "text": ""
    },
    {
     "id": "sensor-windows",
     "title": "What the sensors record",
     "level": 2,
     "text": ""
    },
    {
     "id": "baseline-scales",
     "title": "Baseline units and scales",
     "level": 3,
     "text": ""
    },
    {
     "id": "plan",
     "title": "Analysis plan",
     "level": 2,
     "text": "A cooling-loop pump already has four sensors. Use its healthy operating history to decide how many principal components to keep in a reconstruction-based fault screen. Decision rule Start with the smallest model that retains at least 90% of baseline variance. Check what it flags on six held-out windows before recommending a setting. WindowFlow 1139.29 2137.70 3133.47 4127.90 5122.54 6118.57 7116.39 8115.65 Flow in the first eight baseline windows, rounded to two decimals. Each row pairs the mean flow, discharge pressure, vibration RMS, and bearing temperature measured over the same five-minute window.RMS summarizes vibration amplitude over a window. The example starts with these window summaries. The smooth drop in the flow trace represents a scheduled load change. A healthy pump can move through a wide range of readings as demand changes. Training only Estimate these values from the 32 baseline windows before scoring any new windows. SignalUnitMeanSample SD FlowL/min1208 Discharge pressurekPa24012 Vibration RMSmm/s3.00.45 Bearing temperature°C642.5 Design values for the 32 healthy training windows. Using raw covariance would give numerically larger signals more influence. Sample-standardize each column with the statistics in , then freeze those statistics for later windows. How the synthetic run was designed Four smooth, orthogonal operating traces drive the baseline. The first moves all sensors together. The second pairs flow and pressure against vibration and temperature. The two smaller traces give the model some baseline variation in the remaining directions. The baseline recipe regenerates all 32 windows. What came from field measurements? All readings and scenario labels are synthetic. The units, time-window structure, and need to keep evaluation separate from fitting reflect a typical monitoring workflow. Fit and interpret the PCA basis. Reconstruct held-out windows and measure the residual. Compare ranks against the alerting objective. Compare alert thresholds on the same six windows. Investigate a telemetry incident. Look up terms and their uses in the glossary."
    }
   ],
   "terms": [
    {
     "text": "baseline",
     "term": "baseline",
     "section": "baseline-scales"
    }
   ]
  },
  {
   "path": "../pages/fit.html",
   "title": "Fit and interpret PCA",
   "sections": [
    {
     "id": "",
     "title": "Fit and interpret PCA",
     "level": 1,
     "text": ""
    },
    {
     "id": "fit",
     "title": "From units to component scores",
     "level": 2,
     "text": ""
    },
    {
     "id": "loadings",
     "title": "Read the loadings",
     "level": 3,
     "text": ""
    },
    {
     "id": "rotate",
     "title": "Try a different direction",
     "level": 3,
     "text": ""
    },
    {
     "id": "baseline-recipe",
     "title": "Reproduce the baseline",
     "level": 2,
     "text": "Transform four signals with different units into a common coordinate system. Then find the directions in which the healthy pump varies most. Let be the 32-by-4 baseline matrix. Choose a step to follow one window as it is projected onto PC1. The baseline's first window in a two-component view. Standardize Find PC1 Project Subtract each sensor's training mean and divide by its sample standard deviation to give it unit variance in the baseline. Diagonalize the covariance of the standardized data and order the eigenvectors by descending eigenvalue. A component score is the dot product with one of those directions. Keeping only PC1 drops the PC2 coordinate shown here and the two smaller coordinates outside the drawing. uses sample covariance. The columns of are unit directions and contains the scores. We use the word loading for an entry of . SensorPC1PC2PC3PC4 Flow+0.5+0.5+0.5+0.5 Pressure+0.5+0.5−0.5−0.5 Vibration+0.5−0.5+0.5−0.5 Temperature+0.5−0.5−0.5+0.5 PC1 moves all four signals in the same direction. PC2 distinguishes a hydraulic shift from a vibration and temperature shift.A numerical eigensolver can flip any entire column of loadings. Flip the matching score column too and the reconstruction stays the same. Turn a unit axis within the PC1–PC2 plane. It captures the most variance at 0°, along PC1. Trial direction in the leading two-dimensional subspace. Share of all four sensors' standardized variance along this axis: 62.0%. The recipe builds all 32 windows without sampling noise. Four cosine columns have mean zero and sum of squares 16 over the run. Multiplying each by gives it the desired sample variance. The orthonormal loading matrix above then mixes the traces into sensor space. from math import cos, pi, sqrt signs = ((1, 1, 1, 1), (1, 1, -1, -1), (1, -1, 1, -1), (1, -1, -1, 1)) eigenvalues = (2.48, 1.16, 0.28, 0.08) means, scales = (120, 240, 3, 64), (8, 12, 0.45, 2.5) def sensor_window(t): scores = [sqrt(v * 31 / 16) * cos(2*pi*(i+1)*t/32) for i, v in enumerate(eigenvalues)] # (1) z = [sum(s * row[j] / 2 for s, row in zip(scores, signs)) for j in range(4)] # (2) return [m + sd*x for m, sd, x in zip(means, scales, z)] baseline = [sensor_window(t) for t in range(32)] Each cosine supplies one component's score over time. Mix scores using the loading matrix, then return the result to sensor units. const signs = [[1, 1, 1, 1], [1, 1, -1, -1], [1, -1, 1, -1], [1, -1, -1, 1]]; const eigenvalues = [2.48, 1.16, 0.28, 0.08]; const means = [120, 240, 3, 64]; const scales = [8, 12, 0.45, 2.5]; const baseline = Array.from({ length: 32 }, (_, t) => { const scores = eigenvalues.map((v, i) => Math.sqrt(v * 31 / 16) * Math.cos(2 * Math.PI * (i + 1) * t / 32)); return means.map((mean, j) => { const z = scores.reduce((sum, s, i) => sum + s * signs[i][j] / 2, 0); return mean + scales[j] * z; }); }); From scores to alerts The leading scores describe familiar operating variation. Next, measure what remains when a later window is reconstructed from those scores."
    }
   ],
   "terms": [
    {
     "text": "baseline",
     "term": "baseline",
     "section": "fit"
    },
    {
     "text": "component score",
     "term": "component score",
     "section": "fit"
    },
    {
     "text": "loading",
     "tip": "Here, a coefficient in a unit principal direction. Some texts scale these coefficients by the square root of the eigenvalue.",
     "section": "fit"
    }
   ]
  },
  {
   "path": "../pages/monitor.html",
   "title": "Choose a component count",
   "sections": [
    {
     "id": "",
     "title": "Choose a component count",
     "level": 1,
     "text": ""
    },
    {
     "id": "reconstruction",
     "title": "How a window becomes an alert",
     "level": 2,
     "text": ""
    },
    {
     "id": "evaluation",
     "title": "Held-out pump windows",
     "level": 2,
     "text": ""
    },
    {
     "id": "rank-exercise",
     "title": "Try the ranks on one fault",
     "level": 3,
     "text": ""
    },
    {
     "id": "trade-offs",
     "title": "Compare rank trade-offs",
     "level": 2,
     "text": ""
    },
    {
     "id": "alert-thresholds",
     "title": "Compare pump-alert thresholds",
     "level": 2,
     "text": ""
    },
    {
     "id": "implementation",
     "title": "Implement the residual rule",
     "level": 2,
     "text": ""
    },
    {
     "id": "check-residual",
     "title": "Check an alert and a pass",
     "level": 3,
     "text": "Apply the frozen scaler and PCA basis to six new pump windows. Compare how much routine variation each rank retains and which fault scenarios still produce a large residual. Retain the first directions in . Reconstruct the standardized row and sum the squared residuals. Because the four directions form an orthonormal basis, the right side of gives the same score directly from the discarded components. Projection and residual, shown schematically. The reconstruction captures variation similar to the baseline. A large residual means the sensor combination departed from those learned directions. For this exercise, every rank uses the same threshold. Flag a window when in squared standardized units. See the live residual trace for an illustrative hour with a dropout and two windows above the threshold. The six scenarios are specified in score space. To reproduce their raw sensor readings, multiply each row by , then multiply by the sensor scales and add the means from baseline units and scales. Each residual sums the squared scores beyond the first components. Component scores and residuals for each evaluation scenario ScenarioLabelPC1PC2PC3PC4Q₁Q₂Q₃ Higher cooling demandHealthy1.201.000.200.101.050.050.01 Demand dropsHealthy−0.80−0.900.10−0.200.860.050.04 Steady loadHealthy0.600.40−0.250.100.230.070.01 Pressure reads low relative to flowFault0.900.301.200.101.541.450.01 Pressure reads high relative to flowFault−0.50−0.40−1.100.201.411.250.04 Common-mode offsetFault3.200.100.200.100.060.050.01 Held-out scores in the two leading directions. The table above includes PC3 and PC4. The common-mode offset is extreme along PC1 in . Much of that shift survives reconstruction, so its residual remains small. Vary the retained rank for the low-pressure scenario. Which component carries most of its residual? Decision at the exercise threshold: flag this window. Predict what happens to the low-pressure window when you move from rank two to rank three. Check the low-pressure window Rank three retains PC3. The residual drops from 1.45 to 0.01, so the window passes. Now try an unseen window with PC3 score 0.10 and PC4 score 1.00. Would rank three flag it? Check the new window Rank three leaves PC4, so the squared residual is 1.00. The 0.80 threshold flags the window. Cumulative explained variance on the baseline. RankFaults flaggedHealthy windows flagged 1 PC22 2 PCs20 3 PCs00 4 PCs00 Alerts at the same 0.80 threshold for all ranks. Rank comparison on three healthy and three fault windows RankVariance retainedFalse alertsFaults flaggedOutcome 162%22Flags routine variation 291%02Meets the exercise target 398%00Absorbs both pressure faults 4100%00Reconstructs every window exactly Keep two components for this exercise Two retain 91% of baseline variance and catch both pressure scenarios without flagging the healthy windows. The common-mode offset is a blind spot for the residual rule. How could an operator catch the common-mode offset? Watch retained scores as well as residuals. One option is a score-space statistic such as . Set and assess the thresholds on separate operating periods that include the healthy load range.The six scenarios illustrate mechanisms. A production alert rate needs a larger, representative validation period. Keep two components and use the same six held-out windows for every threshold. The residual is the sum of the squared PC3 and PC4 scores. Alert only when the residual is above the threshold. In the comparison, 1 means alert and 0 means pass. Rank-two alert decisions by threshold WindowUnitExercise baseline More sensitiveLess sensitive Residual thresholdsquared standardized units0.800.061.30 Higher demandAlert (0 or 1)000 Demand dropsAlert (0 or 1)000 Steady loadAlert (0 or 1)010 Pressure lowAlert (0 or 1)111 Pressure highAlert (0 or 1)110 Common-mode offsetAlert (0 or 1)000 At 0.06, the steady-load residual of 0.0725 causes a new false alert. At 1.30, the high-pressure residual of 1.25 now passes, so that fault is"
    }
   ],
   "terms": [
    {
     "text": "residual",
     "term": "residual",
     "section": ""
    },
    {
     "text": "baseline",
     "term": "baseline",
     "section": "reconstruction"
    },
    {
     "text": "residual",
     "term": "residual",
     "section": "reconstruction"
    },
    {
     "text": "residual",
     "term": "residual",
     "section": "evaluation"
    },
    {
     "text": "residual",
     "term": "residual",
     "section": "rank-exercise"
    },
    {
     "text": "residual",
     "term": "residual",
     "section": "alert-thresholds"
    }
   ]
  },
  {
   "path": "../pages/telemetry.html",
   "title": "Investigate a telemetry incident",
   "sections": [
    {
     "id": "",
     "title": "Investigate a telemetry incident",
     "level": 1,
     "text": ""
    },
    {
     "id": "residual-trace",
     "title": "Inspect the residual trace",
     "level": 2,
     "text": ""
    },
    {
     "id": "incident-timeline",
     "title": "Follow the incident on two clocks",
     "level": 2,
     "text": ""
    },
    {
     "id": "count-once",
     "title": "Count each window once",
     "level": 2,
     "text": "Follow an hour of synthetic pump readings from the sensor gateway to the residual chart. The residual crosses the rank-two alert threshold after a telemetry gap. Hide either rank with the legend. Drag across the chart to zoom into a time range, then use Reset range to restore the hour. With the plot focused, + and − adjust the range. Select Table to see the readings in the current view. The plot aligns offset timestamps on a UTC axis. Window timestampRank 1Rank 2 2026-11-18T08:00:00-05:000.950.21 2026-11-18T13:05:00Z0.840.18 2026-11-18T13:10:00Z1.020.30 2026-11-18T13:15:00Z0.960.26 2026-11-18T13:20:00Z0.890.24 2026-11-18T13:25:00Z 2026-11-18T13:30:00Z 2026-11-18T13:35:00Z1.040.33 2026-11-18T13:40:00Z0.910.28 2026-11-18T08:45:00-05:001.541.45 2026-11-18T13:50:00Z1.481.38 2026-11-18T08:55:00-05:000.900.31 Rank-one and rank-two residuals by window time. Two windows have missing telemetry, leaving a gap. The 13:45 and 13:50 UTC windows trigger the rank-two rule. Click the caption in , or focus the figure and press Enter, to open the presentation tools. Try the crosshair for timestamp and residual readouts, or use the magnifier, laser, pen, or highlighter. The projection diagram uses a ruler in the same tool slot. The sensor timestamps each window at acquisition. The gateway records receipt in seconds since its 12:59:30 UTC startup. Use Previous and Next to follow the events, or select a keyed point in the chart. Record a normal window. Rank two leaves a residual of 0.21. The gateway records the reading one second after acquisition. Flag the low-pressure window. After the gap, the rank-two residual reaches 1.45. The gateway receives this window three seconds late. Observe recovery. The rank-two residual returns to 0.31. The gateway receives the window after one second. Acquisition and receipt times for the selected event EventSensor (UTC−05:00) Gateway (seconds since startup) Normal08:00:0031 s First alert08:45:002733 s Recovery08:55:003331 s If the gateway resends the 08:45 window, count its alert once. Keep the first arrival per window ID within a replay of this pump's telemetry. Both snippets count distinct flagged windows. WITH ranked AS ( SELECT q2, ROW_NUMBER() OVER ( PARTITION BY window_id ORDER BY received_at, arrival_id -- (1) ) AS arrival_rank FROM pump_arrivals ) SELECT COUNT(*) AS alerts FROM ranked WHERE arrival_rank = 1 AND q2 > 0.80; Use the arrival ID to break ties between rows with the same receipt timestamp. var seen = new HashSet<string>(); int alerts = 0; foreach (var reading in arrivalsInReceiptOrder) { if (!seen.Add(reading.WindowId)) continue; // (1) if (reading.Q2 > 0.80) alerts++; } A replayed ID is already in the set, so it makes no contribution to the count."
    }
   ],
   "terms": [
    {
     "text": "residual",
     "term": "residual",
     "section": ""
    },
    {
     "text": "residual",
     "tip": "For this incident, the squared energy in PC3 and PC4 of the current pump window.",
     "section": ""
    },
    {
     "text": "residual",
     "term": "residual",
     "section": "residual-trace"
    },
    {
     "text": "residual",
     "term": "residual",
     "section": "incident-timeline"
    }
   ]
  },
  {
   "path": "../pages/glossary.html",
   "title": "Glossary",
   "sections": [
    {
     "id": "",
     "title": "Glossary",
     "level": 1,
     "text": "Compare the case study's shared definitions with the inline definitions from individual chapters. The links under each term jump to the sections that use it. After changing a definition, use the search index builder to rebuild the index that site.js loads."
    }
   ],
   "terms": []
  }
 ]
};
