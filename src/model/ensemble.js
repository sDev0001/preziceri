/**
 * Ensemble Model v3.
 *
 * Combines predictions from 3 independent models:
 * 1. Dixon-Coles (statistical model based on goals and strengths)
 * 2. Elo Rating (team strength tracker updated every match)
 * 3. Odds-based (market-implied probabilities from betting odds)
 *
 * Plus optional stats-based adjustments from match statistics.
 *
 * The final prediction is a weighted average of all models.
 */

const { calculateTeamStrengths } = require('../stats/teamStats');
const { predictMatch: dixonColesPredict } = require('./dixonColes');
const { adjustForDraws } = require('./drawDetector');
const { refereeAdjustment } = require('../stats/refereeStats');
const { EloSystem } = require('./elo');
const { predictFromOdds } = require('./oddsModel');
const { statsFactors } = require('../stats/matchStats');
const { calculateFactors, DEFAULT_DAMPING } = require('./enhancedPredictor');

const DEFAULT_WEIGHTS = {
  dixonColes: 0.35,
  elo: 0.25,
  odds: 0.40,  // Odds get highest weight - they're the best predictor
};

const DEFAULT_ENSEMBLE_PARAMS = {
  xi: 0.001,
  rho: -0.13,
  eloK: 20,
  eloHomeAdvantage: 65,
  weights: DEFAULT_WEIGHTS,
  statsDamping: 0.10,
  formWindow: 6,
  drawBoostStrength: 0.5,
  drawThreshold: 0.10,
  refereeDamping: 0.15,
};

/**
 * Build a complete ensemble predictor from historical data.
 *
 * @param {Array} csvMatches - All matches from CSV (with stats and odds)
 * @param {Object} params - Ensemble parameters
 * @returns {Object} Predictor object with methods
 */
function buildEnsemble(csvMatches, params = DEFAULT_ENSEMBLE_PARAMS) {
  const {
    xi, rho, eloK, eloHomeAdvantage, weights, statsDamping, formWindow,
    drawBoostStrength, drawThreshold, refereeDamping,
  } = { ...DEFAULT_ENSEMBLE_PARAMS, ...params };

  // Build Elo system by processing all historical matches
  const elo = new EloSystem({ K: eloK, homeAdvantage: eloHomeAdvantage });
  elo.processMatches(csvMatches);

  // Calculate Dixon-Coles strengths from recent matches
  const referenceDate = csvMatches.length > 0
    ? csvMatches[csvMatches.length - 1].date
    : new Date().toISOString();
  const { teams: dcStrengths, league: dcLeague } = calculateTeamStrengths(csvMatches, referenceDate, xi);

  return {
    elo,
    dcStrengths,
    dcLeague,

    /**
     * Predict a match using all available models.
     * @param {string} homeTeam
     * @param {string} awayTeam
     * @param {Object} [matchOdds] - Betting odds for this match (if available)
     * @returns {Object} Combined prediction
     */
    predict(homeTeam, awayTeam, matchOdds = null) {
      const models = {};
      let totalWeight = 0;

      // 1. Dixon-Coles prediction
      const homeStrength = dcStrengths[homeTeam];
      const awayStrength = dcStrengths[awayTeam];
      if (homeStrength && awayStrength) {
        // Enhanced with form/momentum/stats
        const factors = calculateFactors(csvMatches, homeTeam, awayTeam, dcStrengths, { formWindow });
        const dcResult = dixonColesPredict(homeStrength, awayStrength, dcLeague, rho, factors, { form: 0, momentum: 0, h2h: 0, stats: statsDamping });

        models.dixonColes = dcResult.outcomes;
        totalWeight += weights.dixonColes;
      }

      // 2. Elo prediction
      const eloResult = elo.predict(homeTeam, awayTeam);
      models.elo = { homeWin: eloResult.homeWin, draw: eloResult.draw, awayWin: eloResult.awayWin };
      totalWeight += weights.elo;

      // 3. Odds-based prediction (if odds available)
      if (matchOdds) {
        const oddsResult = predictFromOdds(matchOdds);
        if (oddsResult) {
          models.odds = oddsResult;
          totalWeight += weights.odds;
        }
      }

      // Combine with normalized weights
      let homeWin = 0, draw = 0, awayWin = 0;

      if (models.dixonColes) {
        const w = weights.dixonColes / totalWeight;
        homeWin += models.dixonColes.homeWin * w;
        draw += models.dixonColes.draw * w;
        awayWin += models.dixonColes.awayWin * w;
      }

      {
        const w = weights.elo / totalWeight;
        homeWin += models.elo.homeWin * w;
        draw += models.elo.draw * w;
        awayWin += models.elo.awayWin * w;
      }

      if (models.odds) {
        const w = weights.odds / totalWeight;
        homeWin += models.odds.homeWin * w;
        draw += models.odds.draw * w;
        awayWin += models.odds.awayWin * w;
      }

      // Normalize
      const total = homeWin + draw + awayWin;
      homeWin /= total;
      draw /= total;
      awayWin /= total;

      // Apply draw detector
      const drawAdj = adjustForDraws({ homeWin, draw, awayWin }, { drawBoostStrength });
      homeWin = drawAdj.homeWin;
      draw = drawAdj.draw;
      awayWin = drawAdj.awayWin;

      // Stats boost for expected goals (for score prediction)
      let expectedHome = 1.4, expectedAway = 1.2; // Default
      if (homeStrength && awayStrength) {
        const baseLH = homeStrength.attackHome * awayStrength.defenseAway * dcLeague.avgHomeGoals;
        const baseLА = awayStrength.attackAway * homeStrength.defenseHome * dcLeague.avgAwayGoals;

        const homeStats = statsFactors(csvMatches, homeTeam);
        const awayStats = statsFactors(csvMatches, awayTeam);

        expectedHome = baseLH * (homeStats.attackBoost || 1);
        expectedAway = baseLА * (awayStats.attackBoost || 1);
      }

      return {
        outcomes: { homeWin, draw, awayWin },
        models,
        expectedGoals: {
          home: +expectedHome.toFixed(2),
          away: +expectedAway.toFixed(2),
        },
        eloRatings: {
          home: Math.round(elo.getRating(homeTeam)),
          away: Math.round(elo.getRating(awayTeam)),
        },
        hasOdds: !!models.odds,
      };
    },
  };
}

