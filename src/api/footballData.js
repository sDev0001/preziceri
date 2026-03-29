const axios = require('axios');
const { API_KEY, BASE_URL, RATE_LIMIT_MS } = require('../config');

let lastRequestTime = 0;

/**
 * Wait if needed to respect rate limit (10 req/min).
 */
async function rateLimitWait() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Make an authenticated GET request to football-data.org API.
 */
async function apiGet(endpoint, params = {}) {
  await rateLimitWait();

  const response = await axios.get(`${BASE_URL}${endpoint}`, {
    headers: { 'X-Auth-Token': API_KEY },
    params,
  });

  return response.data;
}

/**
 * Get all finished matches for a league in a given season.
 * @param {string} league - League code (e.g. 'PL')
 * @param {number} season - Season start year (e.g. 2023 for 2023/24)
 * @returns {Array} Array of match objects
 */
async function getMatches(league, season) {
  const data = await apiGet(`/competitions/${league}/matches`, {
    season,
    status: 'FINISHED',
  });
  return data.matches;
}

/**
 * Get standings for a league in a given season.
 * @param {string} league - League code (e.g. 'PL')
 * @param {number} season - Season start year
 * @returns {Array} Standings table
 */
async function getStandings(league, season) {
  const data = await apiGet(`/competitions/${league}/standings`, { season });
  return data.standings;
}

/**
 * Get upcoming (scheduled) matches for a league.
 * @param {string} league - League code
 * @returns {Array} Array of upcoming match objects
 */
async function getUpcomingMatches(league) {
  const data = await apiGet(`/competitions/${league}/matches`, {
    status: 'SCHEDULED',
  });
  return data.matches;
}

/**
 * Get team details by ID.
 * @param {number} teamId
 * @returns {Object} Team info
 */
async function getTeam(teamId) {
  return apiGet(`/teams/${teamId}`);
}

module.exports = {
  getMatches,
  getStandings,
  getUpcomingMatches,
  getTeam,
};
