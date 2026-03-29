/**
 * Referee statistics module.
 *
 * Some referees have tendencies that affect match outcomes:
 * - Some give more fouls/cards (benefits defensive teams)
 * - Some allow more physical play (benefits stronger teams)
 * - Home win rate varies by referee
 */

/**
 * Calculate referee statistics from historical matches.
 * @param {Array} matches - All CSV matches
 * @param {string} refereeName - Referee name
 * @returns {Object|null} Referee stats
 */
function calculateRefereeStats(matches, refereeName) {
  if (!refereeName) return null;

  const refMatches = matches.filter(m => m.referee === refereeName);
  if (refMatches.length < 15) return null;

  const n = refMatches.length;
  let homeWins = 0, draws = 0, awayWins = 0;
  let totalGoals = 0, totalCards = 0, totalFouls = 0;

  for (const m of refMatches) {
    if (m.winner === 'HOME_TEAM') homeWins++;
    else if (m.winner === 'DRAW') draws++;
    else awayWins++;

    totalGoals += m.homeGoals + m.awayGoals;

    if (m.stats) {
      totalCards += (m.stats.homeYellow || 0) + (m.stats.awayYellow || 0);
      totalFouls += (m.stats.homeFouls || 0) + (m.stats.awayFouls || 0);
    }
  }

  // League averages for comparison
  const leagueHomeWinRate = 0.46; // ~46% home wins in PL historically
  const leagueDrawRate = 0.24;
  const leagueAvgGoals = 2.7;

  const homeWinRate = homeWins / n;
  const drawRate = draws / n;
  const avgGoals = totalGoals / n;

  return {
    matches: n,
    homeWinRate: +homeWinRate.toFixed(3),
    drawRate: +drawRate.toFixed(3),
    awayWinRate: +(awayWins / n).toFixed(3),
    avgGoals: +avgGoals.toFixed(2),
    avgCards: +(totalCards / n).toFixed(2),
    avgFouls: +(totalFouls / n).toFixed(1),
    // Factors: deviation from league average
    homeWinFactor: homeWinRate / leagueHomeWinRate,
    drawFactor: drawRate / leagueDrawRate,
    goalsFactor: avgGoals / leagueAvgGoals,
  };
}

/**
 * Get adjustment factors for a referee.
 * Returns multipliers for homeWin, draw, awayWin probabilities.
 *
 * @param {Array} matches
 * @param {string} refereeName
 * @param {number} damping - How much influence (0-1, default 0.15)
 * @returns {Object} { homeAdj, drawAdj, awayAdj }
 */
function refereeAdjustment(matches, refereeName, damping = 0.15) {
  const stats = calculateRefereeStats(matches, refereeName);
  if (!stats) return { homeAdj: 1, drawAdj: 1, awayAdj: 1, stats: null };

  // Damped adjustment: 1 + damping * (factor - 1)
  return {
    homeAdj: 1 + damping * (stats.homeWinFactor - 1),
    drawAdj: 1 + damping * (stats.drawFactor - 1),
    awayAdj: 1 + damping * (1 / stats.homeWinFactor - 1), // Inverse of home advantage
    stats,
  };
}

module.exports = {
  calculateRefereeStats,
  refereeAdjustment,
};
