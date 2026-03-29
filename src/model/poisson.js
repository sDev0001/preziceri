/**
 * Poisson distribution model for predicting football match scores.
 *
 * Given expected goals (lambda) for each team, calculates the probability
 * of every possible scoreline and derives win/draw/loss probabilities.
 */

const MAX_GOALS = 7; // Consider scores from 0-0 up to 7-7

/**
 * Calculate Poisson probability: P(X = k) = (lambda^k * e^-lambda) / k!
 * @param {number} lambda - Expected number of events (goals)
 * @param {number} k - Actual number of events
 * @returns {number} Probability
 */
function poissonPmf(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // Use log-space to avoid overflow with large factorials
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) {
    logP -= Math.log(i);
  }
  return Math.exp(logP);
}

/**
 * Calculate expected goals for each team in a match.
 * @param {Object} homeStrength - { attackHome, defenseHome }
 * @param {Object} awayStrength - { attackAway, defenseAway }
 * @param {Object} leagueAvg - { avgHomeGoals, avgAwayGoals }
 * @param {Object} [factors] - Additional adjustment factors from v2 modules
 * @param {Object} [factors.home] - { form, momentum, h2h, stats } multipliers for home team
 * @param {Object} [factors.away] - { form, momentum, h2h, stats } multipliers for away team
 * @param {Object} [damping] - How much each factor influences the result
 * @returns {Object} { lambdaHome, lambdaAway }
 */
function expectedGoals(homeStrength, awayStrength, leagueAvg, factors = null, damping = null) {
  // Base expected goals from Dixon-Coles strengths
  let lambdaHome = homeStrength.attackHome * awayStrength.defenseAway * leagueAvg.avgHomeGoals;
  let lambdaAway = awayStrength.attackAway * homeStrength.defenseHome * leagueAvg.avgAwayGoals;

  // Apply v2 adjustment factors if provided
  if (factors && damping) {
    const hf = factors.home || {};
    const af = factors.away || {};
    const d = damping;

    // Each factor is a raw ratio around 1.0
    // Damping controls how much influence it has: adjustedFactor = 1 + damping * (rawFactor - 1)
    const applyDamped = (raw, damp) => 1 + damp * ((raw || 1) - 1);

    // Home team attack adjustments
    const homeAttackMult =
      applyDamped(hf.formAttack, d.form) *
      applyDamped(hf.momentumAttack, d.momentum) *
      applyDamped(hf.h2h, d.h2h) *
      applyDamped(hf.statsAttack, d.stats);

    // Home team defense adjustment (applied to away goals)
    const homeDefenseMult =
      applyDamped(hf.formDefense, d.form) *
      applyDamped(hf.momentumDefense, d.momentum) *
      applyDamped(hf.statsDefense, d.stats);

    // Away team attack adjustments
    const awayAttackMult =
      applyDamped(af.formAttack, d.form) *
      applyDamped(af.momentumAttack, d.momentum) *
      applyDamped(af.h2h, d.h2h) *
      applyDamped(af.statsAttack, d.stats);

    // Away team defense adjustment (applied to home goals)
    const awayDefenseMult =
      applyDamped(af.formDefense, d.form) *
      applyDamped(af.momentumDefense, d.momentum) *
      applyDamped(af.statsDefense, d.stats);

    // Apply: better home attack = more home goals
    // Better home defense = fewer away goals (inverted)
    lambdaHome *= homeAttackMult * (1 / awayDefenseMult);
    lambdaAway *= awayAttackMult * (1 / homeDefenseMult);

    // Safety clamp: lambda should stay reasonable (0.2 to 5.0)
    lambdaHome = Math.max(0.2, Math.min(5.0, lambdaHome));
    lambdaAway = Math.max(0.2, Math.min(5.0, lambdaAway));
  }

  return { lambdaHome, lambdaAway };
}

/**
 * Generate score probability matrix.
 * matrix[i][j] = probability of home scoring i and away scoring j
 * @param {number} lambdaHome
 * @param {number} lambdaAway
 * @returns {number[][]} Probability matrix
 */
function scoreMatrix(lambdaHome, lambdaAway) {
  const matrix = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      // Independent Poisson assumption: P(home=i, away=j) = P(home=i) * P(away=j)
      matrix[i][j] = poissonPmf(lambdaHome, i) * poissonPmf(lambdaAway, j);
    }
  }
  return matrix;
}

/**
 * From a score matrix, calculate win/draw/loss probabilities.
 * @param {number[][]} matrix
 * @returns {Object} { homeWin, draw, awayWin }
 */
function outcomeProbabilities(matrix) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > j) homeWin += matrix[i][j];
      else if (i === j) draw += matrix[i][j];
      else awayWin += matrix[i][j];
    }
  }

  // Normalize to ensure they sum to 1 (they may not due to MAX_GOALS cutoff)
  const total = homeWin + draw + awayWin;
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  };
}

/**
 * Get the most likely scorelines from a score matrix.
 * @param {number[][]} matrix
 * @param {number} topN - Number of scores to return
 * @returns {Array<{home: number, away: number, probability: number}>}
 */
function topScores(matrix, topN = 5) {
  const scores = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      scores.push({ home: i, away: j, probability: matrix[i][j] });
    }
  }
  scores.sort((a, b) => b.probability - a.probability);
  return scores.slice(0, topN);
}

/**
 * Full match prediction using basic Poisson model.
 * @param {Object} homeStrength - Team strength object
 * @param {Object} awayStrength - Team strength object
 * @param {Object} leagueAvg - League average goals
 * @returns {Object} Full prediction result
 */
function predictMatch(homeStrength, awayStrength, leagueAvg) {
  const { lambdaHome, lambdaAway } = expectedGoals(homeStrength, awayStrength, leagueAvg);
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const outcomes = outcomeProbabilities(matrix);
  const likelyScores = topScores(matrix, 5);

  return {
    expectedGoals: { home: lambdaHome, away: lambdaAway },
    outcomes,
    likelyScores,
    matrix,
  };
}

module.exports = {
  poissonPmf,
  expectedGoals,
  scoreMatrix,
  outcomeProbabilities,
  topScores,
  predictMatch,
  MAX_GOALS,
};
