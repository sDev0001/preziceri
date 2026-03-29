const { loadMultipleSeasons } = require('../src/cache/matchCache');
const { runBacktest, baselineMetrics, printReport } = require('../src/backtest/backtester');

async function main() {
  console.log('Loading match data...');
  const allMatches = await loadMultipleSeasons('PL', [2023, 2024]);
  console.log(`Total matches: ${allMatches.length}`);

  // Use first season as training, second as test
  // minTrainMatches=380 means we train on season 1, predict season 2
  console.log('\nRunning backtest (this may take a moment)...');
  const result = runBacktest(allMatches, {
    minTrainMatches: 380,
    xi: 0.0065,
    rho: -0.13,
    verbose: true,
  });

  // Baseline: always predict home win
  const testMatches = allMatches.slice(380);
  const baseline = baselineMetrics(testMatches);

  printReport(result, baseline);

  // Show some example predictions
  console.log('\nSample predictions (last 10):');
  const last10 = result.results.slice(-10);
  for (const r of last10) {
    const icon = r.correct ? 'v' : 'x';
    const hProb = (r.predicted.homeWin * 100).toFixed(0);
    const dProb = (r.predicted.draw * 100).toFixed(0);
    const aProb = (r.predicted.awayWin * 100).toFixed(0);
    console.log(`  [${icon}] ${r.match.padEnd(30)} (${hProb}/${dProb}/${aProb}) ${r.date}`);
  }
}

main().catch(console.error);
