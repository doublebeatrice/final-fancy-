const path = require('path');
const { run } = require('../../auto_adjust');

async function main() {
  const args = process.argv.slice(2);
  const hasDryRunFlag = args.includes('--dry-run');
  const hasExecuteFlag = args.includes('--execute');
  if (hasDryRunFlag && hasExecuteFlag) {
    throw new Error('choose either --dry-run or --execute');
  }
  const actionSchemaFile = args.find(arg => !arg.startsWith('--')) || process.env.ACTION_SCHEMA_FILE || '';
  if (!actionSchemaFile) {
    throw new Error('missing action schema file path: pass argv[2] or ACTION_SCHEMA_FILE');
  }
  const snapshotArgIndex = args.findIndex(arg => arg === '--snapshot');
  const snapshotFile = snapshotArgIndex >= 0
    ? args[snapshotArgIndex + 1]
    : (args.find(arg => arg.startsWith('--snapshot=')) || '').slice('--snapshot='.length) || process.env.PANEL_SNAPSHOT_FILE || '';

  await run({
    actionSchemaFile: path.resolve(actionSchemaFile),
    snapshotFile: snapshotFile ? path.resolve(snapshotFile) : '',
    dryRun: hasExecuteFlag ? false : (hasDryRunFlag ? true : undefined),
  });
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
