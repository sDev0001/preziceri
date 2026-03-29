/**
 * Shared ensemble loader for Vercel serverless functions.
 * Caches the model in memory across warm invocations.
 */

const path = require('path');

// Adjust paths for Vercel (root is project root)
const dataDir = path.join(process.cwd(), 'data', 'csv');

let ensembleCache = null;
let csvMatchesCache = null;

function getEnsemble() {
  if (ensembleCache) return { ensemble: ensembleCache, csvMatches: csvMatchesCache };

  const { loadAllCSVMatches } = require('../src/data/csvParser');
  const { buildEnsemble } = require('../src/model/ensemble');
  const { MODEL, ENSEMBLE } = require('../src/config');

  const csvMatches = loadAllCSVMatches(ENSEMBLE.CSV_SEASONS);
  csvMatchesCache = csvMatches;

  const predictor = buildEnsemble(csvMatches, {
    xi: MODEL.XI,
    rho: MODEL.RHO,
    eloK: ENSEMBLE.ELO_K,
    eloHomeAdvantage: ENSEMBLE.ELO_HOME_ADVANTAGE,
    weights: ENSEMBLE.WEIGHTS,
    statsDamping: ENSEMBLE.STATS_DAMPING,
    drawBoostStrength: ENSEMBLE.DRAW_BOOST_STRENGTH || 0.5,
    drawThreshold: ENSEMBLE.DRAW_THRESHOLD || 0.05,
    refereeDamping: ENSEMBLE.REFEREE_DAMPING || 0.15,
    formWindow: MODEL.FORM_WINDOW,
  });

  ensembleCache = predictor;
  return { ensemble: predictor, csvMatches };
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

function generateLikelyScores(lambdaH, lambdaA) {
  const { poissonPmf } = require('../src/model/poisson');
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

module.exports = { getEnsemble, findTeam, generateLikelyScores };
