/**
 * Momentum/Trend module.
 *
 * Detects whether a team is improving or declining by comparing
 * short-term performance vs long-term performance, and by calculating
 * the slope (trend direction) of goals over recent matches.
 */

const { getLastNMatches } = require('./recentForm');

/**
 * Calculate simple linear regression slope.
 * Used to detect trend direction in goals scored/conceded.
 *
 * @param {number[]} values - Array of values (e.g., goals per match)
 * @returns {number} Slope (positive = increasing, negative = decreasing)
 */
function linearSlope(values) {
  const n = values.length;
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Calculate momentum factors for a team.
 *
 * Compares short-term (last 6) vs long-term (last 15) performance
 * and calculates goal-scoring trend via linear regression.
 *
 * @param {Array} matches - All matches sorted by date
 * @param {string} teamName
 * @param {number} shortWindow - Short-term window (default 6)
 * @param {number} longWindow - Long-term window (default 15)
 * @returns {Object} Momentum factors and details
 */
function calculateMomentum(matches, teamName, shortWindow = 6, longWindow = 15) {
  const shortRecent = getLastNMatches(matches, teamName, shortWindow);
  const longRecent = getLastNMatches(matches, teamName, longWindow);

  if (shortRecent.length < 3 || longRecent.length < 6) {
    return {
      momentumAttack: 1.0,
      momentumDefense: 1.0,
      details: null,
    };
  }

  // Short-term stats
  let shortGF = 0, shortGA = 0, shortPts = 0;
  for (const m of shortRecent) {
    const isHome = m.homeTeam.shortName === teamName;
    shortGF += isHome ? m.homeGoals : m.awayGoals;
    shortGA += isHome ? m.awayGoals : m.homeGoals;
    if ((isHome && m.winner === 'HOME_TEAM') || (!isHome && m.winner === 'AWAY_TEAM')) shortPts += 3;
    else if (m.winner === 'DRAW') shortPts += 1;
  }
  const shortAvgGF = shortGF / shortRecent.length;
  const shortAvgGA = shortGA / shortRecent.length;
  const shortAvgPts = shortPts / shortRecent.length;

  // Long-term stats
  let longGF = 0, longGA = 0, longPts = 0;
  for (const m of longRecent) {
    const isHome = m.homeTeam.shortName === teamName;
    longGF += isHome ? m.homeGoals : m.awayGoals;
    longGA += isHome ? m.awayGoals : m.homeGoals;
    if ((isHome && m.winner === 'HOME_TEAM') || (!isHome && m.winner === 'AWAY_TEAM')) longPts += 3;
    else if (m.winner === 'DRAW') longPts += 1;
  }
  const longAvgGF = longGF / longRecent.length;
  const longAvgGA = longGA / longRecent.length;
  const longAvgPts = longPts / longRecent.length;

  // Trend: short-term vs long-term ratio
  const attackTrend = longAvgGF > 0 ? shortAvgGF / longAvgGF : 1;
  const defenseTrend = longAvgGA > 0 ? longAvgGA / shortAvgGA : 1; // Inverted: fewer goals conceded = better

  // Goal-scoring slope from last 10 matches
  const trendMatches = getLastNMatches(matches, teamName, 10);
  const goalsForSeries = trendMatches.map(m => {
    const isHome = m.homeTeam.shortName === teamName;
    return isHome ? m.homeGoals : m.awayGoals;
  });
  const goalsAgainstSeries = trendMatches.map(m => {
    const isHome = m.homeTeam.shortName === teamName;
    return isHome ? m.awayGoals : m.homeGoals;
  });

  const attackSlope = linearSlope(goalsForSeries);
  const defenseSlope = linearSlope(goalsAgainstSeries);

  // Points trend slope
  const pointsSeries = trendMatches.map(m => {
    const isHome = m.homeTeam.shortName === teamName;
    if ((isHome && m.winner === 'HOME_TEAM') || (!isHome && m.winner === 'AWAY_TEAM')) return 3;
    if (m.winner === 'DRAW') return 1;
    return 0;
  });
  const pointsSlope = linearSlope(pointsSeries);

  // Determine overall direction
  let direction = 'stable';
  if (attackTrend > 1.15 && defenseTrend > 1.05) direction = 'rising';
  else if (attackTrend > 1.1 || pointsSlope > 0.15) direction = 'improving';
  else if (attackTrend < 0.85 && defenseTrend < 0.95) direction = 'falling';
  else if (attackTrend < 0.9 || pointsSlope < -0.15) direction = 'declining';

  return {
    momentumAttack: attackTrend,
    momentumDefense: defenseTrend,
    details: {
      shortAvgGF, shortAvgGA, shortAvgPts,
      longAvgGF, longAvgGA, longAvgPts,
      attackSlope,
      defenseSlope,
      pointsSlope,
      direction,
    },
  };
}

module.exports = {
  linearSlope,
  calculateMomentum,
};
