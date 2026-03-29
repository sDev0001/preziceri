const express = require('express');
const path = require('path');
const { loadMultipleSeasons, fetchAndCache } = require('./src/cache/matchCache');
const { loadAllCSVMatches } = require('./src/data/csvParser');
const { buildEnsemble, ensembleBacktest } = require('./src/model/ensemble');
const { calculateRecentForm } = require('./src/stats/recentForm');
const { calculateMomentum } = require('./src/stats/momentum');
const { calculateH2H } = require('./src/stats/headToHead');
const { calculateAdvancedStats } = require('./src/stats/advancedStats');
const { calculateMatchStats } = require('./src/stats/matchStats');
const { runBacktest, baselineMetrics } = require('./src/backtest/backtester');
const { getUpcomingMatches } = require('./src/api/footballData');
const { MODEL, ENSEMBLE, AVAILABLE_SEASONS } = require('./src/config');

const app = express();
const PORT = 3000;

function buildCalibration(results) {
  const bucketSize = 0.1;
  const buckets = {};
  for (const r of results) {
    const probs = [
      { outcome: 'HOME_TEAM', prob: r.predicted.homeWin },
      { outcome: 'DRAW', prob: r.predicted.draw },
      { outcome: 'AWAY_TEAM', prob: r.predicted.awayWin },
    ];
    for (const { outcome, prob } of probs) {
      const bucket = Math.floor(prob / bucketSize) * bucketSize;
      const key = bucket.toFixed(1);
      if (!buckets[key]) buckets[key] = { predicted: 0, actual: 0, count: 0 };
      buckets[key].predicted += prob;
      buckets[key].actual += (r.actual === outcome) ? 1 : 0;
      buckets[key].count++;
    }
  }
  return Object.entries(buckets).sort().filter(([, d]) => d.count >= 5).map(([bucket, data]) => ({
    bucket: +bucket,
    avgPredicted: +(data.predicted / data.count).toFixed(3),
    actualRate: +(data.actual / data.count).toFixed(3),
    count: data.count,
  }));
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let ensembleCache = null;
let csvMatchesCache = null;

async function getEnsemble() {
  if (ensembleCache) return ensembleCache;

  console.log('Building ensemble model from 20 seasons of data...');
  const csvMatches = loadAllCSVMatches(ENSEMBLE.CSV_SEASONS);
  csvMatchesCache = csvMatches;
  console.log(`Loaded ${csvMatches.length} CSV matches`);

  const predictor = buildEnsemble(csvMatches, {
    xi: MODEL.XI,
    rho: MODEL.RHO,
    eloK: ENSEMBLE.ELO_K,
    eloHomeAdvantage: ENSEMBLE.ELO_HOME_ADVANTAGE,
    weights: ENSEMBLE.WEIGHTS,
    statsDamping: ENSEMBLE.STATS_DAMPING,
    formWindow: MODEL.FORM_WINDOW,
  });

  ensembleCache = predictor;
  return predictor;
}

function findTeam(teams, query) {
  const q = query.toLowerCase().trim();
  for (const name of Object.keys(teams)) {
    if (name.toLowerCase() === q) return name;
  }
  for (const name of Object.keys(teams)) {
    if (name.toLowerCase().includes(q) || q.includes(name.toLowerCase())) return name;
  }
  return null;
}

// GET /api/teams
app.get('/api/teams', async (req, res) => {
  try {
    const ensemble = await getEnsemble();
    res.json(Object.keys(ensemble.dcStrengths).sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/predict?home=Arsenal&away=Chelsea
app.get('/api/predict', async (req, res) => {
  try {
    const { home, away } = req.query;
    if (!home || !away) return res.status(400).json({ error: 'home and away required' });

    const ensemble = await getEnsemble();
    const teams = ensemble.dcStrengths;
    const homeKey = findTeam(teams, home);
    const awayKey = findTeam(teams, away);

    if (!homeKey) return res.status(404).json({ error: `Team not found: ${home}`, teams: Object.keys(teams).sort() });
    if (!awayKey) return res.status(404).json({ error: `Team not found: ${away}`, teams: Object.keys(teams).sort() });

    // Get latest odds from CSV data (last match's odds are a proxy)
    // For real upcoming matches we don't have odds, so ensemble falls back to DC+Elo
    const result = ensemble.predict(homeKey, awayKey);

    // Additional analysis from CSV data
    const matches = csvMatchesCache || [];
    const homeForm = calculateRecentForm(matches, homeKey, MODEL.FORM_WINDOW);
    const awayForm = calculateRecentForm(matches, awayKey, MODEL.FORM_WINDOW);
    const homeMomentum = calculateMomentum(matches, homeKey);
    const awayMomentum = calculateMomentum(matches, awayKey);
    const h2h = calculateH2H(matches, homeKey, awayKey);
    const homeStats = calculateMatchStats(matches, homeKey);
    const awayStats = calculateMatchStats(matches, awayKey);

    res.json({
      homeTeam: homeKey,
      awayTeam: awayKey,
      expectedGoals: result.expectedGoals,
      outcomes: {
        homeWin: +(result.outcomes.homeWin * 100).toFixed(1),
        draw: +(result.outcomes.draw * 100).toFixed(1),
        awayWin: +(result.outcomes.awayWin * 100).toFixed(1),
      },
      likelyScores: generateLikelyScores(result.expectedGoals.home, result.expectedGoals.away),
      eloRatings: result.eloRatings,
      models: {
        dixonColes: result.models.dixonColes ? {
          homeWin: +(result.models.dixonColes.homeWin * 100).toFixed(1),
          draw: +(result.models.dixonColes.draw * 100).toFixed(1),
          awayWin: +(result.models.dixonColes.awayWin * 100).toFixed(1),
        } : null,
        elo: {
          homeWin: +(result.models.elo.homeWin * 100).toFixed(1),
          draw: +(result.models.elo.draw * 100).toFixed(1),
          awayWin: +(result.models.elo.awayWin * 100).toFixed(1),
        },
        odds: result.models.odds ? {
          homeWin: +(result.models.odds.homeWin * 100).toFixed(1),
          draw: +(result.models.odds.draw * 100).toFixed(1),
          awayWin: +(result.models.odds.awayWin * 100).toFixed(1),
        } : null,
      },
      analysis: {
        homeForm: homeForm.details,
        awayForm: awayForm.details,
        homeMomentum: homeMomentum.details,
        awayMomentum: awayMomentum.details,
        h2h: h2h.details,
        homeStats,
        awayStats,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple Poisson score generation from expected goals
function generateLikelyScores(lambdaH, lambdaA) {
  const { poissonPmf } = require('./src/model/poisson');
  const scores = [];
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) {
      scores.push({
        score: `${i}-${j}`,
        probability: +(poissonPmf(lambdaH, i) * poissonPmf(lambdaA, j) * 100).toFixed(1),
      });
    }
  }
  scores.sort((a, b) => b.probability - a.probability);
  return scores.slice(0, 5);
}

// GET /api/upcoming
app.get('/api/upcoming', async (req, res) => {
  try {
    const ensemble = await getEnsemble();
    const teams = ensemble.dcStrengths;
    const upcoming = await getUpcomingMatches('PL');

    const predictions = [];
    for (const m of upcoming) {
      const homeName = m.homeTeam.shortName || m.homeTeam.name;
      const awayName = m.awayTeam.shortName || m.awayTeam.name;
      const homeKey = findTeam(teams, homeName);
      const awayKey = findTeam(teams, awayName);

      const entry = {
        matchday: m.matchday,
        date: m.utcDate.slice(0, 10),
        homeTeam: homeName,
        awayTeam: awayName,
        prediction: null,
      };

      if (homeKey && awayKey) {
        const result = ensemble.predict(homeKey, awayKey);
        entry.homeTeam = homeKey;
        entry.awayTeam = awayKey;
        entry.prediction = {
          homeWin: +(result.outcomes.homeWin * 100).toFixed(1),
          draw: +(result.outcomes.draw * 100).toFixed(1),
          awayWin: +(result.outcomes.awayWin * 100).toFixed(1),
          topScore: generateLikelyScores(result.expectedGoals.home, result.expectedGoals.away)[0]?.score || '1-1',
          expectedGoals: result.expectedGoals,
          eloRatings: result.eloRatings,
        };
      }

      predictions.push(entry);
    }

    res.json(predictions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backtest?version=v3|v2
app.get('/api/backtest', async (req, res) => {
  try {
    const version = req.query.version || 'v3';

    if (version === 'v3') {
      const csvMatches = csvMatchesCache || loadAllCSVMatches(ENSEMBLE.CSV_SEASONS);
      const testStart = csvMatches.findIndex(m => m.season >= 2020);

      const result = ensembleBacktest(csvMatches, {
        xi: MODEL.XI, rho: MODEL.RHO,
        eloK: ENSEMBLE.ELO_K, eloHomeAdvantage: ENSEMBLE.ELO_HOME_ADVANTAGE,
        weights: ENSEMBLE.WEIGHTS, statsDamping: ENSEMBLE.STATS_DAMPING,
      }, testStart, false);

      // Chart data
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

      const m = result.metrics;
      const baselineAcc = realBuckets.homeWin / m.totalMatches;

      // Accuracy by confidence buckets
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
          label: b.label,
          matches: filtered.length,
          correct,
          accuracy: filtered.length > 0 ? +(correct / filtered.length * 100).toFixed(1) : 0,
          outOf10: filtered.length > 0 ? +((correct / filtered.length) * 10).toFixed(1) : 0,
        };
      }).filter(b => b.matches > 0);

      res.json({
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
          calibration: buildCalibration(result.results),
          sampleResults,
          accuracyByConfidence,
        },
      });
    } else {
      // v2 fallback
      const matches = (await (async () => { return loadAllCSVMatches([2023, 2024]); })());
      const result = runBacktest(matches, {
        minTrainMatches: 380, xi: MODEL.XI, rho: MODEL.RHO, enhanced: true,
        damping: MODEL.DAMPING, formWindow: MODEL.FORM_WINDOW, verbose: false,
      });
      const testMatches = matches.slice(380);
      const baseline = baselineMetrics(testMatches);
      res.json({ version: 'v2', model: result.metrics, baseline, parameters: result.parameters,
        improvement: {
          brierPct: +((baseline.brierScore - result.metrics.brierScore) / baseline.brierScore * 100).toFixed(1),
          accuracyPp: +((result.metrics.accuracy - baseline.accuracy) * 100).toFixed(1),
        },
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/refresh
app.post('/api/refresh', async (req, res) => {
  try {
    for (const season of AVAILABLE_SEASONS) {
      await fetchAndCache('PL', season, true);
    }
    ensembleCache = null;
    csvMatchesCache = null;
    res.json({ success: true, message: 'Data refreshed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Football Predictor v3 Ensemble running at http://localhost:${PORT}`);
});
