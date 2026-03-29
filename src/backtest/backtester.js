/**
 * Backtesting engine v2.
 *
 * Uses rolling-window evaluation: for each match in the test set,
 * we use only matches BEFORE it to build the model, then predict.
 * This simulates real-world usage where we don't know future results.
 *
 * v2: supports enhanced model with form, momentum, h2h, advanced stats.
 */

const { calculateTeamStrengths } = require('../stats/teamStats');
const { predictMatch } = require('../model/dixonColes');
const { calculateFactors, DEFAULT_DAMPING } = require('../model/enhancedPredictor');
const { brierScore, isCorrectPrediction, isCorrectScore, aggregateMetrics } = require('./metrics');

/**
 * Run backtesting on a set of matches.
 *
 * @param {Array} allMatches - All historical matches sorted by date
 * @param {Object} options
 * @param {number} options.minTrainMatches - Minimum matches before predicting (default: 200)
 * @param {number} options.xi - Decay rate
 * @param {number} options.rho - Dixon-Coles correction
 * @param {boolean} options.enhanced - Use v2 enhanced model (default: true)
 * @param {Object} options.damping - Damping coefficients for v2 factors
 * @param {number} options.formWindow - Recent form window size
 * @param {boolean} options.verbose - Print progress
 * @returns {Object} Backtesting results with metrics
 */
function runBacktest(allMatches, options = {}) {
  const {
    minTrainMatches = 200,
    xi = 0.001,
    rho = -0.13,
    enhanced = true,
    damping = DEFAULT_DAMPING,
    formWindow = 6,
    verbose = false,
  } = options;

  const results = [];
  let skipped = 0;

  for (let i = minTrainMatches; i < allMatches.length; i++) {
    const match = allMatches[i];
    const trainingData = allMatches.slice(0, i);

    // Calculate strengths using only past matches
    const { teams, league } = calculateTeamStrengths(trainingData, match.date, xi);

    const homeName = match.homeTeam.shortName;
    const awayName = match.awayTeam.shortName;
    const homeTeam = teams[homeName];
    const awayTeam = teams[awayName];

    // Skip if team not in training data
    if (!homeTeam || !awayTeam) {
      skipped++;
      continue;
    }

    let prediction;
    if (enhanced) {
      // v2: calculate factors and pass to prediction
      const factors = calculateFactors(trainingData, homeName, awayName, teams, { formWindow });
      prediction = predictMatch(homeTeam, awayTeam, league, rho, factors, damping);
    } else {
      // v1: basic Dixon-Coles
      prediction = predictMatch(homeTeam, awayTeam, league, rho);
    }

    const bs = brierScore(prediction.outcomes, match.winner);
    const correct = isCorrectPrediction(prediction.outcomes, match.winner);
    const correctScore = isCorrectScore(prediction.likelyScores, match.homeGoals, match.awayGoals);

    results.push({
      match: `${homeName} ${match.homeGoals}-${match.awayGoals} ${awayName}`,
      date: match.date.slice(0, 10),
      predicted: prediction.outcomes,
      actual: match.winner,
      brierScore: bs,
      correct,
      correctScore,
      predictedScore: prediction.likelyScores[0],
      actualScore: { home: match.homeGoals, away: match.awayGoals },
    });

    if (verbose && i % 50 === 0) {
      const running = aggregateMetrics(results);
      console.log(`  [${i}/${allMatches.length}] Brier: ${running.brierScore.toFixed(4)} | Acc: ${(running.accuracy * 100).toFixed(1)}%`);
    }
  }

  const metrics = aggregateMetrics(results);

  // Additional v2 metrics
  if (results.length > 0) {
    // Calibration: when we predict >60%, how often are we right?
    const confidentPredictions = results.filter(r => {
      const maxP = Math.max(r.predicted.homeWin, r.predicted.draw, r.predicted.awayWin);
      return maxP > 0.6;
    });
    const confidentCorrect = confidentPredictions.filter(r => r.correct).length;
    metrics.confidentAccuracy = confidentPredictions.length > 0
      ? confidentCorrect / confidentPredictions.length
      : null;
    metrics.confidentCount = confidentPredictions.length;

    // Calibration buckets
    metrics.calibration = calculateCalibration(results);
  }

  return {
    metrics,
    skipped,
    parameters: { xi, rho, enhanced, damping, formWindow, minTrainMatches },
    results,
  };
}

/**
 * Calculate calibration: for each probability bucket, what's the actual win rate?
 * Good calibration means when we say 70%, it happens ~70% of the time.
 */
