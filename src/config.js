require('dotenv').config();

module.exports = {
  API_KEY: process.env.FOOTBALL_DATA_API_KEY,
  BASE_URL: 'https://api.football-data.org/v4',

  // League codes for football-data.org
  LEAGUES: {
    PL: 'PL',       // Premier League
    PD: 'PD',       // La Liga
    SA: 'SA',       // Serie A
    BL1: 'BL1',     // Bundesliga
    FL1: 'FL1',     // Ligue 1
    CL: 'CL',       // Champions League
  },

  // Rate limit: 10 requests per minute on free tier
  RATE_LIMIT_MS: 6500, // ~6.5 seconds between requests to stay safe

  // v2 model parameters (used as fallback when no odds available)
  MODEL: {
    XI: 0.001,
    RHO: -0.13,
    ENHANCED: true,
    FORM_WINDOW: 6,
    DAMPING: { form: 0, momentum: 0, h2h: 0, stats: 0.10 },
  },

  // v3 Ensemble parameters (optimized via grid search on 7600 matches)
  ENSEMBLE: {
    WEIGHTS: { dixonColes: 0.10, elo: 0.10, odds: 0.80 },
    ELO_K: 30,
    ELO_HOME_ADVANTAGE: 50,
    STATS_DAMPING: 0.10,
    DRAW_BOOST_STRENGTH: 0.5,
    DRAW_THRESHOLD: 0.05,   // Only force draw for very close matches
    REFEREE_DAMPING: 0.15,
    // CSV seasons to load (football-data.co.uk)
    CSV_SEASONS: Array.from({ length: 20 }, (_, i) => 2005 + i),
  },

  // API seasons available on free tier
  AVAILABLE_SEASONS: [2023, 2024],
};
