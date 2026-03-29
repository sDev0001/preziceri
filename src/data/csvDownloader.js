/**
 * Downloads historical match CSV data from football-data.co.uk.
 * Free, no API key required. Data available from 1993/94 season.
 * Includes: match results, stats (shots, corners, fouls, cards), betting odds.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CSV_DIR = path.join(__dirname, '..', '..', 'data', 'csv');

/**
 * Convert season start year to football-data.co.uk URL format.
 * 2023 -> "2324", 2005 -> "0506"
 */
function seasonCode(year) {
  const start = String(year).slice(-2);
  const end = String(year + 1).slice(-2);
  return start + end;
}

/**
 * Download a CSV file for a given season.
 * @param {number} season - Season start year (e.g. 2023 for 2023/24)
 * @param {string} league - League code: E0=PL, E1=Championship, SP1=LaLiga, D1=Bundesliga, I1=SerieA, F1=Ligue1
 * @returns {string} Raw CSV content
 */
async function downloadCSV(season, league = 'E0') {
  const code = seasonCode(season);
  const url = `https://www.football-data.co.uk/mmz4281/${code}/${league}.csv`;

  console.log(`  Downloading ${league} ${season}/${season + 1} from ${url}...`);

  const response = await axios.get(url, {
    responseType: 'text',
    timeout: 15000,
  });

  return response.data;
}

/**
 * Download and save CSV for a season. Returns cached if exists.
 * @param {number} season
 * @param {string} league
 * @param {boolean} forceRefresh
 * @returns {string} CSV content
 */
async function fetchCSV(season, league = 'E0', forceRefresh = false) {
  if (!fs.existsSync(CSV_DIR)) {
    fs.mkdirSync(CSV_DIR, { recursive: true });
  }

  const filePath = path.join(CSV_DIR, `${league}_${season}.csv`);

  if (!forceRefresh && fs.existsSync(filePath)) {
    console.log(`  Loaded CSV from cache: ${league} ${season}`);
    return fs.readFileSync(filePath, 'utf-8');
  }

  const csv = await downloadCSV(season, league);
  fs.writeFileSync(filePath, csv, 'utf-8');
  console.log(`  Saved CSV: ${filePath}`);
  return csv;
}

/**
 * Download multiple seasons. Returns array of CSV strings.
 */
async function fetchMultipleSeasons(seasons, league = 'E0') {
  const results = [];
  for (const season of seasons) {
    try {
      const csv = await fetchCSV(season, league);
      results.push({ season, csv });
    } catch (err) {
      console.log(`  Season ${season}: SKIPPED (${err.response?.status || err.message})`);
    }
  }
  return results;
}

module.exports = {
  downloadCSV,
  fetchCSV,
  fetchMultipleSeasons,
  CSV_DIR,
};