function calculateCalibration(results) {
  const buckets = {};
  const bucketSize = 0.1; // 10% buckets

  for (const r of results) {
    // Use the max prediction probability
    const probs = [
      { outcome: 'HOME_TEAM', prob: r.predicted.homeWin },
      { outcome: 'DRAW', prob: r.predicted.draw },
      { outcome: 'AWAY_TEAM', prob: r.predicted.awayWin },
    ];

    for (const { outcome, prob } of probs) {
      const bucket = Math.floor(prob / bucketSize) * bucketSize;
      const key = bucket.toFixed(1);
      if (!buckets[key]) buckets[key] = { predicted: 0, actual: 0, count: 0 };
      buckets[key].predicted += prob;
      buckets[key].actual += (r.actual === outcome) ? 1 : 0;
      buckets[key].count++;
    }
  }

  const calibrationData = [];
  for (const [bucket, data] of Object.entries(buckets).sort()) {
    if (data.count < 5) continue; // Skip tiny buckets
    calibrationData.push({
      bucket: +bucket,
      avgPredicted: +(data.predicted / data.count).toFixed(3),
      actualRate: +(data.actual / data.count).toFixed(3),
      count: data.count,
    });
  }

  return calibrationData;
}

/**
 * Calculate baseline metrics (always predict home win).
 */
function baselineMetrics(matches) {
  const results = matches.map(m => ({
    brierScore: brierScore({ homeWin: 1, draw: 0, awayWin: 0 }, m.winner),
    correct: m.winner === 'HOME_TEAM',
    correctScore: false,
    actual: m.winner,
  }));
  return aggregateMetrics(results);
}

/**
 * Print a formatted backtesting report.
 */
function printReport(backtestResult, baseline, label = 'BACKTESTING REPORT') {
  const m = backtestResult.metrics;
  const p = backtestResult.parameters;

  console.log('\n' + '='.repeat(60));
  console.log(`  ${label}`);
  console.log('='.repeat(60));
  console.log(`  Matches evaluated: ${m.totalMatches} (skipped: ${backtestResult.skipped})`);
  console.log(`  Model: ${p.enhanced ? 'v2 Enhanced' : 'v1 Basic'}`);
  console.log(`  Parameters: xi=${p.xi}, rho=${p.rho}`);
  if (p.enhanced && p.damping) {
    console.log(`  Damping: form=${p.damping.form}, momentum=${p.damping.momentum}, h2h=${p.damping.h2h}, stats=${p.damping.stats}`);
  }
  console.log();
  console.log('  METRIC              MODEL      BASELINE    IMPROVEMENT');
  console.log('  ' + '─'.repeat(56));
  console.log(
    `  Brier Score:        ${m.brierScore.toFixed(4)}     ${baseline.brierScore.toFixed(4)}      ${((baseline.brierScore - m.brierScore) / baseline.brierScore * 100).toFixed(1)}% better`
  );
  console.log(
    `  Accuracy (1X2):     ${(m.accuracy * 100).toFixed(1)}%      ${(baseline.accuracy * 100).toFixed(1)}%       +${((m.accuracy - baseline.accuracy) * 100).toFixed(1)}pp`
  );
  console.log(
    `  Score accuracy:     ${(m.scoreAccuracy * 100).toFixed(1)}%       -            -`
  );

  if (m.confidentAccuracy !== null && m.confidentAccuracy !== undefined) {
    console.log(
      `  Confident (>60%):   ${(m.confidentAccuracy * 100).toFixed(1)}%      -            (${m.confidentCount} matches)`
    );
  }

  console.log('\n  BREAKDOWN BY OUTCOME:');
  console.log('  ' + '─'.repeat(56));
  for (const [outcome, stats] of Object.entries(m.breakdown)) {
    const label = outcome === 'HOME_TEAM' ? 'Home Win' : outcome === 'DRAW' ? 'Draw' : 'Away Win';
    console.log(
      `  ${label.padEnd(12)} ${stats.count} matches | Acc: ${(stats.accuracy * 100).toFixed(1)}% | Brier: ${stats.avgBrier.toFixed(4)}`
    );
  }

  if (m.calibration && m.calibration.length > 0) {
    console.log('\n  CALIBRATION (predicted vs actual):');
    console.log('  ' + '─'.repeat(56));
    for (const c of m.calibration) {
      const diff = c.actualRate - c.avgPredicted;
      const bar = diff > 0 ? '+'.repeat(Math.min(20, Math.round(diff * 100))) : '-'.repeat(Math.min(20, Math.round(-diff * 100)));
      console.log(`  ${(c.bucket * 100).toFixed(0).padStart(3)}%: predicted ${(c.avgPredicted * 100).toFixed(1)}% actual ${(c.actualRate * 100).toFixed(1)}% (n=${c.count}) ${bar}`);
    }
  }

  console.log('='.repeat(60));
}

module.exports = {
  runBacktest,
  baselineMetrics,
  printReport,
};
