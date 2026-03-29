/**
 * Grid search parameter optimizer v2.
 *
 * Two-stage approach:
 * 1. Coarse search over damping parameters (form, momentum, h2h, stats)
 * 2. Fine search around best parameters
 */

const { runBacktest } = require('../backtest/backtester');

/**
 * Run v1 (basic) grid search over xi and rho only.
 */
function gridSearchV1(allMatches, options = {}) {
  const {
    xiValues = [0.001, 0.002, 0.003, 0.005, 0.0065, 0.01],
    rhoValues = [-0.20, -0.15, -0.13, -0.10, -0.05, 0],
    minTrainMatches = 380,
  } = options;

  const totalCombinations = xiValues.length * rhoValues.length;
  console.log(`Grid search v1: ${totalCombinations} combinations\n`);

  const results = [];
  let bestBrier = Infinity;
  let bestParams = null;
  let count = 0;

  for (const xi of xiValues) {
    for (const rho of rhoValues) {
      count++;
      const backtest = runBacktest(allMatches, {
        minTrainMatches, xi, rho, enhanced: false, verbose: false,
      });

      const brier = backtest.metrics.brierScore;
      const acc = backtest.metrics.accuracy;
      results.push({ xi, rho, brier, accuracy: acc });

      const marker = brier < bestBrier ? ' ** BEST **' : '';
      if (brier < bestBrier) { bestBrier = brier; bestParams = { xi, rho }; }

      console.log(`  [${count}/${totalCombinations}] xi=${xi.toFixed(4)} rho=${rho.toFixed(2)} => Brier: ${brier.toFixed(4)} | Acc: ${(acc * 100).toFixed(1)}%${marker}`);
    }
  }

  results.sort((a, b) => a.brier - b.brier);
  return { best: bestParams, bestBrier, bestAccuracy: results[0].accuracy, top5: results.slice(0, 5), allResults: results };
}

/**
 * Run v2 (enhanced) grid search over damping parameters.
 * Uses fixed xi/rho from v1 optimization and searches damping space.
 */
function gridSearchV2(allMatches, options = {}) {
  const {
    xi = 0.001,
    rho = -0.13,
    minTrainMatches = 380,
    // Coarse search ranges
    formValues = [0, 0.05, 0.10, 0.15, 0.20, 0.30],
    momentumValues = [0, 0.05, 0.10, 0.15, 0.20],
    h2hValues = [0, 0.03, 0.06, 0.10],
    statsValues = [0, 0.05, 0.10, 0.15],
    formWindowValues = [5, 6, 8],
  } = options;

  const total = formValues.length * momentumValues.length * h2hValues.length * statsValues.length * formWindowValues.length;
  console.log(`Grid search v2: ${total} combinations\n`);

  const results = [];
  let bestBrier = Infinity;
  let bestParams = null;
  let count = 0;

  for (const formWindow of formWindowValues) {
    for (const form of formValues) {
      for (const momentum of momentumValues) {
        for (const h2h of h2hValues) {
          for (const stats of statsValues) {
            count++;
            const damping = { form, momentum, h2h, stats };

            const backtest = runBacktest(allMatches, {
              minTrainMatches, xi, rho, enhanced: true, damping, formWindow, verbose: false,
            });

            const brier = backtest.metrics.brierScore;
            const acc = backtest.metrics.accuracy;
            const confAcc = backtest.metrics.confidentAccuracy;

            results.push({ damping, formWindow, brier, accuracy: acc, confidentAccuracy: confAcc });

            if (brier < bestBrier) {
              bestBrier = brier;
              bestParams = { damping, formWindow };
              console.log(`  [${count}/${total}] form=${form} mom=${momentum} h2h=${h2h} stats=${stats} fw=${formWindow} => Brier: ${brier.toFixed(4)} | Acc: ${(acc * 100).toFixed(1)}% ** BEST **`);
            } else if (count % 100 === 0) {
              console.log(`  [${count}/${total}] ... searching (best so far: ${bestBrier.toFixed(4)})`);
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => a.brier - b.brier);

  return {
    best: bestParams,
    bestBrier,
    bestAccuracy: results[0].accuracy,
    top10: results.slice(0, 10),
    allResults: results,
    baseParams: { xi, rho },
  };
}

/**
 * Print optimization results for v2.
 */
function printOptimizationResults(optResult, version = 'v2') {
  console.log('\n' + '='.repeat(70));
  console.log(`  OPTIMIZATION RESULTS (${version})`);
  console.log('='.repeat(70));

  if (version === 'v2') {
    const b = optResult.best;
    console.log(`  Best xi=${optResult.baseParams.xi}, rho=${optResult.baseParams.rho}`);
    console.log(`  Best damping: form=${b.damping.form}, momentum=${b.damping.momentum}, h2h=${b.damping.h2h}, stats=${b.damping.stats}`);
    console.log(`  Best formWindow: ${b.formWindow}`);
  } else {
    console.log(`  Best parameters: xi=${optResult.best.xi}, rho=${optResult.best.rho}`);
  }

  console.log(`  Best Brier Score: ${optResult.bestBrier.toFixed(4)}`);
  console.log(`  Best Accuracy: ${(optResult.bestAccuracy * 100).toFixed(1)}%`);

  const topN = optResult.top10 || optResult.top5;
  console.log(`\n  Top ${topN.length} parameter combinations:`);
  console.log('  ' + '─'.repeat(66));

  for (const r of topN) {
    if (r.damping) {
      const d = r.damping;
      console.log(`    f=${d.form} m=${d.momentum} h=${d.h2h} s=${d.stats} fw=${r.formWindow} => Brier: ${r.brier.toFixed(4)} | Acc: ${(r.accuracy * 100).toFixed(1)}%`);
    } else {
      console.log(`    xi=${r.xi.toFixed(4)} rho=${r.rho.toFixed(2)} => Brier: ${r.brier.toFixed(4)} | Acc: ${(r.accuracy * 100).toFixed(1)}%`);
    }
  }
  console.log('='.repeat(70));
}

module.exports = {
  gridSearchV1,
  gridSearchV2,
  printOptimizationResults,
};
