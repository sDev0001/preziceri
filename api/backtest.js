const { loadAllCSVMatches } = require('../src/data/csvParser');
const { ensembleBacktest } = require('../src/model/ensemble');
const { MODEL, ENSEMBLE } = require('../src/config');

let cachedResult = null;

module.exports = (req, res) => {
  try {
    // Cache backtest result (expensive computation)
    if (!cachedResult) {
      const csvMatches = loadAllCSVMatches(ENSEMBLE.CSV_SEASONS);
      const testStart = csvMatches.findIndex(m => m.season >= 2020);

      const result = ensembleBacktest(csvMatches, {
        xi: MODEL.XI, rho: MODEL.RHO,
        eloK: ENSEMBLE.ELO_K, eloHomeAdvantage: ENSEMBLE.ELO_HOME_ADVANTAGE,
        weights: ENSEMBLE.WEIGHTS, statsDamping: ENSEMBLE.STATS_DAMPING,
        drawBoostStrength: ENSEMBLE.DRAW_BOOST_STRENGTH || 0.5,
        drawThreshold: ENSEMBLE.DRAW_THRESHOLD || 0.05,
        refereeDamping: ENSEMBLE.REFEREE_DAMPING || 0.15,
      }, testStart, false);

      // Build chart data
      const rollingData = [];
      let correctCount = 0;
      for (let i = 0; i < result.results.length; i++) {
        if (result.results[i].correct) correctCount++;
        if ((i + 1) % 10 === 0) {
          const last10 = result.results.slice(Math.max(0, i - 9), i + 1);
          rollingData.push({
            matchIndex: i + 1,
            rollingAccuracy: +(correctCount / (i + 1) * 100).toFixed(1),
            last10Accuracy: +(last10.filter(r => r.correct).length / last10.length * 100).toFixed(1),
          });
        }
      }

      const predBuckets = { homeWin: 0, draw: 0, awayWin: 0 };
      const realBuckets = { homeWin: 0, draw: 0, awayWin: 0 };
      for (const r of result.results) {
        const maxP = Math.max(r.predicted.homeWin, r.predicted.draw, r.predicted.awayWin);
        if (r.predicted.homeWin === maxP) predBuckets.homeWin++;
        else if (r.predicted.draw === maxP) predBuckets.draw++;
        else predBuckets.awayWin++;
        if (r.actual === 'HOME_TEAM') realBuckets.homeWin++;
        else if (r.actual === 'DRAW') realBuckets.draw++;
        else realBuckets.awayWin++;
      }

      // Calibration
      const bucketSize = 0.1;
      const calBuckets = {};
      for (const r of result.results) {
        for (const { outcome, prob } of [
          { outcome: 'HOME_TEAM', prob: r.predicted.homeWin },
          { outcome: 'DRAW', prob: r.predicted.draw },
          { outcome: 'AWAY_TEAM', prob: r.predicted.awayWin },
        ]) {
          const key = (Math.floor(prob / bucketSize) * bucketSize).toFixed(1);
          if (!calBuckets[key]) calBuckets[key] = { predicted: 0, actual: 0, count: 0 };
          calBuckets[key].predicted += prob;
          calBuckets[key].actual += (r.actual === outcome) ? 1 : 0;
          calBuckets[key].count++;
        }
      }
      const calibration = Object.entries(calBuckets).sort().filter(([, d]) => d.count >= 5).map(([bucket, data]) => ({
        bucket: +bucket, avgPredicted: +(data.predicted / data.count).toFixed(3),
        actualRate: +(data.actual / data.count).toFixed(3), count: data.count,
      }));

      const sampleResults = result.results.slice(-20).map(r => ({
        match: r.match, date: r.date,
        homeWin: +(r.predicted.homeWin * 100).toFixed(0),
        draw: +(r.predicted.draw * 100).toFixed(0),
        awayWin: +(r.predicted.awayWin * 100).toFixed(0),
        actual: r.actual === 'HOME_TEAM' ? '1' : r.actual === 'DRAW' ? 'X' : '2',
        correct: r.correct,
        predictedScore: r.predictedScore ? `${r.predictedScore.home}-${r.predictedScore.away}` : '-',
        actualScore: r.actualScore ? `${r.actualScore.home}-${r.actualScore.away}` : '-',
      }));

      // Accuracy by confidence
      const confidenceBuckets = [
        { label: 'Toate meciurile', min: 0, max: 1 },
        { label: 'Certitudine > 50%', min: 0.50, max: 1 },
        { label: 'Certitudine > 60%', min: 0.60, max: 1 },
        { label: 'Certitudine > 70%', min: 0.70, max: 1 },
        { label: 'Certitudine > 80%', min: 0.80, max: 1 },
      ];
      const accuracyByConfidence = confidenceBuckets.map(b => {
        const filtered = result.results.filter(r => {
          const maxP = Math.max(r.predicted.homeWin, r.predicted.draw, r.predicted.awayWin);
          return maxP >= b.min && maxP < b.max;
        });
        const correct = filtered.filter(r => r.correct).length;
        return {
          label: b.label, matches: filtered.length, correct,
          accuracy: filtered.length > 0 ? +(correct / filtered.length * 100).toFixed(1) : 0,
          outOf10: filtered.length > 0 ? +((correct / filtered.length) * 10).toFixed(1) : 0,
        };
      }).filter(b => b.matches > 0);

      const m = result.metrics;
      const baselineAcc = realBuckets.homeWin / m.totalMatches;

      cachedResult = {
        version: 'v3',
        model: m,
        baseline: { accuracy: baselineAcc, brierScore: 0.3947 },
        parameters: { ...ENSEMBLE, ...MODEL },
        improvement: {
          brierPct: +((0.3947 - m.brierScore) / 0.3947 * 100).toFixed(1),
          accuracyPp: +((m.accuracy - baselineAcc) * 100).toFixed(1),
        },
        charts: {
          rollingAccuracy: rollingData,
          predictionVsReality: { predicted: predBuckets, reality: realBuckets },
          calibration,
          sampleResults,
          accuracyByConfidence,
        },
      };
    }

    res.json(cachedResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
