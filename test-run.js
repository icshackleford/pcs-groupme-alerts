const { runOnce } = require('./index');

async function main() {
  try {
    await runOnce();
  } catch (err) {
    console.error('Test run failed:', err);
    process.exit(1);
  }
}

main();


