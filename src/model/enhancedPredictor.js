/**
 * Enhanced Predictor v2.
 *
 * Combines Dixon-Coles base model with additional factors:
 * - Recent form
 * - Momentum/trend
 * - Head-to-head history
 * - Advanced statistics
 *
 * Each factor adjusts the expected goals (lambda) with configurable damping.
 */

const { calculateTeamStrengths } = require('../stats/teamStats');
const { calculateRecentForm } = require('../stats/recentForm');
const { calculateMomentum } = require('../stats/momentum');
const { calculateH2H } = require('../stats/headToHead');
const { calculateAdvancedStats } = require('../stats/advancedStats');
const { predictMatch } = require('./dixonColes');

// Default damping coefficients (will be optimized via grid search)
const DEFAULT_DAMPING = {
  form: 0.15,      // How much recent form influences (0 = off, 1 = full effect)
  momentum: 0.10,  // How much trend influences
  h2h: 0.05,       // How much head-to-head influences (low - small sample)
  stats: 0.08,     // How much advanced stats influence
};

const DEFAULT_PARAMS = {
  xi: 0.001,
  rho: -0.13,
  formWindow: 6,
  damping: DEFAULT_DAMPING,
};

/**
 * Calculate all factors for a match prediction.
 *
 * @param {Array} matches - All historical matches up to (but not including) the match to predict
 * @param {string} homeTeamName - shortName
 * @param {string} awayTeamName - shortName
 * @param {Object} teamStrengths - Pre-calculated team strengths
 * @param {Object} params - Model parameters
 * @returns {Object} factors for home and away teams, plus details
 */
function calculateFactors(matches, homeTeamName, awayTeamName, teamStrengths, params = DEFAULT_PARAMS) {
  const { formWindow = 6 } = params;

  // Recent form
  const homeForm = calculateRecentForm(matches, homeTeamName, formWindow);
  const awayForm = calculateRecentForm(matches, awayTeamName, formWindow);

  // Momentum
  const homeMomentum = calculateMomentum(matches, homeTeamName);
  const awayMomentum = calculateMomentum(matches, awayTeamName);

  // Head-to-head
  const h2h = calculateH2H(matches, homeTeamName, awayTeamName);

  // Advanced stats
  const homeAdvanced = calculateAdvancedStats(matches, homeTeamName, teamStrengths);
  const awayAdvanced = calculateAdvancedStats(matches, awayTeamName, teamStrengths);

  return {
    home: {
      formAttack: homeForm.formFactorAttack,
      formDefense: homeForm.formFactorDefense,
      momentumAttack: homeMomentum.momentumAttack,
      momentumDefense: homeMomentum.momentumDefense,
      h2h: h2h.h2hFactorHome,
      statsAttack: homeAdvanced.statsBoostAttack,
      statsDefense: homeAdvanced.statsBoostDefense,
    },
    away: {
      formAttack: awayForm.formFactorAttack,
      formDefense: awayForm.formFactorDefense,
      momentumAttack: awayMomentum.momentumAttack,
      momentumDefense: awayMomentum.momentumDefense,
      h2h: h2h.h2hFactorAway,
      statsAttack: awayAdvanced.statsBoostAttack,
      statsDefense: awayAdvanced.statsBoostDefense,
    },
    details: {
      homeForm: homeForm.details,
      awayForm: awayForm.details,
      homeMomentum: homeMomentum.details,
      awayMomentum: awayMomentum.details,
      h2h: h2h.details,
      homeAdvanced: homeAdvanced.details,
      awayAdvanced: awayAdvanced.details,
    },
  };
}

/**
 * Full enhanced prediction for a match.
 *
 * @param {Array} matches - Historical matches (sorted by date)
 * @param {string} homeTeamName
 * @param {string} awayTeamName
 * @param {Object} params - { xi, rho, formWindow, damping }
 * @returns {Object} Prediction result with factors
 */
function enhancedPredictMatch(matches, homeTeamName, awayTeamName, params = DEFAULT_PARAMS) {
  const { xi = 0.001, rho = -0.13, damping = DEFAULT_DAMPING } = params;

  // Calculate base strengths
  const referenceDate = matches.length > 0 ? matches[matches.length - 1].date : new Date().toISOString();
  const { teams, league } = calculateTeamStrengths(matches, referenceDate, xi);

  const homeStrength = teams[homeTeamName];
  const awayStrength = teams[awayTeamName];

  if (!homeStrength || !awayStrength) {
    return null;
  }

  // Calculate all adjustment factors
  const factors = calculateFactors(matches, homeTeamName, awayTeamName, teams, params);

  // Run prediction with factors
  const prediction = predictMatch(homeStrength, awayStrength, league, rho, factors, damping);

  return {
    ...prediction,
    factors,
    params: { xi, rho, formWindow: params.formWindow, damping },
  };
}

module.exports = {
  calculateFactors,
  enhancedPredictMatch,
  DEFAULT_DAMPING,
  DEFAULT_PARAMS,
};
