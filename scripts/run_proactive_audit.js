const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const { buildProactiveOperatingAudit, renderProactiveOperatingAuditHtml } = require('../src/proactive_audit');

const ROOT = path.join(__dirname, '..');
const TASK_DIR = path.join(ROOT, 'data', 'tasks');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    snapshot: get('--snapshot') || process.env.TODAY_TASK_SNAPSHOT || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
  };
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function main() {
  const options = parseArgs(process.argv);
  const snapshotFile = path.resolve(options.snapshot);
  const snapshot = readJson(snapshotFile, null);
  if (!snapshot || !Array.isArray(snapshot.productCards) || snapshot.productCards.length === 0) {
    throw new Error(`missing usable non-empty snapshot with productCards: ${snapshotFile}`);
  }

  const timeContext = buildOpsTimeContext({ site: options.site });
  const audit = buildProactiveOperatingAudit({ snapshot, timeContext });
  audit.snapshotFile = snapshotFile;

  fs.mkdirSync(TASK_DIR, { recursive: true });
  const jsonFile = path.join(TASK_DIR, `proactive_operating_audit_${timeContext.businessDate}.json`);
  const htmlFile = path.join(TASK_DIR, `proactive_operating_audit_${timeContext.businessDate}.html`);
  writeJson(jsonFile, audit);
  fs.writeFileSync(htmlFile, renderProactiveOperatingAuditHtml(audit), 'utf8');
  console.log(JSON.stringify({
    jsonFile,
    htmlFile,
    businessDate: timeContext.businessDate,
    kpiStatus: audit.kpi.status,
    newProductLaunch: audit.newProductLaunch.summary.total,
    arrivalAdRecovery: audit.arrivalAdRecovery.summary.total,
    priceActions: audit.priceActions.summary.total,
    removalEconomics: audit.removalEconomics.summary.total,
    expiredSeasonKeywordWaste: audit.expiredSeasonKeywordWaste.summary.totalEnabledRows,
    listingRepair: audit.listingRepair.summary.total,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { main };
