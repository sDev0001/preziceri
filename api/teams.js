const { getEnsemble } = require('./shared');

module.exports = (req, res) => {
  try {
    const { ensemble } = getEnsemble();
    res.json(Object.keys(ensemble.dcStrengths).sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
