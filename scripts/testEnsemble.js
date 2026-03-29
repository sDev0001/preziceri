const { loadAllCSVMatches } = require('../src/data/csvParser');
const { ensembleBacktest } = require('../src/model/ensemble');

async function main() {
  console.log('Loading CSV match data...');
  const seasons = [];
  for (let y = 2005; y <= 2024; y++) seasons.push(y);

  const allMatches = loadAllCSVMatches(seasons);
  console.log(`Total matches: ${allMatches.length}\n`);

  // Test on last 5 seasons (2020-2024), train on 2005-2019
  // 15 seasons * 380 = 5700 training matches, 5 seasons * 380 = 1900 test matches
  const testStart = allMatches.findIndex(m => m.season >= 2020);
  console.log(`Training on matches 0-${testStart - 1} (${testStart} matches)`);
  console.log(`Testing on matches ${testStart}-${allMatches.length - 1} (${allMatches.length - testStart} matches)\n`);

  // Run ensemble backtest
  console.log('Running ensemble backtest (Dixon-Coles + Elo + Odds)...');
  const result = ensembleBacktest(allMatches, {
    xi: 0.001,
    rho: -0.13,
    eloK: 20,
    eloHomeAdvantage: 65,
    weights: { dixonColes: 0.35, elo: 0.25, odds: 0.40 },
    statsDamping: 0.10,
  }, testStart, true);

  const m = result.metrics;

  console.log('\n' + '='.repeat(60));
  console.log('  ENSEMBLE V3 BACKTEST RESULTS');
  console.log('='.repeat(60));
  console.log(`  Matches tested: ${m.totalMatches} (skipped: ${result.skipped})`);
  console.log(`  Brier Score:    ${m.brierScore.toFixed(4)}`);
  console.log(`  Accuracy (1X2): ${(m.accuracy * 100).toFixed(1)}%`);
  if (m.confidentAccuracy !== null) {
    console.log(`  Confident >60%: ${(m.confidentAccuracy * 100).toFixed(1)}% (${m.confidentCount} matches)`);
  }
  console.log('\n  BREAKDOWN:');
  for (const [outcome, stats] of Object.entries(m.breakdown)) {
    const label = outcome === 'HOME_TEAM' ? 'Home Win' : outcome === 'DRAW' ? 'Draw' : 'Away Win';
    console.log(`    ${label.padEnd(12)} ${stats.count} matches | Acc: ${(stats.accuracy * 100).toFixed(1)}% | Brier: ${stats.avgBrier.toFixed(4)}`);
  }

  // Compare: how many had odds
  const withOdds = result.results.filter(r => r.hasOdds).length;
  console.log(`\n  Matches with odds data: ${withOdds}/${m.totalMatches}`);

  // Elo standings
  console.log('\n  Top 10 Elo ratings (end of dataset):');
  // Rebuild elo for this
  const { EloSystem } = require('../src/model/elo');
  const elo = new EloSystem({ K: 20, homeAdvantage: 65 });
  elo.processMatches(allMatches);
  const standings = elo.getStandings().slice(0, 10);
  for (const s of standings) {
    console.log(`    ${s.team.padEnd(18)} ${s.rating}`);
  }

  console.log('='.repeat(60));
}

main().catch(err => console.error('Error:', err.message, err.stack));
