const { loadMultipleSeasons } = require('../src/cache/matchCache');
const { calculateTeamStrengths } = require('../src/stats/teamStats');

async function main() {
  const matches = await loadMultipleSeasons('PL', [2023, 2024]);
  console.log(`Loaded ${matches.length} matches\n`);

  const { teams, league } = calculateTeamStrengths(matches, '2025-03-30');

  console.log('League averages:');
  console.log(`  Avg home goals: ${league.avgHomeGoals.toFixed(3)}`);
  console.log(`  Avg away goals: ${league.avgAwayGoals.toFixed(3)}`);
  console.log();

  // Show top teams
  const topTeams = ['Man City', 'Arsenal', 'Liverpool', 'Chelsea', 'Tottenham', 'Man United'];
  console.log('Team Strengths (attack > 1 = above avg, defense < 1 = strong defense):');
  console.log('─'.repeat(70));
  console.log('Team'.padEnd(15), 'AtkH'.padEnd(8), 'DefH'.padEnd(8), 'AtkA'.padEnd(8), 'DefA'.padEnd(8));
  console.log('─'.repeat(70));

  for (const name of topTeams) {
    const t = teams[name];
    if (!t) {
      console.log(`  ${name}: NOT FOUND (check name)`);
      continue;
    }
    console.log(
      name.padEnd(15),
      t.attackHome.toFixed(3).padEnd(8),
      t.defenseHome.toFixed(3).padEnd(8),
      t.attackAway.toFixed(3).padEnd(8),
      t.defenseAway.toFixed(3).padEnd(8)
    );
  }

  // Show all team names for reference
  console.log('\nAll team names in data:');
  console.log(Object.keys(teams).sort().join(', '));
}

main().catch(console.error);
