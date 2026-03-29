const { loadMultipleSeasons } = require('../src/cache/matchCache');
const { calculateTeamStrengths } = require('../src/stats/teamStats');
const { predictMatch } = require('../src/model/poisson');

async function main() {
  const matches = await loadMultipleSeasons('PL', [2023, 2024]);
  const { teams, league } = calculateTeamStrengths(matches, '2025-03-30');

  // Test: Arsenal vs Chelsea
  const testMatches = [
    ['Arsenal', 'Chelsea'],
    ['Man City', 'Liverpool'],
    ['Tottenham', 'Man United'],
    ['Southampton', 'Man City'],
  ];

  for (const [homeName, awayName] of testMatches) {
    const home = teams[homeName];
    const away = teams[awayName];

    if (!home || !away) {
      console.log(`Team not found: ${!home ? homeName : awayName}`);
      continue;
    }

    const result = predictMatch(home, away, league);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`  ${homeName} vs ${awayName}`);
    console.log('='.repeat(50));
    console.log(`  Expected goals: ${result.expectedGoals.home.toFixed(2)} - ${result.expectedGoals.away.toFixed(2)}`);
    console.log();
    console.log(`  ${homeName} WIN:  ${(result.outcomes.homeWin * 100).toFixed(1)}%`);
    console.log(`  Draw:          ${(result.outcomes.draw * 100).toFixed(1)}%`);
    console.log(`  ${awayName} WIN: ${(result.outcomes.awayWin * 100).toFixed(1)}%`);
    console.log();
    console.log('  Most likely scores:');
    for (const s of result.likelyScores) {
      console.log(`    ${s.home}-${s.away}  (${(s.probability * 100).toFixed(1)}%)`);
    }
  }
}

main().catch(console.error);
