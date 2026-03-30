const { getEnsemble, findTeam, generateLikelyScores } = require('./shared');

module.exports = async (req, res) => {
  try {
    const { ensemble } = getEnsemble();
    const teams = ensemble.dcStrengths;

    // Try to fetch upcoming matches from football-data.org API
    let upcoming = [];
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;

    if (apiKey) {
      try {
        const axios = require('axios');
        const response = await axios.get('https://api.football-data.org/v4/competitions/PL/matches', {
          headers: { 'X-Auth-Token': apiKey },
          params: { status: 'SCHEDULED' },
          timeout: 10000,
        });
        upcoming = response.data.matches || [];
      } catch (apiErr) {
        // API unavailable - return empty with message
        return res.json({ error: null, matches: [], message: 'API football-data.org nu e disponibil. Adauga FOOTBALL_DATA_API_KEY in Vercel Environment Variables.' });
      }
    } else {
      return res.json({ error: null, matches: [], message: 'Adauga FOOTBALL_DATA_API_KEY in Vercel Settings > Environment Variables pentru meciuri viitoare.' });
    }

    const predictions = [];
    for (const m of upcoming) {
      const homeName = m.homeTeam.shortName || m.homeTeam.name;
      const awayName = m.awayTeam.shortName || m.awayTeam.name;
      const homeKey = findTeam(teams, homeName);
      const awayKey = findTeam(teams, awayName);

      const entry = {
        matchday: m.matchday,
        date: m.utcDate.slice(0, 10),
        homeTeam: homeName,
        awayTeam: awayName,
        prediction: null,
      };

      if (homeKey && awayKey) {
        const result = ensemble.predict(homeKey, awayKey);
        entry.homeTeam = homeKey;
        entry.awayTeam = awayKey;
        entry.prediction = {
          homeWin: +(result.outcomes.homeWin * 100).toFixed(1),
          draw: +(result.outcomes.draw * 100).toFixed(1),
          awayWin: +(result.outcomes.awayWin * 100).toFixed(1),
          topScore: generateLikelyScores(result.expectedGoals.home, result.expectedGoals.away)[0]?.score || '1-1',
          expectedGoals: result.expectedGoals,
          eloRatings: result.eloRatings,
        };
      }

      predictions.push(entry);
    }

    res.json(predictions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
