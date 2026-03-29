/**
 * Calculate team attack/defense strengths from historical match data.
 * Uses time-weighted statistics with exponential decay.
 */

/**
 * Calculate exponential decay weight based on days since match.
 * Recent matches matter more.
 * @param {string} matchDate - ISO date string
 * @param {string} referenceDate - Date to measure from (usually "today" or match day)
 * @param {number} xi - Decay rate (default 0.0065 from Dixon-Coles paper)
 * @returns {number} Weight between 0 and 1
 */
function decayWeight(matchDate, referenceDate, xi = 0.0065) {
  const daysDiff = (new Date(referenceDate) - new Date(matchDate)) / (1000 * 60 * 60 * 24);
  return Math.exp(-xi * daysDiff);
}

/**
 * Calculate league-wide averages from a set of matches.
 * @param {Array} matches
 * @param {string} referenceDate
 * @param {number} xi - Decay rate
 * @returns {Object} { avgHomeGoals, avgAwayGoals, avgTotalGoals }
 */
function leagueAverages(matches, referenceDate, xi = 0.0065) {
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  let totalWeight = 0;

  for (const m of matches) {
    const w = decayWeight(m.date, referenceDate, xi);
    totalHomeGoals += m.homeGoals * w;
    totalAwayGoals += m.awayGoals * w;
    totalWeight += w;
  }

  return {
    avgHomeGoals: totalHomeGoals / totalWeight,
    avgAwayGoals: totalAwayGoals / totalWeight,
    avgTotalGoals: (totalHomeGoals + totalAwayGoals) / totalWeight,
  };
}

/**
 * Calculate attack and defense strength for all teams.
 *
 * Attack strength (home) = team's weighted avg home goals / league avg home goals
 * Defense strength (home) = team's weighted avg home goals conceded / league avg away goals
 * (And mirror for away)
 *
 * @param {Array} matches - All historical matches
 * @param {string} referenceDate - Date to weight from
 * @param {number} xi - Decay rate
 * @returns {Object} { teams: { [teamName]: { attackHome, defenseHome, attackAway, defenseAway } }, league: averages }
 */
function calculateTeamStrengths(matches, referenceDate, xi = 0.0065) {
  const league = leagueAverages(matches, referenceDate, xi);

  // Accumulate per-team weighted stats
  const teams = {};

  function ensureTeam(name) {
    if (!teams[name]) {
      teams[name] = {
        homeGoalsFor: 0, homeGoalsAgainst: 0, homeWeight: 0,
        awayGoalsFor: 0, awayGoalsAgainst: 0, awayWeight: 0,
      };
    }
  }

  for (const m of matches) {
    const w = decayWeight(m.date, referenceDate, xi);
    const home = m.homeTeam.shortName;
    const away = m.awayTeam.shortName;

    ensureTeam(home);
    ensureTeam(away);

    // Home team stats
    teams[home].homeGoalsFor += m.homeGoals * w;
    teams[home].homeGoalsAgainst += m.awayGoals * w;
    teams[home].homeWeight += w;

    // Away team stats
    teams[away].awayGoalsFor += m.awayGoals * w;
    teams[away].awayGoalsAgainst += m.homeGoals * w;
    teams[away].awayWeight += w;
  }

  // Convert to strengths
  const strengths = {};
  for (const [name, t] of Object.entries(teams)) {
    // Avoid division by zero for teams with very few matches
    const homeGamesW = t.homeWeight || 1;
    const awayGamesW = t.awayWeight || 1;

    const avgHomeGoalsFor = t.homeGoalsFor / homeGamesW;
    const avgHomeGoalsAgainst = t.homeGoalsAgainst / homeGamesW;
    const avgAwayGoalsFor = t.awayGoalsFor / awayGamesW;
    const avgAwayGoalsAgainst = t.awayGoalsAgainst / awayGamesW;

    strengths[name] = {
      attackHome: avgHomeGoalsFor / league.avgHomeGoals,
      defenseHome: avgHomeGoalsAgainst / league.avgAwayGoals,
      attackAway: avgAwayGoalsFor / league.avgAwayGoals,
      defenseAway: avgAwayGoalsAgainst / league.avgHomeGoals,
    };
  }

  return { teams: strengths, league };
}

module.exports = {
  decayWeight,
  leagueAverages,
  calculateTeamStrengths,
};
