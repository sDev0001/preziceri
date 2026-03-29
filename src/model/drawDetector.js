/**
 * Draw Detector module v2.
 *
 * Key insight: standard models NEVER predict draws because draw probability
 * almost never exceeds both homeWin and awayWin simultaneously.
 *
 * Strategy: Use a two-step approach:
 * 1. Boost draw probability based on team closeness (soft adjustment)
 * 2. When conditions strongly suggest a draw, make draw the prediction
 *    by setting it just above the max of homeWin/awayWin
 *
 * Data analysis shows:
 * - 24.2% of PL matches are draws
 * - When teams are very close (prob diff < 0.05), ~29% are draws
 * - Draw is more likely when both teams score ~1-1.5 goals on average
 */

/**
 * Adjust probabilities to better predict draws.
 *
 * @param {Object} outcomes - { homeWin, draw, awayWin }
 * @param {Object} options
 * @param {number} options.drawBoostStrength - Soft boost (0-1)
 * @param {number} options.drawThreshold - When draw prob exceeds this AND match is close, predict draw
 * @returns {Object} Adjusted { homeWin, draw, awayWin }
 */
function adjustForDraws(outcomes, options = {}) {
  const {
    drawBoostStrength = 0.5,
    drawThreshold = 0.27,
  } = options;

  let { homeWin, draw, awayWin } = outcomes;

  const probDiff = Math.abs(homeWin - awayWin);

  // Historical draw rates by closeness
  let expectedDrawRate;
  if (probDiff < 0.05) expectedDrawRate = 0.29;
  else if (probDiff < 0.10) expectedDrawRate = 0.285;
  else if (probDiff < 0.15) expectedDrawRate = 0.26;
  else if (probDiff < 0.20) expectedDrawRate = 0.255;
  else if (probDiff < 0.30) expectedDrawRate = 0.245;
  else if (probDiff < 0.40) expectedDrawRate = 0.225;
  else if (probDiff < 0.50) expectedDrawRate = 0.200;
  else expectedDrawRate = 0.170;

  // Step 1: Soft boost - always blend toward expected draw rate
  if (draw < expectedDrawRate) {
    const targetDraw = draw + (expectedDrawRate - draw) * drawBoostStrength;
    const drawIncrease = targetDraw - draw;
    const winTotal = homeWin + awayWin;
    if (winTotal > 0) {
      homeWin -= drawIncrease * (homeWin / winTotal);
      awayWin -= drawIncrease * (awayWin / winTotal);
    }
    draw = targetDraw;
  }

  // Step 2: Force draw prediction when conditions are strong
  // When teams are close enough, swap draw to be the top prediction
  const maxWin = Math.max(homeWin, awayWin);
  const minWin = Math.min(homeWin, awayWin);

  // Condition: match is close (small diff between favorites) AND draw prob is meaningful
  if (drawBoostStrength > 0 && probDiff < drawThreshold && draw > 0.24) {
    // Make draw the highest by swapping with max
    const newDraw = maxWin;
    const reduction = newDraw - draw;
    // Take reduction proportionally from win probs
    homeWin -= reduction * (homeWin / (homeWin + awayWin));
    awayWin -= reduction * (awayWin / (homeWin + awayWin + reduction));
    draw = newDraw;
  }

  // Normalize
  const total = homeWin + draw + awayWin;
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  };
}

module.exports = {
  adjustForDraws,
};
