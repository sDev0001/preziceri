/**
 * Elo Rating system adapted for football.
 *
 * Each team has a rating (starting at 1500). After each match, ratings
 * are updated based on the result vs expectation. Over time, better teams
 * have higher ratings.
 *
 * Adapted with:
 * - Home advantage bonus (+65 points)
 * - Goal difference multiplier (bigger wins = bigger updates)
 * - Newly promoted teams start at lower rating (1300)
 */

const DEFAULT_RATING = 1500;
const NEW_TEAM_RATING = 1300;

/**
 * Calculate expected score (probability of winning) from Elo ratings.
 * @param {number} ratingA - Team A rating
 * @param {number} ratingB - Team B rating
 * @returns {number} Expected score for A (0 to 1)
 */
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Goal difference multiplier.
 * Larger goal difference = larger rating update.
 */
function goalDiffMultiplier(goalDiff) {
  const absDiff = Math.abs(goalDiff);
  if (absDiff <= 1) return 1;
  if (absDiff === 2) return 1.5;
  return (11 + absDiff) / 8; // 3 goals: 1.75, 4 goals: 1.875, etc.
}

/**
 * Convert Elo ratings to 1X2 probabilities for a match.
 * Uses home advantage adjusted ratings.
 *
 * @param {number} homeRating
 * @param {number} awayRating
 * @param {number} homeAdvantage - Elo points added to home team (default 65)
 * @returns {Object} { homeWin, draw, awayWin }
 */
function eloProbabilities(homeRating, awayRating, homeAdvantage = 65) {
  const adjustedHome = homeRating + homeAdvantage;

  // Expected score (probability of winning in chess Elo)
  const homeExpected = expectedScore(adjustedHome, awayRating);
  const awayExpected = 1 - homeExpected;

  // Convert to 1X2 probabilities
  // Draw probability is derived from the closeness of ratings
  // When teams are equal, draw probability is higher
  const ratingDiff = Math.abs(adjustedHome - awayRating);
  const drawBase = 0.28; // Base draw probability
  const drawDecay = 0.0015; // How quickly draw probability decreases with rating diff
  const drawProb = Math.max(0.10, drawBase * Math.exp(-drawDecay * ratingDiff));

  // Distribute remaining probability
  const remaining = 1 - drawProb;
  const homeWin = remaining * homeExpected;
  const awayWin = remaining * awayExpected;

  return { homeWin, draw: drawProb, awayWin };
}

/**
 * Full Elo rating system that processes matches and maintains ratings.
 */
class EloSystem {
  constructor(options = {}) {
    this.K = options.K || 20;
    this.homeAdvantage = options.homeAdvantage || 65;
    this.ratings = {};
    this.history = []; // Track rating changes over time
  }

  /**
   * Get rating for a team, creating it if needed.
   */
  getRating(team) {
    if (!this.ratings[team]) {
      this.ratings[team] = NEW_TEAM_RATING;
    }
    return this.ratings[team];
  }

  /**
   * Process a single match and update ratings.
   * @param {Object} match - Match object with homeTeam, awayTeam, homeGoals, awayGoals
   * @returns {Object} Pre-match prediction probabilities
   */
  processMatch(match) {
    const homeName = match.homeTeam.shortName;
    const awayName = match.awayTeam.shortName;

    const homeRating = this.getRating(homeName);
    const awayRating = this.getRating(awayName);

    // Pre-match prediction
    const prediction = eloProbabilities(homeRating, awayRating, this.homeAdvantage);

    // Actual result
    const homeScore = match.homeGoals > match.awayGoals ? 1 : match.homeGoals === match.awayGoals ? 0.5 : 0;
    const awayScore = 1 - homeScore;

    // Expected scores
    const adjustedHome = homeRating + this.homeAdvantage;
    const homeExpected = expectedScore(adjustedHome, awayRating);
    const awayExpected = 1 - homeExpected;

    // Goal difference multiplier
    const goalDiff = match.homeGoals - match.awayGoals;
    const gdMult = goalDiffMultiplier(goalDiff);

    // Update ratings
    const homeChange = this.K * gdMult * (homeScore - homeExpected);
    const awayChange = this.K * gdMult * (awayScore - awayExpected);

    this.ratings[homeName] = homeRating + homeChange;
    this.ratings[awayName] = awayRating + awayChange;

    return prediction;
  }

  /**
   * Process array of matches in chronological order.
   * Returns predictions for each match (made BEFORE updating).
   */
  processMatches(matches) {
    const predictions = [];
    for (const match of matches) {
      const prediction = this.processMatch(match);
      predictions.push({
        match,
        prediction,
        homeRating: this.getRating(match.homeTeam.shortName),
        awayRating: this.getRating(match.awayTeam.shortName),
      });
    }
    return predictions;
  }

  /**
   * Get prediction for a future match without updating ratings.
   */
  predict(homeTeam, awayTeam) {
    const homeRating = this.getRating(homeTeam);
    const awayRating = this.getRating(awayTeam);
    return {
      ...eloProbabilities(homeRating, awayRating, this.homeAdvantage),
      homeRating,
      awayRating,
    };
  }

  /**
   * Get all current ratings sorted by rating.
   */
  getStandings() {
    return Object.entries(this.ratings)
      .map(([team, rating]) => ({ team, rating: Math.round(rating) }))
      .sort((a, b) => b.rating - a.rating);
  }

  /**
   * Create a snapshot of current ratings (for backtesting).
   */
  snapshot() {
    return { ...this.ratings };
  }

  /**
   * Restore ratings from snapshot.
   */
  restore(snapshot) {
    this.ratings = { ...snapshot };
  }
}

module.exports = {
  EloSystem,
  expectedScore,
  eloProbabilities,
  DEFAULT_RATING,
};
