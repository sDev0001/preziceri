const { loadAllCSVMatches } = require('../src/data/csvParser');
const { ensembleBacktest } = require('../src/model/ensemble');

async function main() {
  console.log('Loading CSV match data...');
  const seasons = [];
  for (let y = 2005; y <= 2024; y++) seasons.push(y);
  const allMatches = loadAllCSVMatches(seasons);
  const testStart = allMatches.findIndex(m => m.season >= 2020);
  console.log(`${allMatches.length} matches, testing from index ${testStart}\n`);

  const base = {
    xi: 0.001, rho: -0.13, eloK: 30, eloHomeAdvantage: 50,
    weights: { dixonColes: 0.10, elo: 0.10, odds: 0.80 }, statsDamping: 0.10,
  };

  // Test different drawThreshold values (how close teams need to be to predict draw)
  const configs = [
    { name: 'baseline (no improvements)', drawBoostStrength: 0, refereeDamping: 0 },
    { name: 'draw threshold=0.05 ref=0.15', drawBoostStrength: 0.5, refereeDamping: 0.15, drawThreshold: 0.05 },
    { name: 'draw threshold=0.08 ref=0.15', drawBoostStrength: 0.5, refereeDamping: 0.15, drawThreshold: 0.08 },
    { name: 'draw threshold=0.10 ref=0.15', drawBoostStrength: 0.5, refereeDamping: 0.15, drawThreshold: 0.10 },
    { name: 'draw threshold=0.12 ref=0.15', drawBoostStrength: 0.5, refereeDamping: 0.15, drawThreshold: 0.12 },
    { name: 'draw threshold=0.15 ref=0.15', drawBoostStrength: 0.5, refereeDamping: 0.15, drawThreshold: 0.15 },
    { name: 'draw threshold=0.20 ref=0.15', drawBoostStrength: 0.5, refereeDamping: 0.15, drawThreshold: 0.20 },
  ];

  console.log('Config'.padEnd(40), 'Brier'.padEnd(9), 'Acc'.padEnd(8), 'Home'.padEnd(8), 'Draw'.padEnd(8), 'Away'.padEnd(8), '>60%');
  console.log('─'.repeat(95));

  for (const cfg of configs) {
    const result = ensembleBacktest(allMatches, { ...base, ...cfg }, testStart, false);
    const m = result.metrics;
    const ha = m.breakdown.HOME_TEAM ? (m.breakdown.HOME_TEAM.accuracy*100).toFixed(1) : '-';
    const da = m.breakdown.DRAW ? (m.breakdown.DRAW.accuracy*100).toFixed(1) : '0.0';
    const aa = m.breakdown.AWAY_TEAM ? (m.breakdown.AWAY_TEAM.accuracy*100).toFixed(1) : '-';
    const ca = m.confidentAccuracy ? (m.confidentAccuracy*100).toFixed(1) : '-';
    console.log(cfg.name.padEnd(40), m.brierScore.toFixed(4).padEnd(9), ((m.accuracy*100).toFixed(1)+'%').padEnd(8), (ha+'%').padEnd(8), (da+'%').padEnd(8), (aa+'%').padEnd(8), ca+'%');
  }
}

main().catch(err => console.error('Error:', err.message, err.stack));
