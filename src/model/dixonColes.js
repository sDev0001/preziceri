/**
 * Dixon-Coles model (1997) - improved Poisson for football.
 *
 * The basic Poisson model assumes home and away goals are independent.
 * In reality, low-scoring results (0-0, 1-0, 0-1, 1-1) occur more/less
 * often than independent Poisson predicts.
 *
 * Dixon-Coles adds a correction factor rho (ρ) that adjusts probabilities
 * for these specific scorelines.
 */

const {
  poissonPmf,
  expectedGoals,
  outcomeProbabilities,
  topScores,
  MAX_GOALS,
} = require('./poisson');

/**
 * Dixon-Coles tau (τ) correction factor for low-scoring results.
 *
 * From the original paper, the correction multiplier for P(home=x, away=y) is:
 * - (0,0): 1 - lambdaH * lambdaA * rho
 * - (1,0): 1 + lambdaA * rho
 * - (0,1): 1 + lambdaH * rho
 * - (1,1): 1 - rho
 * - All other scores: 1 (no correction)
 *
 * rho is typically negative (around -0.13), which:
 * - Increases P(0-0) slightly
 * - Decreases P(1-1) slightly
 * - Adjusts P(1-0) and P(0-1) accordingly
 *
 * @param {number} homeGoals
 * @param {number} awayGoals
 * @param {number} lambdaHome - Expected home goals
 * @param {number} lambdaAway - Expected away goals
 * @param {number} rho - Correction parameter (typically -0.13)
 * @returns {number} Multiplicative correction factor
 */
function tauCorrection(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - lambdaHome * lambdaAway * rho;
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return 1 + lambdaAway * rho;
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return 1 + lambdaHome * rho;
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho;
  }
  return 1; // No correction for other scorelines
}

/**
 * Generate Dixon-Coles corrected score probability matrix.
 * @param {number} lambdaHome
 * @param {number} lambdaAway
 * @param {number} rho - Dixon-Coles correction parameter
 * @returns {number[][]} Corrected probability matrix
 */
function dixonColesMatrix(lambdaHome, lambdaAway, rho = -0.13) {
  const matrix = [];
  let total = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const poissonProb = poissonPmf(lambdaHome, i) * poissonPmf(lambdaAway, j);
      const tau = tauCorrection(i, j, lambdaHome, lambdaAway, rho);
      matrix[i][j] = poissonProb * tau;
      total += matrix[i][j];
    }
  }

  // Renormalize so probabilities sum to 1
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      matrix[i][j] /= total;
    }
  }

  return matrix;
}

/**
 * Full match prediction using Dixon-Coles model.
 * @param {Object} homeStrength - Team strength object
 * @param {Object} awayStrength - Team strength object
 * @param {Object} leagueAvg - League average goals
 * @param {number} rho - Dixon-Coles correction parameter
 * @param {Object} [factors] - V2 adjustment factors { home: {...}, away: {...} }
 * @param {Object} [damping] - Damping coefficients { form, momentum, h2h, stats }
 * @returns {Object} Full prediction result
 */
function predictMatch(homeStrength, awayStrength, leagueAvg, rho = -0.13, factors = null, damping = null) {
  const { lambdaHome, lambdaAway } = expectedGoals(homeStrength, awayStrength, leagueAvg, factors, damping);
  const matrix = dixonColesMatrix(lambdaHome, lambdaAway, rho);
  const outcomes = outcomeProbabilities(matrix);
  const likelyScores = topScores(matrix, 5);

  return {
    expectedGoals: { home: lambdaHome, away: lambdaAway },
    outcomes,
    likelyScores,
    matrix,
  };
}

/**
 * Calculate the log-likelihood of observed matches given model parameters.
 * Used for optimizing rho and other parameters.
 * @param {Array} matches - Historical matches
 * @param {Object} teamStrengths - Calculated team strengths
 * @param {Object} leagueAvg - League averages
 * @param {number} rho - Dixon-Coles rho
 * @param {number} xi - Decay rate (for weighting)
 * @param {string} referenceDate - Reference date for decay
 * @returns {number} Log-likelihood (higher = better fit)
 */
function logLikelihood(matches, teamStrengths, leagueAvg, rho, xi, referenceDate) {
  let ll = 0;

  for (const m of matches) {
    const home = teamStrengths[m.homeTeam.shortName];
    const away = teamStrengths[m.awayTeam.shortName];
    if (!home || !away) continue;

    const { lambdaHome, lambdaAway } = expectedGoals(home, away, leagueAvg);

    const poissonProb = poissonPmf(lambdaHome, m.homeGoals) * poissonPmf(lambdaAway, m.awayGoals);
    const tau = tauCorrection(m.homeGoals, m.awayGoals, lambdaHome, lambdaAway, rho);
    const prob = poissonProb * tau;

    // Time weight
    const daysDiff = (new Date(referenceDate) - new Date(m.date)) / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-xi * daysDiff);

    if (prob > 0) {
      ll += weight * Math.log(prob);
    }
  }

  return ll;
}

module.exports = {
  tauCorrection,
  dixonColesMatrix,
  predictMatch,
  logLikelihood,
};
