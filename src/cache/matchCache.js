const fs = require('fs');
const path = require('path');
const { getMatches } = require('../api/footballData');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function getCachePath(league, season) {
  return path.join(DATA_DIR, `${league}_${season}.json`);
}

/**
 * Load cached matches from disk. Returns null if no cache exists.
 */
function loadCachedMatches(league, season) {
  const filePath = getCachePath(league, season);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Save matches to cache on disk.
 */
function saveCachedMatches(league, season, matches) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const filePath = getCachePath(league, season);
  fs.writeFileSync(filePath, JSON.stringify(matches, null, 2), 'utf-8');
  console.log(`Cached ${matches.length} matches to ${filePath}`);
}

/**
 * Fetch matches from API and cache them. If cache exists, return cached data.
 * @param {string} league
 * @param {number} season
 * @param {boolean} forceRefresh - If true, ignore cache and re-download
 * @returns {Array} Match objects
 */
async function fetchAndCache(league, season, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = loadCachedMatches(league, season);
    if (cached) {
      console.log(`Loaded ${cached.length} matches from cache (${league} ${season})`);
      return cached;
    }
  }

  console.log(`Downloading ${league} ${season} from API...`);
  const matches = await getMatches(league, season);

  // Keep only the fields we need to save space
  const slim = matches.map(m => ({
    id: m.id,
    date: m.utcDate,
    matchday: m.matchday,
    homeTeam: {
      id: m.homeTeam.id,
      name: m.homeTeam.name,
      shortName: m.homeTeam.shortName || m.homeTeam.name,
    },
    awayTeam: {
      id: m.awayTeam.id,
      name: m.awayTeam.name,
      shortName: m.awayTeam.shortName || m.awayTeam.name,
    },
    homeGoals: m.score.fullTime.home,
    awayGoals: m.score.fullTime.away,
    winner: m.score.winner, // HOME_TEAM, AWAY_TEAM, DRAW
  }));

  saveCachedMatches(league, season, slim);
  return slim;
}

/**
 * Load multiple seasons of matches for a league.
 * @param {string} league
 * @param {number[]} seasons - Array of season start years
 * @returns {Array} All matches combined, sorted by date
 */
async function loadMultipleSeasons(league, seasons) {
  const allMatches = [];
  for (const season of seasons) {
    const matches = await fetchAndCache(league, season);
    allMatches.push(...matches);
  }
  return allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = {
  loadCachedMatches,
  fetchAndCache,
  loadMultipleSeasons,
};
