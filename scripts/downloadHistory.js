const { fetchAndCache } = require('../src/cache/matchCache');

const LEAGUE = process.argv[2] || 'PL';

// Free tier has limited season access - try recent seasons
const SEASONS = process.argv.slice(3).map(Number);
const DEFAULT_SEASONS = [2024, 2023, 2022];

async function main() {
  const seasons = SEASONS.length > 0 ? SEASONS : DEFAULT_SEASONS;
  console.log(`Downloading ${LEAGUE} history for seasons: ${seasons.join(', ')}\n`);

  for (const season of seasons) {
    try {
      await fetchAndCache(LEAGUE, season);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      console.log(`  Season ${season}: SKIPPED (${status} - ${msg})`);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err.message);
});
