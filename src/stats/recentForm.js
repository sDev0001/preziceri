/**
 * Recent Form module.
 *
 * Calculates how well a team has been performing in their last N matches.
 * Returns a form factor (multiplier around 1.0) that adjusts expected goals.
 */

/**
 * Get the last N matches for a team from a sorted match list.
 * @param {Array} matches - All matches sorted by date (ascending)
 * @param {string} teamName - Team shortName
 * @param {number} n - Number of recent matches
 * @param {string} venue - 'home', 'away', or 'all'
 * @returns {Array} Last N matches involving this team
 */
function getLastNMatches(matches, teamName, n = 6, venue = 'all') {
  const teamMatches = matches.filter(m => {
    const isHome = m.homeTeam.shortName === teamName;
    const isAway = m.awayTeam.shortName === teamName;
    if (!isHome && !isAway) return false;
    if (venue === 'home') return isHome;
    if (venue === 'away') return isAway;
    return true;
  });

  return teamMatches.slice(-n);
}

/**
 * Calculate recent form stats for a team.
 * @param {Array} matches - All matches sorted by date
 * @param {string} teamName
 * @param {number} formWindow - Number of recent matches to consider
 * @returns {Object} Form statistics
 */
function calculateRecentForm(matches, teamName, formWindow = 6) {
  const recent = getLastNMatches(matches, teamName, formWindow);
  const recentHome = getLastNMatches(matches, teamName, 3, 'home');
  const recentAway = getLastNMatches(matches, teamName, 3, 'away');

  if (recent.length < 3) {
    return { formFactor: 1.0, formFactorAttack: 1.0, formFactorDefense: 1.0, details: null };
  }

  // Calculate stats from recent matches
  let goalsFor = 0, goalsAgainst = 0, points = 0, wins = 0, draws = 0, losses = 0;
  let cleanSheets = 0, failedToScore = 0;

  for (const m of recent) {
    const isHome = m.homeTeam.shortName === teamName;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const winner = m.winner;

    goalsFor += gf;
    goalsAgainst += ga;

    if (ga === 0) cleanSheets++;
    if (gf === 0) failedToScore++;

    if ((isHome && winner === 'HOME_TEAM') || (!isHome && winner === 'AWAY_TEAM')) {
      points += 3; wins++;
    } else if (winner === 'DRAW') {
      points += 1; draws++;
    } else {
      losses++;
    }
  }

  const n = recent.length;
  const avgGoalsFor = goalsFor / n;
  const avgGoalsAgainst = goalsAgainst / n;
  const avgPoints = points / n;

  // Calculate the same for ALL matches this team has played (season average)
  const allTeamMatches = matches.filter(m =>
    m.homeTeam.shortName === teamName || m.awayTeam.shortName === teamName
  );

  let seasonGoalsFor = 0, seasonGoalsAgainst = 0, seasonPoints = 0;
  for (const m of allTeamMatches) {
    const isHome = m.homeTeam.shortName === teamName;
    seasonGoalsFor += isHome ? m.homeGoals : m.awayGoals;
    seasonGoalsAgainst += isHome ? m.awayGoals : m.homeGoals;

    if ((isHome && m.winner === 'HOME_TEAM') || (!isHome && m.winner === 'AWAY_TEAM')) {
      seasonPoints += 3;
    } else if (m.winner === 'DRAW') {
      seasonPoints += 1;
    }
  }

  const seasonN = allTeamMatches.length;
  const seasonAvgGF = seasonGoalsFor / seasonN;
  const seasonAvgGA = seasonGoalsAgainst / seasonN;
  const seasonAvgPts = seasonPoints / seasonN;

  // Form factor: ratio of recent performance vs season average
  // Attack form: if scoring more recently than average, boost > 1
  const attackRatio = seasonAvgGF > 0 ? avgGoalsFor / seasonAvgGF : 1;
  // Defense form: if conceding less recently, boost > 1 (inverted)
  const defenseRatio = seasonAvgGA > 0 ? seasonAvgGA / avgGoalsAgainst : 1;

  // Winning streak / losing streak detection
  let currentStreak = 0;
  let streakType = 'none';
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const isHome = m.homeTeam.shortName === teamName;
    const won = (isHome && m.winner === 'HOME_TEAM') || (!isHome && m.winner === 'AWAY_TEAM');
    const lost = (isHome && m.winner === 'AWAY_TEAM') || (!isHome && m.winner === 'HOME_TEAM');

    if (i === recent.length - 1) {
      streakType = won ? 'win' : lost ? 'loss' : 'draw';
      currentStreak = 1;
    } else {
      const currentResult = won ? 'win' : lost ? 'loss' : 'draw';
      if (currentResult === streakType) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    formFactorAttack: attackRatio,
    formFactorDefense: defenseRatio,
    details: {
      recentMatches: n,
      avgGoalsFor,
      avgGoalsAgainst,
      avgPoints,
      wins, draws, losses,
      cleanSheets,
      failedToScore,
      seasonAvgGF,
      seasonAvgGA,
      seasonAvgPts,
      streak: { type: streakType, count: currentStreak },
    },
  };
}

module.exports = {
  getLastNMatches,
  calculateRecentForm,
};
