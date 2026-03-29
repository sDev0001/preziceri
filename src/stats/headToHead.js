/**
 * Head-to-Head module.
 *
 * Analyzes the historical record between two specific teams.
 * Some teams consistently perform well/poorly against certain opponents.
 */

/**
 * Get all matches between two teams from historical data.
 * @param {Array} matches - All matches sorted by date
 * @param {string} team1 - shortName of first team
 * @param {string} team2 - shortName of second team
 * @returns {Array} All matches between these two teams
 */
function getH2HMatches(matches, team1, team2) {
  return matches.filter(m =>
    (m.homeTeam.shortName === team1 && m.awayTeam.shortName === team2) ||
    (m.homeTeam.shortName === team2 && m.awayTeam.shortName === team1)
  );
}

/**
 * Calculate head-to-head factors for a match between homeTeam and awayTeam.
 *
 * @param {Array} matches - All historical matches
 * @param {string} homeTeam - shortName of home team
 * @param {string} awayTeam - shortName of away team
 * @param {number} minMatches - Minimum H2H matches required (default 4)
 * @returns {Object} H2H factors and details
 */
function calculateH2H(matches, homeTeam, awayTeam, minMatches = 4) {
  const h2hMatches = getH2HMatches(matches, homeTeam, awayTeam);

  if (h2hMatches.length < minMatches) {
    return {
      h2hFactorHome: 1.0,
      h2hFactorAway: 1.0,
      details: {
        totalMatches: h2hMatches.length,
        insufficient: true,
      },
    };
  }

  let homeWins = 0, awayWins = 0, draws = 0;
  let homeGoalsTotal = 0, awayGoalsTotal = 0;

  // "home" here means the team we're analyzing as home in the upcoming match
  for (const m of h2hMatches) {
    const homeIsHome = m.homeTeam.shortName === homeTeam;

    const homeGoals = homeIsHome ? m.homeGoals : m.awayGoals;
    const awayGoals = homeIsHome ? m.awayGoals : m.homeGoals;

    homeGoalsTotal += homeGoals;
    awayGoalsTotal += awayGoals;

    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals < awayGoals) awayWins++;
    else draws++;
  }

  const n = h2hMatches.length;
  const homeWinRate = homeWins / n;
  const awayWinRate = awayWins / n;
  const drawRate = draws / n;
  const homeAvgGoals = homeGoalsTotal / n;
  const awayAvgGoals = awayGoalsTotal / n;

  // H2H factor: based on dominance
  // If homeTeam wins 70% of H2H matches, they get a boost
  // Neutral = 0.5 win rate (each team wins half)
  // Factor = 1 + deviation_from_neutral * scale
  const homeDeviation = homeWinRate - 0.5; // positive = home dominates
  const awayDeviation = awayWinRate - 0.5;

  // Also consider goal scoring in H2H
  const totalAvgGoals = (homeAvgGoals + awayAvgGoals) / 2;
  const homeGoalRatio = totalAvgGoals > 0 ? homeAvgGoals / totalAvgGoals : 1;
  const awayGoalRatio = totalAvgGoals > 0 ? awayAvgGoals / totalAvgGoals : 1;

  // Combine win rate and goal ratio (70/30 weight)
  // Raw factor centered on 1.0
  const h2hFactorHome = 1 + (homeDeviation * 0.7) + ((homeGoalRatio - 1) * 0.3);
  const h2hFactorAway = 1 + (awayDeviation * 0.7) + ((awayGoalRatio - 1) * 0.3);

  // Recent H2H trend (last 3 encounters weighted more)
  const recentH2H = h2hMatches.slice(-3);
  let recentHomeWins = 0, recentAwayWins = 0;
  for (const m of recentH2H) {
    const homeIsHome = m.homeTeam.shortName === homeTeam;
    const hg = homeIsHome ? m.homeGoals : m.awayGoals;
    const ag = homeIsHome ? m.awayGoals : m.homeGoals;
    if (hg > ag) recentHomeWins++;
    else if (ag > hg) recentAwayWins++;
  }

  return {
    h2hFactorHome,
    h2hFactorAway,
    details: {
      totalMatches: n,
      insufficient: false,
      homeWins, awayWins, draws,
      homeWinRate: +(homeWinRate * 100).toFixed(1),
      awayWinRate: +(awayWinRate * 100).toFixed(1),
      drawRate: +(drawRate * 100).toFixed(1),
      homeAvgGoals: +homeAvgGoals.toFixed(2),
      awayAvgGoals: +awayAvgGoals.toFixed(2),
      recentH2H: {
        matches: recentH2H.length,
        homeWins: recentHomeWins,
        awayWins: recentAwayWins,
        draws: recentH2H.length - recentHomeWins - recentAwayWins,
      },
    },
  };
}

module.exports = {
  getH2HMatches,
  calculateH2H,
};
