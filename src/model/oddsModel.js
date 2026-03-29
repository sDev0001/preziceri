/**
 * Odds-based prediction model.
 *
 * Converts betting odds into probabilities. Betting odds encode the
 * collective wisdom of the market - thousands of analysts and billions
 * of dollars. They are typically the single best predictor available.
 *
 * Key concept: bookmaker odds include a "margin" (overround) that
 * must be removed to get true probabilities.
 */

/**
 * Convert decimal odds to implied probability.
 * @param {number} odds - Decimal odds (e.g. 2.5)
 * @returns {number} Implied probability (0 to 1)
 */
function oddsToProb(odds) {
  if (!odds || odds <= 1) return 0;
  return 1 / odds;
}

/**
 * Remove bookmaker margin (overround) from odds.
 * The sum of implied probabilities > 1 due to bookmaker margin.
 * We normalize to sum to exactly 1.
 *
 * @param {Object} odds - { home, draw, away } decimal odds
 * @returns {Object|null} { homeWin, draw, awayWin } true probabilities
 */
function oddsToFairProbabilities(odds) {
  if (!odds || !odds.home || !odds.draw || !odds.away) return null;

  const pH = oddsToProb(odds.home);
  const pD = oddsToProb(odds.draw);
  const pA = oddsToProb(odds.away);

  const total = pH + pD + pA;
  if (total === 0) return null;

  return {
    homeWin: pH / total,
    draw: pD / total,
    awayWin: pA / total,
  };
}

/**
 * Get the best probability estimate from multiple bookmakers.
 * Averages across available bookmakers for more stable estimates.
 *
 * @param {Object} allOdds - { b365: {...}, bw: {...}, iw: {...}, ps: {...}, ... }
 * @returns {Object|null} { homeWin, draw, awayWin } averaged probabilities
 */
function consensusOdds(allOdds) {
  if (!allOdds) return null;

  // Try average odds first (pre-computed by football-data.co.uk)
  if (allOdds.avg) {
    const avgProb = oddsToFairProbabilities(allOdds.avg);
    if (avgProb) return avgProb;
  }

  // Otherwise average individual bookmaker probabilities
  const bookmakers = ['b365', 'bw', 'iw', 'ps', 'wh', 'vc'];
  const probs = bookmakers
    .map(bk => oddsToFairProbabilities(allOdds[bk]))
    .filter(p => p !== null);

  if (probs.length === 0) return null;

  const n = probs.length;
  return {
    homeWin: probs.reduce((s, p) => s + p.homeWin, 0) / n,
    draw: probs.reduce((s, p) => s + p.draw, 0) / n,
    awayWin: probs.reduce((s, p) => s + p.awayWin, 0) / n,
  };
}

/**
 * Predict match outcome from odds data.
 * @param {Object} matchOdds - Odds object from parsed CSV
 * @returns {Object|null} { homeWin, draw, awayWin }
 */
function predictFromOdds(matchOdds) {
  return consensusOdds(matchOdds);
}

module.exports = {
  oddsToProb,
  oddsToFairProbabilities,
  consensusOdds,
  predictFromOdds,
};
