const { loadMultipleSeasons } = require('../src/cache/matchCache');
const { gridSearch, printOptimizationResults } = require('../src/optimize/paramOptimizer');

async function main() {
  console.log('Loading match data...');
  const allMatches = await loadMultipleSeasons('PL', [2023, 2024]);
  console.log(`Total matches: ${allMatches.length}\n`);

  console.log('Running parameter optimization...');
  console.log('(Training on 2023/24, testing on 2024/25)\n');

  const result = gridSearch(allMatches, {
    minTrainMatches: 380, // Train on season 1, test on season 2
  });

  printOptimizationResults(result);
}

main().catch(console.error);
