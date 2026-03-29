const { fetchMultipleSeasons } = require('../src/data/csvDownloader');
const { parseMatchCSV } = require('../src/data/csvParser');
const fs = require('fs');
const path = require('path');

// Download PL seasons from 2005 to 2024
const SEASONS = [];
for (let y = 2005; y <= 2024; y++) SEASONS.push(y);

async function main() {
  console.log(`Downloading ${SEASONS.length} seasons of Premier League data...\n`);

  const results = await fetchMultipleSeasons(SEASONS, 'E0');

  console.log(`\nDownloaded ${results.length} seasons. Parsing...\n`);

  let totalMatches = 0;
  const cacheDir = path.join(__dirname, '..', 'data', 'csv');

  for (const { season, csv } of results) {
    const matches = parseMatchCSV(csv, season);
    totalMatches += matches.length;

    // Save parsed JSON
    const jsonPath = path.join(cacheDir, `E0_${season}_parsed.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(matches, null, 2), 'utf-8');

    // Show sample
    const sample = matches[0];
    const hasStats = sample?.stats?.homeShots !== null;
    const hasOdds = sample?.odds?.b365?.home !== null;
    console.log(`  ${season}/${season + 1}: ${matches.length} matches | Stats: ${hasStats ? 'YES' : 'NO'} | Odds: ${hasOdds ? 'YES' : 'NO'}`);
  }

  console.log(`\nTotal: ${totalMatches} matches across ${results.length} seasons`);
}

main().catch(err => console.error('Error:', err.message));