/**
 * Run ensemble backtesting on CSV data.
 *
 * Uses rolling window: train on all matches before each test match.
 * Elo is naturally rolling (updates after each match).
 * Dixon-Coles is recalculated periodically.
 *
 * @param {Array} allMatches - All CSV matches sorted by date
 * @param {Object} params - Ensemble parameters
 * @param {number} testStartIndex - Index to start testing from
 * @param {boolean} verbose
 * @returns {Object} Backtesting results
 */
function ensembleBacktest(allMatches, params = DEFAULT_ENSEMBLE_PARAMS, testStartIndex = 3800, verbose = false) {
  const {
    xi, rho, eloK, eloHomeAdvantage, weights, statsDamping, formWindow,
    drawBoostStrength, drawThreshold, refereeDamping,
  } = { ...DEFAULT_ENSEMBLE_PARAMS, ...params };

  // Build Elo from training data
  const trainingMatches = allMatches.slice(0, testStartIndex);
  const elo = new EloSystem({ K: eloK, homeAdvantage: eloHomeAdvantage });
  elo.processMatches(trainingMatches);

  const results = [];
  let skipped = 0;

  // Recalculate Dixon-Coles strengths every 38 matches (1 round)
  let lastDCCalc = 0;
  let dcStrengths = null;
  let dcLeague = null;

  for (let i = testStartIndex; i < allMatches.length; i++) {
    const match = allMatches[i];
    const pastMatches = allMatches.slice(0, i);
    const homeName = match.homeTeam.shortName;
    const awayName = match.awayTeam.shortName;

    // Recalculate DC strengths periodically
    if (i - lastDCCalc >= 38 || !dcStrengths) {
      const { teams, league } = calculateTeamStrengths(pastMatches, match.date, xi);
      dcStrengths = teams;
      dcLeague = league;
      lastDCCalc = i;
    }

    // Dixon-Coles prediction
    const homeStrength = dcStrengths[homeName];
    const awayStrength = dcStrengths[awayName];

    if (!homeStrength || !awayStrength) {
      // Still update Elo for this match
      elo.processMatch(match);
      skipped++;
      continue;
    }

    // Ensemble prediction
    const models = {};
    let totalWeight = 0;

    // DC
    const factors = calculateFactors(pastMatches, homeName, awayName, dcStrengths, { formWindow });
    const dcResult = dixonColesPredict(homeStrength, awayStrength, dcLeague, rho, factors, { form: 0, momentum: 0, h2h: 0, stats: statsDamping });
    models.dixonColes = dcResult.outcomes;
    totalWeight += weights.dixonColes;

    // Elo (pre-match)
    const eloResult = elo.predict(homeName, awayName);
    models.elo = { homeWin: eloResult.homeWin, draw: eloResult.draw, awayWin: eloResult.awayWin };
    totalWeight += weights.elo;

    // Odds
    if (match.odds) {
      const oddsResult = predictFromOdds(match.odds);
      if (oddsResult) {
        models.odds = oddsResult;
        totalWeight += weights.odds;
      }
    }

    // Combine
    let homeWin = 0, draw = 0, awayWin = 0;
    if (models.dixonColes) {
      const w = weights.dixonColes / totalWeight;
      homeWin += models.dixonColes.homeWin * w;
      draw += models.dixonColes.draw * w;
      awayWin += models.dixonColes.awayWin * w;
    }
    { const w = weights.elo / totalWeight; homeWin += models.elo.homeWin * w; draw += models.elo.draw * w; awayWin += models.elo.awayWin * w; }
    if (models.odds) {
      const w = weights.odds / totalWeight; homeWin += models.odds.homeWin * w; draw += models.odds.draw * w; awayWin += models.odds.awayWin * w;
    }

    const total = homeWin + draw + awayWin;
    if (!total || isNaN(total)) {
      elo.processMatch(match);
      skipped++;
      continue;
    }
    homeWin /= total; draw /= total; awayWin /= total;

    // Safety: clamp to valid range
    if (isNaN(homeWin) || isNaN(draw) || isNaN(awayWin)) {
      elo.processMatch(match);
      skipped++;
      continue;
    }

    // Apply draw detector
    const drawAdjusted = adjustForDraws({ homeWin, draw, awayWin }, { drawBoostStrength, drawThreshold });
    homeWin = drawAdjusted.homeWin;
    draw = drawAdjusted.draw;
    awayWin = drawAdjusted.awayWin;

    // Apply referee adjustment
    if (match.referee && refereeDamping > 0) {
      const refAdj = refereeAdjustment(pastMatches, match.referee, refereeDamping);
      if (refAdj.stats) {
        homeWin *= refAdj.homeAdj;
        draw *= refAdj.drawAdj;
        awayWin *= refAdj.awayAdj;
        // Renormalize
        const refTotal = homeWin + draw + awayWin;
        homeWin /= refTotal; draw /= refTotal; awayWin /= refTotal;
      }
    }

    // Check result
    const predicted = { homeWin, draw, awayWin };
    const maxP = Math.max(homeWin, draw, awayWin);
    const predictedOutcome = homeWin === maxP ? 'HOME_TEAM' : awayWin === maxP ? 'AWAY_TEAM' : 'DRAW';
    const correct = predictedOutcome === match.winner;

    // Predicted score from Poisson using DC expected goals
    const baseLH = homeStrength.attackHome * awayStrength.defenseAway * dcLeague.avgHomeGoals;
    const baseLА = awayStrength.attackAway * homeStrength.defenseHome * dcLeague.avgAwayGoals;
    const { poissonPmf } = require('./poisson');
    let bestScore = { home: 1, away: 1 }, bestScoreProb = 0;
    for (let hi = 0; hi <= 5; hi++) {
      for (let ai = 0; ai <= 5; ai++) {
        const p = poissonPmf(baseLH, hi) * poissonPmf(baseLА, ai);
        if (p > bestScoreProb) { bestScoreProb = p; bestScore = { home: hi, away: ai }; }
      }
    }
    const correctScore = bestScore.home === match.homeGoals && bestScore.away === match.awayGoals;

    // Brier score
    const bs = (1/3) * (
      Math.pow(homeWin - (match.winner === 'HOME_TEAM' ? 1 : 0), 2) +
      Math.pow(draw - (match.winner === 'DRAW' ? 1 : 0), 2) +
      Math.pow(awayWin - (match.winner === 'AWAY_TEAM' ? 1 : 0), 2)
    );

    results.push({
      match: `${homeName} ${match.homeGoals}-${match.awayGoals} ${awayName}`,
      date: match.date.slice(0, 10),
      predicted,
      actual: match.winner,
      brierScore: bs,
      correct,
      correctScore,
      predictedScore: bestScore,
      actualScore: { home: match.homeGoals, away: match.awayGoals },
      hasOdds: !!models.odds,
      models,
    });

    // Update Elo after seeing result
    elo.processMatch(match);

    if (verbose && results.length % 100 === 0) {
      const avgBrier = results.reduce((s, r) => s + r.brierScore, 0) / results.length;
      const acc = results.filter(r => r.correct).length / results.length;
      console.log(`  [${results.length}] Brier: ${avgBrier.toFixed(4)} | Acc: ${(acc * 100).toFixed(1)}%`);
    }
  }

  // Aggregate
  const n = results.length;
  const avgBrier = results.reduce((s, r) => s + r.brierScore, 0) / n;
  const accuracy = results.filter(r => r.correct).length / n;
  const scoreAccuracy = results.filter(r => r.correctScore).length / n;
  const confidentResults = results.filter(r => Math.max(r.predicted.homeWin, r.predicted.draw, r.predicted.awayWin) > 0.6);
  const confidentAcc = confidentResults.length > 0 ? confidentResults.filter(r => r.correct).length / confidentResults.length : null;

  // Breakdown
  const breakdown = { HOME_TEAM: [], DRAW: [], AWAY_TEAM: [] };
  for (const r of results) breakdown[r.actual].push(r);

  const breakdownStats = {};
  for (const [outcome, items] of Object.entries(breakdown)) {
    if (items.length === 0) continue;
    breakdownStats[outcome] = {
      count: items.length,
      accuracy: items.filter(r => r.correct).length / items.length,
      avgBrier: items.reduce((s, r) => s + r.brierScore, 0) / items.length,
    };
  }

  return {
    metrics: {
      totalMatches: n,
      brierScore: avgBrier,
      accuracy,
      scoreAccuracy,
      confidentAccuracy: confidentAcc,
      confidentCount: confidentResults.length,
      breakdown: breakdownStats,
    },
    skipped,
    params,
    results,
  };
}

module.exports = {
  buildEnsemble,
  ensembleBacktest,
  DEFAULT_WEIGHTS,
  DEFAULT_ENSEMBLE_PARAMS,
};
