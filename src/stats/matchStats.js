/**
 * Extended match statistics module.
 *
 * Calculates rolling averages for shots, corners, fouls, cards etc.
 * from CSV data. These feed into the ensemble model as additional features.
 */

/**
 * Get last N matches for a team from CSV data.
 */
function getTeamMatches(matches, teamName, n = 15, venue = 'all') {
  const filtered = matches.filter(m => {
    const isHome = m.homeTeam.shortName === teamName;
    const isAway = m.awayTeam.shortName === teamName;
    if (!isHome && !isAway) return false;
    if (venue === 'home') return isHome;
    if (venue === 'away') return isAway;
    return true;
  });
  return filtered.slice(-n);
}

/**
 * Calculate rolling match statistics for a team.
 * @param {Array} matches - All matches with stats (from CSV data)
 * @param {string} teamName
 * @param {number} window - Rolling window size
 * @returns {Object} Statistics or null if insufficient data
 */
function calculateMatchStats(matches, teamName, window = 15) {
  const teamMatches = getTeamMatches(matches, teamName, window);

  // Only use matches that have stats
  const withStats = teamMatches.filter(m => m.stats && m.stats.homeShots !== null);
  if (withStats.length < 5) return null;

  let shotsFor = 0, shotsAgainst = 0;
  let sotFor = 0, sotAgainst = 0; // shots on target
  let cornersFor = 0, cornersAgainst = 0;
  let foulsFor = 0, foulsAgainst = 0;
  let yellowsFor = 0, redsFor = 0;
  let goalsFor = 0;

  for (const m of withStats) {
    const isHome = m.homeTeam.shortName === teamName;
    const s = m.stats;

    shotsFor += isHome ? (s.homeShots || 0) : (s.awayShots || 0);
    shotsAgainst += isHome ? (s.awayShots || 0) : (s.homeShots || 0);
    sotFor += isHome ? (s.homeShotsOnTarget || 0) : (s.awayShotsOnTarget || 0);
    sotAgainst += isHome ? (s.awayShotsOnTarget || 0) : (s.homeShotsOnTarget || 0);
    cornersFor += isHome ? (s.homeCorners || 0) : (s.awayCorners || 0);
    cornersAgainst += isHome ? (s.awayCorners || 0) : (s.homeCorners || 0);
    foulsFor += isHome ? (s.homeFouls || 0) : (s.awayFouls || 0);
    foulsAgainst += isHome ? (s.awayFouls || 0) : (s.homeFouls || 0);
    yellowsFor += isHome ? (s.homeYellow || 0) : (s.awayYellow || 0);
    redsFor += isHome ? (s.homeRed || 0) : (s.awayRed || 0);
    goalsFor += isHome ? m.homeGoals : m.awayGoals;
  }

  const n = withStats.length;

  // Per-match averages
  const avgShots = shotsFor / n;
  const avgShotsAgainst = shotsAgainst / n;
  const avgSOT = sotFor / n;
  const avgSOTAgainst = sotAgainst / n;
  const avgCorners = cornersFor / n;
  const avgCornersAgainst = cornersAgainst / n;
  const avgFouls = foulsFor / n;
  const avgGoals = goalsFor / n;

  // Derived stats
  const shotConversion = sotFor > 0 ? goalsFor / sotFor : 0; // Goals per shot on target
  const shotAccuracy = shotsFor > 0 ? sotFor / shotsFor : 0; // SOT per total shot
  const dominanceRatio = (shotsFor + cornersFor) / Math.max(1, shotsAgainst + cornersAgainst);

  return {
    avgShots: +avgShots.toFixed(1),
    avgShotsAgainst: +avgShotsAgainst.toFixed(1),
    avgSOT: +avgSOT.toFixed(1),
    avgSOTAgainst: +avgSOTAgainst.toFixed(1),
    avgCorners: +avgCorners.toFixed(1),
    avgCornersAgainst: +avgCornersAgainst.toFixed(1),
    avgFouls: +avgFouls.toFixed(1),
    avgGoals: +avgGoals.toFixed(2),
    shotConversion: +shotConversion.toFixed(3),
    shotAccuracy: +shotAccuracy.toFixed(3),
    dominanceRatio: +dominanceRatio.toFixed(2),
    yellowPerMatch: +(yellowsFor / n).toFixed(2),
    matchesAnalyzed: n,
  };
}

/**
 * Calculate stats-based adjustment factors for expected goals.
 * Compares team's stats to league averages.
 *
 * @param {Array} matches - All matches
 * @param {string} teamName
 * @param {number} window
 * @returns {Object} { attackBoost, defenseBoost }
 */
function statsFactors(matches, teamName, window = 15) {
  const teamStats = calculateMatchStats(matches, teamName, window);
  if (!teamStats) return { attackBoost: 1, defenseBoost: 1, stats: null };

  // Calculate league averages for comparison
  const allTeams = new Set();
  matches.forEach(m => {
    allTeams.add(m.homeTeam.shortName);
    allTeams.add(m.awayTeam.shortName);
  });

  let leagueSOT = 0, leagueShots = 0, leagueCorners = 0;
  let teamCount = 0;
  for (const t of allTeams) {
    const s = calculateMatchStats(matches, t, window);
    if (s) {
      leagueSOT += s.avgSOT;
      leagueShots += s.avgShots;
      leagueCorners += s.avgCorners;
      teamCount++;
    }
  }

  const avgLeagueSOT = teamCount > 0 ? leagueSOT / teamCount : 4;
  const avgLeagueShots = teamCount > 0 ? leagueShots / teamCount : 12;
  const avgLeagueCorners = teamCount > 0 ? leagueCorners / teamCount : 5;

  // Attack boost: based on shots on target and conversion rate
  const sotRatio = avgLeagueSOT > 0 ? teamStats.avgSOT / avgLeagueSOT : 1;
  const conversionBoost = teamStats.shotConversion > 0.33 ? 1.02 : teamStats.shotConversion < 0.2 ? 0.98 : 1;

  // Defense boost: fewer opponent SOT = better defense
  const sotAgainstRatio = avgLeagueSOT > 0 ? avgLeagueSOT / Math.max(1, teamStats.avgSOTAgainst) : 1;

  // Dominance (more shots + corners = more offensive pressure)
  const dominanceBoost = teamStats.dominanceRatio > 1.3 ? 1.02 : teamStats.dominanceRatio < 0.8 ? 0.98 : 1;

  const attackBoost = sotRatio * conversionBoost * dominanceBoost;
  const defenseBoost = sotAgainstRatio;

  return {
    attackBoost: +Math.max(0.85, Math.min(1.15, attackBoost)).toFixed(3),
    defenseBoost: +Math.max(0.85, Math.min(1.15, defenseBoost)).toFixed(3),
    stats: teamStats,
  };
}

module.exports = {
  calculateMatchStats,
  statsFactors,
  getTeamMatches,
};
