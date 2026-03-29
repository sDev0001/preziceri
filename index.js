const {
  commandPredict,
  commandUpcoming,
  commandBacktest,
  commandOptimize,
  commandTeams,
  commandRefresh,
  printUsage,
} = require('./src/cli');

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'predict': {
      const league = args[2] || 'PL';
      if (args.length < 2) {
        console.error('Usage: node index.js predict <home> <away> [league]');
        process.exit(1);
      }
      await commandPredict(args[0], args[1], league);
      break;
    }
    case 'upcoming':
      await commandUpcoming(args[0] || 'PL');
      break;
    case 'backtest':
      await commandBacktest(args[0] || 'PL');
      break;
    case 'optimize':
      await commandOptimize(args[0] || 'PL');
      break;
    case 'teams':
      await commandTeams(args[0] || 'PL');
      break;
    case 'refresh':
      await commandRefresh(args[0] || 'PL');
      break;
    default:
      printUsage();
      break;
  }
}

main().catch(err => {
  console.error('Error:', err.response?.data?.message || err.message);
  process.exit(1);
});
