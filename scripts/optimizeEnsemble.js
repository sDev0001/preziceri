const { loadAllCSVMatches } = require('../src/data/csvParser');
const { ensembleBacktest } = require('../src/model/ensemble');

async function main() {
  console.log('Loading CSV match data...');
  const seasons = [];
  for (let y = 2005; y <= 2024; y++) seasons.push(y);

  const allMatches = loadAllCSVMatches(seasons);
  const testStart = allMatches.findIndex(m => m.season >= 2020);
  console.log(`${allMatches.length} matches, testing from index ${testStart}\n`);

  // Grid search over weights and Elo params
  const results = [];
  let best = { brier: Infinity };
  let count = 0;

  // Weight combinations (must sum to ~1)
  const weightSets = [
    { dixonColes: 0.20, elo: 0.20, odds: 0.60 },
    { dixonColes: 0.25, elo: 0.20, odds: 0.55 },
    { dixonColes: 0.25, elo: 0.25, odds: 0.50 },
    { dixonColes: 0.30, elo: 0.20, odds: 0.50 },
    { dixonColes: 0.30, elo: 0.25, odds: 0.45 },
    { dixonColes: 0.35, elo: 0.25, odds: 0.40 },
    { dixonColes: 0.30, elo: 0.30, odds: 0.40 },
    { dixonColes: 0.40, elo: 0.20, odds: 0.40 },
    { dixonColes: 0.15, elo: 0.15, odds: 0.70 },
    { dixonColes: 0.10, elo: 0.10, odds: 0.80 },
    { dixonColes: 0.20, elo: 0.10, odds: 0.70 },
    { dixonColes: 0.10, elo: 0.20, odds: 0.70 },
  ];

  const eloKValues = [15, 20, 25, 30];
  const eloHAValues = [50, 65, 80];

  const total = weightSets.length * eloKValues.length * eloHAValues.length;
  console.log(`Grid search: ${total} combinations\n`);

  for (const weights of weightSets) {
    for (const eloK of eloKValues) {
      for (const eloHA of eloHAValues) {
        count++;
        const result = ensembleBacktest(allMatches, {
          xi: 0.001, rho: -0.13,
          eloK, eloHomeAdvantage: eloHA,
          weights,
          statsDamping: 0.10,
        }, testStart, false);

        const m = result.metrics;
        const entry = { weights, eloK, eloHA, brier: m.brierScore, accuracy: m.accuracy, confidentAcc: m.confidentAccuracy };
        results.push(entry);

        if (m.brierScore < best.brier) {
          best = entry;
          console.log(`  [${count}/${total}] dc=${weights.dixonColes} elo=${weights.elo} odds=${weights.odds} K=${eloK} HA=${eloHA} => Brier: ${m.brierScore.toFixed(4)} | Acc: ${(m.accuracy * 100).toFixed(1)}% | Conf: ${m.confidentAccuracy ? (m.confidentAccuracy * 100).toFixed(1) : '-'}% ** BEST **`);
        } else if (count % 20 === 0) {
          console.log(`  [${count}/${total}] searching... (best: ${best.brier.toFixed(4)})`);
        }
      }
    }
  }

  results.sort((a, b) => a.brier - b.brier);

  console.log('\n' + '='.repeat(70));
  console.log('  ENSEMBLE OPTIMIZATION RESULTS');
  console.log('='.repeat(70));
  console.log(`  Best Brier: ${best.brier.toFixed(4)}`);
  console.log(`  Best Accuracy: ${(best.accuracy * 100).toFixed(1)}%`);
  console.log(`  Best Confident: ${best.confidentAcc ? (best.confidentAcc * 100).toFixed(1) : '-'}%`);
  console.log(`  Weights: DC=${best.weights.dixonColes} Elo=${best.weights.elo} Odds=${best.weights.odds}`);
  console.log(`  Elo: K=${best.eloK} HA=${best.eloHA}`);

  console.log('\n  Top 10:');
  for (const r of results.slice(0, 10)) {
    console.log(`    dc=${r.weights.dixonColes} elo=${r.weights.elo} odds=${r.weights.odds} K=${r.eloK} HA=${r.eloHA} => Brier: ${r.brier.toFixed(4)} | Acc: ${(r.accuracy * 100).toFixed(1)}%`);
  }
  console.log('='.repeat(70));
}

main().catch(err => console.error('Error:', err.message));
