const { loadMultipleSeasons } = require('../src/cache/matchCache');
const { calculateTeamStrengths } = require('../src/stats/teamStats');
const poisson = require('../src/model/poisson');
const dixonColes = require('../src/model/dixonColes');

async function main() {
  const matches = await loadMultipleSeasons('PL', [2023, 2024]);
  const { teams, league } = calculateTeamStrengths(matches, '2025-03-30');

  // Compare Poisson vs Dixon-Coles
  const testMatch = ['Arsenal', 'Chelsea'];
  const [homeName, awayName] = testMatch;
  const home = teams[homeName];
  const away = teams[awayName];

  const pResult = poisson.predictMatch(home, away, league);
  const dcResult = dixonColes.predictMatch(home, away, league);

  console.log(`${homeName} vs ${awayName}\n`);
  console.log('                    Poisson     Dixon-Coles   Difference');
  console.log('─'.repeat(60));
  console.log(
    `${homeName} WIN:`.padEnd(20),
    `${(pResult.outcomes.homeWin * 100).toFixed(1)}%`.padEnd(12),
    `${(dcResult.outcomes.homeWin * 100).toFixed(1)}%`.padEnd(14),
    `${((dcResult.outcomes.homeWin - pResult.outcomes.homeWin) * 100).toFixed(2)}%`
  );
  console.log(
    'Draw:'.padEnd(20),
    `${(pResult.outcomes.draw * 100).toFixed(1)}%`.padEnd(12),
    `${(dcResult.outcomes.draw * 100).toFixed(1)}%`.padEnd(14),
    `${((dcResult.outcomes.draw - pResult.outcomes.draw) * 100).toFixed(2)}%`
  );
  console.log(
    `${awayName} WIN:`.padEnd(20),
    `${(pResult.outcomes.awayWin * 100).toFixed(1)}%`.padEnd(12),
    `${(dcResult.outcomes.awayWin * 100).toFixed(1)}%`.padEnd(14),
    `${((dcResult.outcomes.awayWin - pResult.outcomes.awayWin) * 100).toFixed(2)}%`
  );

  console.log('\nKey score differences (Poisson vs Dixon-Coles):');
  const keyScores = [[0,0], [1,0], [0,1], [1,1]];
  for (const [h, a] of keyScores) {
    const pProb = pResult.matrix[h][a] * 100;
    const dcProb = dcResult.matrix[h][a] * 100;
    console.log(`  ${h}-${a}: ${pProb.toFixed(2)}% -> ${dcProb.toFixed(2)}% (${dcProb > pProb ? '+' : ''}${(dcProb - pProb).toFixed(2)}%)`);
  }
}

main().catch(console.error);
