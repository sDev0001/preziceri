const { getMatches, getStandings } = require('../src/api/footballData');

async function main() {
  console.log('Testing football-data.org API...\n');

  // Test 1: Get a few matches from PL 2023/24
  console.log('--- Fetching PL 2023/24 matches ---');
  const matches = await getMatches('PL', 2023);
  console.log(`Total finished matches: ${matches.length}`);

  // Show first 3 matches
  for (const m of matches.slice(0, 3)) {
    const home = m.homeTeam.shortName || m.homeTeam.name;
    const away = m.awayTeam.shortName || m.awayTeam.name;
    const score = `${m.score.fullTime.home}-${m.score.fullTime.away}`;
    console.log(`  ${home} ${score} ${away}  (${m.utcDate.slice(0, 10)})`);
  }

  // Test 2: Get standings
  console.log('\n--- Fetching PL 2023/24 standings ---');
  const standings = await getStandings('PL', 2023);
  const table = standings[0].table;
  console.log('Top 5:');
  for (const row of table.slice(0, 5)) {
    console.log(`  ${row.position}. ${row.team.shortName || row.team.name} - ${row.points} pts (GD: ${row.goalDifference})`);
  }

  console.log('\nAPI test complete!');
}

main().catch(err => {
  console.error('API Error:', err.response?.status, err.response?.data?.message || err.message);
});
