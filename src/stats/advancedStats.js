/**
 * Advanced Statistics module.
 *
 * Derives deeper insights from existing match data without additional API calls.
 * Calculates: clean sheet %, scoring consistency, big game performance,
 * goal difference trend, over/under tendency.
 */

const { getLastNMatches } = require('./recentForm');

/**
 * Calculate advanced statistics for a team.
 *
 * @param {Array} matches - All matches sorted by date
 * @param {string} teamName - shortName
 * @param {Object} allTeamStrengths - Strengths of all teams (to identify top teams)
 * @param {number} window - Number of recent matches to analyze
 * @returns {Object} Advanced stats and boost factor
 */
function calculateAdvancedStats(matches, teamName, allTeamStrengths = null, window = 15) {
  const teamMatches = getLastNMatches(matches, teamName, window);

  if (teamMatches.length < 5) {
    return { statsBoostAttack: 1.0, statsBoostDefense: 1.0, details: null };
  }

  const n = teamMatches.length;
  const goalsFor = [];
  const goalsAgainst = [];
  let cleanSheets = 0;
  let failedToScore = 0;
  let overMatches = 0; // Matches with 2.5+ total goals
  let bigGameWins = 0, bigGameTotal = 0;

  // Identify top 6 teams by attack strength
  const topTeams = new Set();
  if (allTeamStrengths) {
    const sorted = Object.entries(allTeamStrengths)
      .sort((a, b) => (b[1].attackHome + b[1].attackAway) - (a[1].attackHome + a[1].attackAway));
    for (let i = 0; i < Math.min(6, sorted.length); i++) {
      topTeams.add(sorted[i][0]);
    }
  }

  for (const m of teamMatches) {
    const isHome = m.homeTeam.shortName === teamName;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const opponent = isHome ? m.awayTeam.shortName : m.homeTeam.shortName;

    goalsFor.push(gf);
    goalsAgainst.push(ga);

    if (ga === 0) cleanSheets++;
    if (gf === 0) failedToScore++;
    if (gf + ga >= 3) overMatches++; // Over 2.5

    // Big game performance
    if (topTeams.has(opponent)) {
      bigGameTotal++;
      if (gf > ga) bigGameWins++;
    }
  }

  // Clean sheet percentage (defensive solidity indicator)
  const cleanSheetPct = cleanSheets / n;

  // Scoring consistency (lower std dev = more predictable)
  const avgGF = goalsFor.reduce((s, g) => s + g, 0) / n;
  const varianceGF = goalsFor.reduce((s, g) => s + Math.pow(g - avgGF, 2), 0) / n;
  const stdDevGF = Math.sqrt(varianceGF);

  // Defensive consistency
  const avgGA = goalsAgainst.reduce((s, g) => s + g, 0) / n;
  const varianceGA = goalsAgainst.reduce((s, g) => s + Math.pow(g - avgGA, 2), 0) / n;
  const stdDevGA = Math.sqrt(varianceGA);

  // Failed to score rate
  const failedToScorePct = failedToScore / n;

  // Over/Under tendency
  const overPct = overMatches / n;

  // Goal difference trend (last N matches)
  const goalDiffs = goalsFor.map((gf, i) => gf - goalsAgainst[i]);
  const recentGD = goalDiffs.slice(-5).reduce((s, g) => s + g, 0) / Math.min(5, goalDiffs.length);

  // Big game performance factor
  const bigGameRate = bigGameTotal > 0 ? bigGameWins / bigGameTotal : 0.5;

  // === Calculate boost factors ===

  // Attack boost: based on scoring reliability and big game ability
  // High clean sheet fail rate (failedToScore > 30%) = penalty
  // Good big game rate (> 50%) = boost
  let attackBoost = 1.0;
  if (failedToScorePct > 0.35) attackBoost -= 0.03; // Often fails to score
  if (failedToScorePct < 0.1) attackBoost += 0.02;  // Rarely fails to score
  if (bigGameRate > 0.5 && bigGameTotal >= 3) attackBoost += 0.02; // Good in big games
  if (bigGameRate < 0.2 && bigGameTotal >= 3) attackBoost -= 0.02; // Poor in big games

  // Defense boost: based on clean sheets and consistency
  let defenseBoost = 1.0;
  if (cleanSheetPct > 0.35) defenseBoost += 0.03; // Often keeps clean sheets
  if (cleanSheetPct < 0.1) defenseBoost -= 0.03;  // Rarely keeps clean sheets
  if (stdDevGA < 0.8) defenseBoost += 0.01;       // Consistent defense
  if (stdDevGA > 1.5) defenseBoost -= 0.01;       // Erratic defense

  // Recent goal difference as tiebreaker
  if (recentGD > 1.0) { attackBoost += 0.01; defenseBoost += 0.01; }
  if (recentGD < -1.0) { attackBoost -= 0.01; defenseBoost -= 0.01; }

  return {
    statsBoostAttack: attackBoost,
    statsBoostDefense: defenseBoost,
    details: {
      cleanSheetPct: +(cleanSheetPct * 100).toFixed(1),
      failedToScorePct: +(failedToScorePct * 100).toFixed(1),
      scoringConsistency: +stdDevGF.toFixed(2),
      defensiveConsistency: +stdDevGA.toFixed(2),
      overPct: +(overPct * 100).toFixed(1),
      avgGoalDiff: +recentGD.toFixed(2),
      bigGameRecord: bigGameTotal > 0
        ? { wins: bigGameWins, total: bigGameTotal, rate: +(bigGameRate * 100).toFixed(1) }
        : null,
    },
  };
}

module.exports = {
  calculateAdvancedStats,
};
