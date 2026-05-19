const path = require('path');
const { readFileSync } = require('fs');
const { run } = require('../../auto_adjust');
const {
  appendAdjustmentRecords,
  recordsFromExecutionEvents,
  recordsFromPlan,
} = require('../../src/adjustment_log');

function readJson(file, fallback) {
  if (!file) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function persistAdjustmentLog(result) {
  const timeContext = result?.report?.time || result?.dryReport?.time || {};
  if (!timeContext.businessDate || !timeContext.sourceRunId) return null;

  if (result.mode === 'dry-run') {
    const plan = readJson(result.files?.planFile, []);
    return appendAdjustmentRecords(recordsFromPlan(plan, timeContext, { dryRun: true }), { timeContext });
  }

  if (result.mode === 'execute') {
    const verify = readJson(result.files?.verifyFile, {});
    return appendAdjustmentRecords(
      recordsFromExecutionEvents([...(verify.events || []), ...(verify.nonExecutionEvents || [])], timeContext),
      { timeContext }
    );
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const hasDryRunFlag = args.includes('--dry-run');
  const hasExecuteFlag = args.includes('--execute');
  const hasFastScopeFlag = args.includes('--fast-scope');
  const hasFullScopeFlag = args.includes('--full-scope');
  if (hasDryRunFlag && hasExecuteFlag) {
    throw new Error('choose either --dry-run or --execute');
  }
  if (hasFastScopeFlag && hasFullScopeFlag) {
    throw new Error('choose either --fast-scope or --full-scope');
  }
  const actionSchemaFile = args.find(arg => !arg.startsWith('--')) || process.env.ACTION_SCHEMA_FILE || '';
  if (!actionSchemaFile) {
    throw new Error('missing action schema file path: pass argv[2] or ACTION_SCHEMA_FILE');
  }
  const snapshotArgIndex = args.findIndex(arg => arg === '--snapshot');
  const snapshotFile = snapshotArgIndex >= 0
    ? args[snapshotArgIndex + 1]
    : (args.find(arg => arg.startsWith('--snapshot=')) || '').slice('--snapshot='.length) || process.env.PANEL_SNAPSHOT_FILE || '';

  const result = await run({
    actionSchemaFile: path.resolve(actionSchemaFile),
    snapshotFile: snapshotFile ? path.resolve(snapshotFile) : '',
    dryRun: hasExecuteFlag ? false : (hasDryRunFlag ? true : undefined),
    fastScope: hasFullScopeFlag ? false : (hasFastScopeFlag ? true : undefined),
  });
  const logResult = persistAdjustmentLog(result);
  if (logResult?.count) {
    console.log(`[adjustment-log] appended ${logResult.count} records to ${logResult.file}`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
