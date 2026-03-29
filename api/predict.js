const { getEnsemble, findTeam, generateLikelyScores } = require('./shared');
const { calculateRecentForm } = require('../src/stats/recentForm');
const { calculateMomentum } = require('../src/stats/momentum');
const { calculateH2H } = require('../src/stats/headToHead');
const { calculateMatchStats } = require('../src/stats/matchStats');
const { MODEL } = require('../src/config');

module.exports = (req, res) => {
  try {
    const { home, away } = req.query;
    if (!home || !away) return res.status(400).json({ error: 'home and away required' });

    const { ensemble, csvMatches } = getEnsemble();
    const teams = ensemble.dcStrengths;
    const homeKey = findTeam(teams, home);
    const awayKey = findTeam(teams, away);

    if (!homeKey) return res.status(404).json({ error: `Team not found: ${home}`, teams: Object.keys(teams).sort() });
    if (!awayKey) return res.status(404).json({ error: `Team not found: ${away}`, teams: Object.keys(teams).sort() });

    const result = ensemble.predict(homeKey, awayKey);

    const homeForm = calculateRecentForm(csvMatches, homeKey, MODEL.FORM_WINDOW);
    const awayForm = calculateRecentForm(csvMatches, awayKey, MODEL.FORM_WINDOW);
    const homeMomentum = calculateMomentum(csvMatches, homeKey);
    const awayMomentum = calculateMomentum(csvMatches, awayKey);
    const h2h = calculateH2H(csvMatches, homeKey, awayKey);
    const homeStats = calculateMatchStats(csvMatches, homeKey);
    const awayStats = calculateMatchStats(csvMatches, awayKey);

    res.json({
      homeTeam: homeKey,
      awayTeam: awayKey,
      expectedGoals: result.expectedGoals,
      outcomes: {
        homeWin: +(result.outcomes.homeWin * 100).toFixed(1),
        draw: +(result.outcomes.draw * 100).toFixed(1),
        awayWin: +(result.outcomes.awayWin * 100).toFixed(1),
      },
      likelyScores: generateLikelyScores(result.expectedGoals.home, result.expectedGoals.away),
      eloRatings: result.eloRatings,
      models: {
        dixonColes: result.models.dixonColes ? {
          homeWin: +(result.models.dixonColes.homeWin * 100).toFixed(1),
          draw: +(result.models.dixonColes.draw * 100).toFixed(1),
          awayWin: +(result.models.dixonColes.awayWin * 100).toFixed(1),
        } : null,
        elo: {
          homeWin: +(result.models.elo.homeWin * 100).toFixed(1),
          draw: +(result.models.elo.draw * 100).toFixed(1),
          awayWin: +(result.models.elo.awayWin * 100).toFixed(1),
        },
        odds: result.models.odds ? {
          homeWin: +(result.models.odds.homeWin * 100).toFixed(1),
          draw: +(result.models.odds.draw * 100).toFixed(1),
          awayWin: +(result.models.odds.awayWin * 100).toFixed(1),
        } : null,
      },
      analysis: {
        homeForm: homeForm.details,
        awayForm: awayForm.details,
        homeMomentum: homeMomentum.details,
        awayMomentum: awayMomentum.details,
        h2h: h2h.details,
        homeStats,
        awayStats,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
