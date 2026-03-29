const { loadMultipleSeasons } = require('../src/cache/matchCache');
const { gridSearchV2, printOptimizationResults } = require('../src/optimize/paramOptimizer');

async function main() {
  console.log('Loading match data...');
  const allMatches = await loadMultipleSeasons('PL', [2023, 2024]);
  console.log(`Total matches: ${allMatches.length}\n`);

  // Use reduced search space to keep runtime manageable
  console.log('Running v2 parameter optimization...');
  console.log('(Using xi=0.001, rho=-0.13 from v1 optimization)\n');

  const result = gridSearchV2(allMatches, {
    xi: 0.001,
    rho: -0.13,
    formValues: [0, 0.05, 0.10, 0.15, 0.20],
    momentumValues: [0, 0.05, 0.10, 0.15],
    h2hValues: [0, 0.05, 0.10],
    statsValues: [0, 0.05, 0.10],
    formWindowValues: [5, 6],
  });

  printOptimizationResults(result, 'v2');
}

main().catch(console.error);
