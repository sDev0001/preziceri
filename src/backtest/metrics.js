/**
 * Evaluation metrics for prediction quality.
 */

/**
 * Brier Score - measures calibration of probabilistic predictions.
 * Lower is better. 0 = perfect, 1 = worst possible.
 *
 * For a single prediction with 3 outcomes (home/draw/away):
 * BS = (1/3) * sum((predicted_i - actual_i)^2)
 * where actual_i is 1 for the outcome that happened, 0 for others.
 *
 * @param {Object} predicted - { homeWin, draw, awayWin } probabilities
 * @param {string} actual - 'HOME_TEAM', 'DRAW', or 'AWAY_TEAM'
 * @returns {number} Brier score for this prediction
 */
function brierScore(predicted, actual) {
  const actualVec = {
    homeWin: actual === 'HOME_TEAM' ? 1 : 0,
    draw: actual === 'DRAW' ? 1 : 0,
    awayWin: actual === 'AWAY_TEAM' ? 1 : 0,
  };

  return (1 / 3) * (
    Math.pow(predicted.homeWin - actualVec.homeWin, 2) +
    Math.pow(predicted.draw - actualVec.draw, 2) +
    Math.pow(predicted.awayWin - actualVec.awayWin, 2)
  );
}

/**
 * Check if the prediction was correct (highest probability = actual result).
 * @param {Object} predicted - { homeWin, draw, awayWin }
 * @param {string} actual - 'HOME_TEAM', 'DRAW', or 'AWAY_TEAM'
 * @returns {boolean}
 */
function isCorrectPrediction(predicted, actual) {
  const maxProb = Math.max(predicted.homeWin, predicted.draw, predicted.awayWin);

  if (maxProb === predicted.homeWin && actual === 'HOME_TEAM') return true;
  if (maxProb === predicted.draw && actual === 'DRAW') return true;
  if (maxProb === predicted.awayWin && actual === 'AWAY_TEAM') return true;
  return false;
}

/**
 * Check if the predicted most likely score matches actual score.
 * @param {Array} likelyScores - Array of { home, away, probability }
 * @param {number} actualHome
 * @param {number} actualAway
 * @returns {boolean}
 */
function isCorrectScore(likelyScores, actualHome, actualAway) {
  if (likelyScores.length === 0) return false;
  return likelyScores[0].home === actualHome && likelyScores[0].away === actualAway;
}

/**
 * Aggregate metrics from an array of individual results.
 * @param {Array} results - Array of { brierScore, correct, correctScore, actual }
 * @returns {Object} Aggregated metrics
 */
function aggregateMetrics(results) {
  const n = results.length;
  if (n === 0) return null;

  const avgBrier = results.reduce((s, r) => s + r.brierScore, 0) / n;
  const accuracy = results.filter(r => r.correct).length / n;
  const scoreAccuracy = results.filter(r => r.correctScore).length / n;

  // Breakdown by actual result
  const breakdown = { HOME_TEAM: [], DRAW: [], AWAY_TEAM: [] };
  for (const r of results) {
    breakdown[r.actual].push(r);
  }

  const breakdownStats = {};
  for (const [outcome, items] of Object.entries(breakdown)) {
    if (items.length === 0) continue;
    breakdownStats[outcome] = {
      count: items.length,
      accuracy: items.filter(r => r.correct).length / items.length,
      avgBrier: items.reduce((s, r) => s + r.brierScore, 0) / items.length,
    };
  }

  return {
    totalMatches: n,
    brierScore: avgBrier,
    accuracy,
    scoreAccuracy,
    breakdown: breakdownStats,
  };
}

module.exports = {
  brierScore,
  isCorrectPrediction,
  isCorrectScore,
  aggregateMetrics,
};
