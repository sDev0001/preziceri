const { loadAllCSVMatches } = require('../src/data/csvParser');

const seasons = [];
for (let y = 2005; y <= 2024; y++) seasons.push(y);
const allMatches = loadAllCSVMatches(seasons);

console.log(`Total matches: ${allMatches.length}`);
const draws = allMatches.filter(m => m.winner === 'DRAW');
console.log(`Total draws: ${draws.length} (${(draws.length/allMatches.length*100).toFixed(1)}%)\n`);

// Pattern 1: Goal difference between teams
// For each match, calculate the difference in recent goals scored
function getTeamAvg(matches, team, beforeDate, n = 10) {
  const past = matches.filter(m =>
    new Date(m.date) < new Date(beforeDate) &&
    (m.homeTeam.shortName === team || m.awayTeam.shortName === team)
  ).slice(-n);
  if (past.length < 3) return null;
  let gf = 0, ga = 0;
  for (const m of past) {
    const isH = m.homeTeam.shortName === team;
    gf += isH ? m.homeGoals : m.awayGoals;
    ga += isH ? m.awayGoals : m.homeGoals;
  }
  return { gf: gf/past.length, ga: ga/past.length, pts: 0 };
}

// Pattern 2: When do draws happen?
console.log('=== DRAW ANALYSIS ===\n');

// Analyze by odds range
const oddsDraws = allMatches.filter(m => m.odds?.avg?.draw);
const oddsBuckets = {};
for (const m of oddsDraws) {
  const drawOdds = m.odds.avg.draw;
  const bucket = Math.floor(drawOdds * 2) / 2; // 0.5 increments
  if (!oddsBuckets[bucket]) oddsBuckets[bucket] = { total: 0, draws: 0 };
  oddsBuckets[bucket].total++;
  if (m.winner === 'DRAW') oddsBuckets[bucket].draws++;
}
console.log('Draw rate by bookmaker draw odds:');
for (const [odds, data] of Object.entries(oddsBuckets).sort((a,b) => a[0]-b[0])) {
  if (data.total < 20) continue;
  console.log(`  Odds ${odds}: ${data.draws}/${data.total} = ${(data.draws/data.total*100).toFixed(1)}% draws`);
}

// Pattern 3: Score difference at half-time
console.log('\nDraw rate by half-time state:');
const htStates = { 'Leading': { total: 0, draws: 0 }, 'Trailing': { total: 0, draws: 0 }, 'Level': { total: 0, draws: 0 } };
for (const m of allMatches) {
  if (!m.halfTime) continue;
  const htDiff = m.halfTime.homeGoals - m.halfTime.awayGoals;
  const state = htDiff > 0 ? 'Leading' : htDiff < 0 ? 'Trailing' : 'Level';
  htStates[state].total++;
  if (m.winner === 'DRAW') htStates[state].draws++;
}
for (const [state, data] of Object.entries(htStates)) {
  console.log(`  ${state}: ${data.draws}/${data.total} = ${(data.draws/data.total*100).toFixed(1)}% end as draw`);
}

// Pattern 4: How close are the teams in strength?
console.log('\nDraw rate by implied probability difference (from odds):');
const probDiffBuckets = {};
for (const m of oddsDraws) {
  const o = m.odds.avg;
  if (!o.home || !o.away) continue;
  const pH = 1/o.home, pA = 1/o.away;
  const total = pH + 1/o.draw + pA;
  const diff = Math.abs(pH/total - pA/total);
  const bucket = Math.floor(diff * 10) / 10;
  if (!probDiffBuckets[bucket]) probDiffBuckets[bucket] = { total: 0, draws: 0 };
  probDiffBuckets[bucket].total++;
  if (m.winner === 'DRAW') probDiffBuckets[bucket].draws++;
}
for (const [diff, data] of Object.entries(probDiffBuckets).sort((a,b) => a[0]-b[0])) {
  if (data.total < 20) continue;
  console.log(`  Diff ${diff}: ${data.draws}/${data.total} = ${(data.draws/data.total*100).toFixed(1)}% draws (${data.total} matches)`);
}

// Pattern 5: Goals scored patterns
console.log('\nDraw rate by total goals:');
for (let g = 0; g <= 6; g++) {
  const matches = allMatches.filter(m => m.homeGoals + m.awayGoals === g);
  const drawCount = matches.filter(m => m.winner === 'DRAW').length;
  if (matches.length > 0)
    console.log(`  ${g} goals: ${drawCount}/${matches.length} = ${(drawCount/matches.length*100).toFixed(1)}% draws`);
}

// Key finding: what's the avg draw odds probability?
const avgDrawProb = oddsDraws.reduce((s, m) => {
  const t = 1/m.odds.avg.home + 1/m.odds.avg.draw + 1/m.odds.avg.away;
  return s + (1/m.odds.avg.draw)/t;
}, 0) / oddsDraws.length;
console.log(`\nAverage implied draw probability: ${(avgDrawProb*100).toFixed(1)}%`);
console.log(`Actual draw rate: ${(draws.length/allMatches.length*100).toFixed(1)}%`);
