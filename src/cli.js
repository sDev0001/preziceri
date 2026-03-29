const { loadMultipleSeasons, fetchAndCache } = require('./cache/matchCache');
const { calculateTeamStrengths } = require('./stats/teamStats');
const { predictMatch } = require('./model/dixonColes');
const { runBacktest, baselineMetrics, printReport } = require('./backtest/backtester');
const { gridSearch, printOptimizationResults } = require('./optimize/paramOptimizer');
const { getUpcomingMatches } = require('./api/footballData');
const { MODEL, AVAILABLE_SEASONS } = require('./config');

/**
 * Load data and calculate team strengths for a league.
 */
async function loadModel(league, seasons = AVAILABLE_SEASONS) {
  const matches = await loadMultipleSeasons(league, seasons);
  const referenceDate = new Date().toISOString();
  const { teams, league: leagueAvg } = calculateTeamStrengths(matches, referenceDate, MODEL.XI);
  return { matches, teams, leagueAvg };
}

/**
 * Predict a single match between two teams.
 */
async function commandPredict(homeName, awayName, league = 'PL') {
  const { teams, leagueAvg } = await loadModel(league);

  // Fuzzy match team names
  const homeKey = findTeam(teams, homeName);
  const awayKey = findTeam(teams, awayName);

  if (!homeKey) {
    console.error(`Team not found: "${homeName}"`);
    console.log('Available teams:', Object.keys(teams).sort().join(', '));
    return;
  }
  if (!awayKey) {
    console.error(`Team not found: "${awayName}"`);
    console.log('Available teams:', Object.keys(teams).sort().join(', '));
    return;
  }

  const result = predictMatch(teams[homeKey], teams[awayKey], leagueAvg, MODEL.RHO);

  console.log();
  console.log(`  ${homeKey} vs ${awayKey}`);
  console.log('  ' + '='.repeat(40));
  console.log(`  Expected goals: ${result.expectedGoals.home.toFixed(2)} - ${result.expectedGoals.away.toFixed(2)}`);
  console.log();
  console.log(`  ${homeKey} WIN:`.padEnd(22) + `${(result.outcomes.homeWin * 100).toFixed(1)}%`);
  console.log(`  Draw:`.padEnd(22) + `${(result.outcomes.draw * 100).toFixed(1)}%`);
  console.log(`  ${awayKey} WIN:`.padEnd(22) + `${(result.outcomes.awayWin * 100).toFixed(1)}%`);
  console.log();
  console.log('  Most likely scores:');
  for (const s of result.likelyScores) {
    const bar = '#'.repeat(Math.round(s.probability * 200));
    console.log(`    ${s.home}-${s.away}  ${(s.probability * 100).toFixed(1)}%  ${bar}`);
  }
  console.log();
}

/**
 * Show predictions for upcoming matches.
 */
async function commandUpcoming(league = 'PL') {
  console.log(`\nFetching upcoming ${league} matches...\n`);

  const { teams, leagueAvg } = await loadModel(league);
  const upcoming = await getUpcomingMatches(league);

  if (upcoming.length === 0) {
    console.log('No upcoming matches found.');
    return;
  }

  // Group by matchday
  const byMatchday = {};
  for (const m of upcoming) {
    const md = m.matchday || 'TBD';
    if (!byMatchday[md]) byMatchday[md] = [];
    byMatchday[md].push(m);
  }

  for (const [matchday, matches] of Object.entries(byMatchday)) {
    console.log(`  Matchday ${matchday}`);
    console.log('  ' + '─'.repeat(65));

    for (const m of matches) {
      const homeName = m.homeTeam.shortName || m.homeTeam.name;
      const awayName = m.awayTeam.shortName || m.awayTeam.name;
      const date = m.utcDate.slice(0, 10);

      const homeKey = findTeam(teams, homeName);
      const awayKey = findTeam(teams, awayName);

      if (!homeKey || !awayKey) {
        console.log(`  ${homeName.padEnd(18)} vs ${awayName.padEnd(18)} ${date}  (no data)`);
        continue;
      }

      const result = predictMatch(teams[homeKey], teams[awayKey], leagueAvg, MODEL.RHO);
      const h = (result.outcomes.homeWin * 100).toFixed(0).padStart(3);
      const d = (result.outcomes.draw * 100).toFixed(0).padStart(3);
      const a = (result.outcomes.awayWin * 100).toFixed(0).padStart(3);
      const score = `${result.likelyScores[0].home}-${result.likelyScores[0].away}`;

      console.log(`  ${homeKey.padEnd(18)} vs ${awayKey.padEnd(18)} ${date}  [${h}/${d}/${a}]  ${score}`);
    }
    console.log();
  }
}

/**
 * Run backtesting.
 */
async function commandBacktest(league = 'PL') {
  const { matches } = await loadModel(league);
  console.log(`\nRunning backtest on ${matches.length} matches...`);

  const result = runBacktest(matches, {
    minTrainMatches: 380,
    xi: MODEL.XI,
    rho: MODEL.RHO,
    verbose: true,
  });

  const testMatches = matches.slice(380);
  const baseline = baselineMetrics(testMatches);
  printReport(result, baseline);
}

/**
 * Run parameter optimization.
 */
async function commandOptimize(league = 'PL') {
  const { matches } = await loadModel(league);
  console.log(`\nOptimizing parameters on ${matches.length} matches...\n`);

  const result = gridSearch(matches, { minTrainMatches: 380 });
  printOptimizationResults(result);
}

/**
 * List available teams.
 */
async function commandTeams(league = 'PL') {
  const { teams } = await loadModel(league);
  console.log(`\nAvailable teams in ${league}:`);
  console.log(Object.keys(teams).sort().join('\n'));
}

/**
 * Download/refresh match data.
 */
async function commandRefresh(league = 'PL') {
  console.log(`\nRefreshing ${league} data...`);
  for (const season of AVAILABLE_SEASONS) {
    try {
      await fetchAndCache(league, season, true);
    } catch (err) {
      console.log(`  Season ${season}: ${err.response?.data?.message || err.message}`);
    }
  }
  console.log('Done!');
}

/**
 * Fuzzy match a team name against available teams.
 */
function findTeam(teams, query) {
  const q = query.toLowerCase();

  // Exact match first
  for (const name of Object.keys(teams)) {
    if (name.toLowerCase() === q) return name;
  }

  // Partial match
  for (const name of Object.keys(teams)) {
    if (name.toLowerCase().includes(q) || q.includes(name.toLowerCase())) return name;
  }

  return null;
}

/**
 * Print usage instructions.
 */
function printUsage() {
  console.log(`
  Football Match Predictor - Dixon-Coles Model
  =============================================

  Usage:
    node index.js predict <home> <away> [league]    Predict a match
    node index.js upcoming [league]                  Predict upcoming matches
    node index.js backtest [league]                  Run backtesting
    node index.js optimize [league]                  Optimize parameters
    node index.js teams [league]                     List available teams
    node index.js refresh [league]                   Re-download match data

  Leagues: PL (Premier League), PD (La Liga), SA (Serie A),
           BL1 (Bundesliga), FL1 (Ligue 1), CL (Champions League)

  Examples:
    node index.js predict Arsenal Chelsea
    node index.js predict "Man City" Liverpool
    node index.js upcoming PL
    node index.js backtest PL
  `);
}

module.exports = {
  commandPredict,
  commandUpcoming,
  commandBacktest,
  commandOptimize,
  commandTeams,
  commandRefresh,
  printUsage,
};
