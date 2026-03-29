/**
 * Parses football-data.co.uk CSV files into structured match objects.
 * Handles team name normalization and extracts all useful fields.
 */

const fs = require('fs');
const path = require('path');

// Normalize team names to match our existing data (shortNames from football-data.org API)
const TEAM_NAME_MAP = {
  'Man United': 'Man United',
  'Manchester United': 'Man United',
  'Man City': 'Man City',
  'Manchester City': 'Man City',
  'Nott\'m Forest': 'Nottingham',
  'Nottingham Forest': 'Nottingham',
  'Nottm Forest': 'Nottingham',
  'Newcastle': 'Newcastle',
  'Newcastle United': 'Newcastle',
  'Wolves': 'Wolverhampton',
  'Wolverhampton': 'Wolverhampton',
  'Wolverhampton Wanderers': 'Wolverhampton',
  'Brighton': 'Brighton Hove',
  'Brighton and Hove Albion': 'Brighton Hove',
  'Sheffield United': 'Sheffield Utd',
  'Sheffield Utd': 'Sheffield Utd',
  'West Brom': 'West Brom',
  'West Bromwich Albion': 'West Brom',
  'Tottenham': 'Tottenham',
  'Tottenham Hotspur': 'Tottenham',
  'Leicester': 'Leicester City',
  'Leicester City': 'Leicester City',
  'Leeds': 'Leeds United',
  'Leeds United': 'Leeds United',
  'Ipswich': 'Ipswich Town',
  'Ipswich Town': 'Ipswich Town',
  'Luton': 'Luton Town',
  'Luton Town': 'Luton Town',
  'QPR': 'QPR',
  'Queens Park Rangers': 'QPR',
  'Swansea': 'Swansea',
  'Swansea City': 'Swansea',
  'Hull': 'Hull City',
  'Hull City': 'Hull City',
  'Cardiff': 'Cardiff City',
  'Cardiff City': 'Cardiff City',
  'Stoke': 'Stoke City',
  'Stoke City': 'Stoke City',
  'Sunderland': 'Sunderland',
};

function normalizeTeam(name) {
  return TEAM_NAME_MAP[name] || name;
}

/**
 * Parse a CSV string into array of objects.
 */
function parseCSV(csvString) {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) return [];

  // Handle BOM
  let header = lines[0].replace(/^\uFEFF/, '');
  const headers = header.split(',').map(h => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (values[j] || '').trim();
    }
    rows.push(obj);
  }

  return rows;
}

/**
 * Convert parsed CSV row into our match format.
 */
function csvRowToMatch(row, season) {
  // Parse date (DD/MM/YYYY or DD/MM/YY)
  const dateParts = (row.Date || '').split('/');
  let dateStr = '';
  if (dateParts.length === 3) {
    let year = dateParts[2];
    if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
    dateStr = `${year}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
  }

  const homeGoals = parseInt(row.FTHG) || 0;
  const awayGoals = parseInt(row.FTAG) || 0;
  let winner = 'DRAW';
  if (row.FTR === 'H') winner = 'HOME_TEAM';
  else if (row.FTR === 'A') winner = 'AWAY_TEAM';

  // Parse numeric fields safely
  const num = (val) => { const n = parseFloat(val); return isNaN(n) ? null : n; };

  return {
    season,
    date: dateStr + 'T15:00:00Z',
    homeTeam: { shortName: normalizeTeam(row.HomeTeam || '') },
    awayTeam: { shortName: normalizeTeam(row.AwayTeam || '') },
    homeGoals,
    awayGoals,
    winner,

    // Half time
    halfTime: {
      homeGoals: parseInt(row.HTHG) || 0,
      awayGoals: parseInt(row.HTAG) || 0,
    },

    // Match statistics
    stats: {
      homeShots: num(row.HS),
      awayShots: num(row.AS),
      homeShotsOnTarget: num(row.HST),
      awayShotsOnTarget: num(row.AST),
      homeCorners: num(row.HC),
      awayCorners: num(row.AC),
      homeFouls: num(row.HF),
      awayFouls: num(row.AF),
      homeYellow: num(row.HY),
      awayYellow: num(row.AY),
      homeRed: num(row.HR),
      awayRed: num(row.AR),
    },

    // Referee
    referee: row.Referee || null,

    // Betting odds (multiple bookmakers)
    odds: {
      b365: { home: num(row.B365H), draw: num(row.B365D), away: num(row.B365A) },
      bw: { home: num(row.BWH), draw: num(row.BWD), away: num(row.BWA) },
      iw: { home: num(row.IWH), draw: num(row.IWD), away: num(row.IWA) },
      ps: { home: num(row.PSH), draw: num(row.PSD), away: num(row.PSA) },
      wh: { home: num(row.WHH), draw: num(row.WHD), away: num(row.WHA) },
      vc: { home: num(row.VCH), draw: num(row.VCD), away: num(row.VCA) },
      // Averages across bookmakers
      avg: { home: num(row.AvgH), draw: num(row.AvgD), away: num(row.AvgA) },
      max: { home: num(row.MaxH), draw: num(row.MaxD), away: num(row.MaxA) },
    },
  };
}

/**
 * Parse a full CSV string into array of match objects.
 */
function parseMatchCSV(csvString, season) {
  const rows = parseCSV(csvString);
  return rows
    .map(row => csvRowToMatch(row, season))
    .filter(m => m.homeTeam.shortName && m.awayTeam.shortName && m.date);
}

/**
 * Load parsed matches from cache or parse fresh.
 */
function loadParsedMatches(season, league = 'E0') {
  const cacheDir = path.join(__dirname, '..', '..', 'data', 'csv');
  const cachePath = path.join(cacheDir, `${league}_${season}_parsed.json`);

  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }

  const csvPath = path.join(cacheDir, `${league}_${season}.csv`);
  if (!fs.existsSync(csvPath)) return null;

  const csv = fs.readFileSync(csvPath, 'utf-8');
  const matches = parseMatchCSV(csv, season);

  // Try to cache parsed result (fails on read-only filesystems like Vercel)
  try {
    fs.writeFileSync(cachePath, JSON.stringify(matches, null, 2), 'utf-8');
  } catch (e) {
    // Read-only filesystem - skip caching
  }
  return matches;
}

/**
 * Load multiple seasons of parsed CSV matches.
 */
function loadAllCSVMatches(seasons, league = 'E0') {
  const all = [];
  for (const season of seasons) {
    const matches = loadParsedMatches(season, league);
    if (matches) {
      all.push(...matches);
    }
  }
  return all.sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = {
  parseCSV,
  parseMatchCSV,
  loadParsedMatches,
  loadAllCSVMatches,
  normalizeTeam,
};
