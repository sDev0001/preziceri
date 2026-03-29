const { loadMultipleSeasons } = require('../src/cache/matchCache');
const { runBacktest, baselineMetrics, printReport } = require('../src/backtest/backtester');

async function main() {
  console.log('Loading match data...');
  const allMatches = await loadMultipleSeasons('PL', [2023, 2024]);
  console.log(`Total matches: ${allMatches.length}\n`);

  const testMatches = allMatches.slice(380);
  const baseline = baselineMetrics(testMatches);

  // v1: Basic Dixon-Coles
  console.log('Running v1 (basic Dixon-Coles)...');
  const v1 = runBacktest(allMatches, {
    minTrainMatches: 380,
    xi: 0.001,
    rho: -0.13,
    enhanced: false,
    verbose: true,
  });
  printReport(v1, baseline, 'V1 - BASIC DIXON-COLES');

  // v2: Enhanced with all factors
  console.log('\nRunning v2 (enhanced with form/momentum/h2h/stats)...');
  const v2 = runBacktest(allMatches, {
    minTrainMatches: 380,
    xi: 0.001,
    rho: -0.13,
    enhanced: true,
    damping: { form: 0.15, momentum: 0.10, h2h: 0.05, stats: 0.08 },
    formWindow: 6,
    verbose: true,
  });
  printReport(v2, baseline, 'V2 - ENHANCED MODEL');

  // Direct comparison
  console.log('\n' + '='.repeat(60));
  console.log('  V1 vs V2 COMPARISON');
  console.log('='.repeat(60));
  console.log(`  Brier Score:   v1=${v1.metrics.brierScore.toFixed(4)}  v2=${v2.metrics.brierScore.toFixed(4)}  diff=${(v1.metrics.brierScore - v2.metrics.brierScore).toFixed(4)}`);
  console.log(`  Accuracy:      v1=${(v1.metrics.accuracy * 100).toFixed(1)}%    v2=${(v2.metrics.accuracy * 100).toFixed(1)}%    diff=${((v2.metrics.accuracy - v1.metrics.accuracy) * 100).toFixed(1)}pp`);
  console.log(`  Score exact:   v1=${(v1.metrics.scoreAccuracy * 100).toFixed(1)}%    v2=${(v2.metrics.scoreAccuracy * 100).toFixed(1)}%    diff=${((v2.metrics.scoreAccuracy - v1.metrics.scoreAccuracy) * 100).toFixed(1)}pp`);
  if (v2.metrics.confidentAccuracy !== null) {
    console.log(`  Confident>60%: v2=${(v2.metrics.confidentAccuracy * 100).toFixed(1)}% (${v2.metrics.confidentCount} matches)`);
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
