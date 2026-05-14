const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_REPORT_DIR = path.join(ROOT, '黄成喆个人数据趋势', '每日 近七天 数据趋势');
const AUTO_RE = /^黄成喆_今日数据沉淀_自动版_(\d{4}-\d{2}-\d{2})\.html$/;
const CANONICAL_RE = /^\d{4}-\d{2}-\d{2}\.html$/;

function normalizeDailyReportNames(reportDir = DEFAULT_REPORT_DIR, options = {}) {
  const dryRun = options.dryRun === true;
  if (!fs.existsSync(reportDir)) {
    throw new Error(`Report directory not found: ${reportDir}`);
  }

  const resolvedDir = path.resolve(reportDir);
  const files = fs.readdirSync(resolvedDir);
  const canonical = new Set(files.filter(name => CANONICAL_RE.test(name)));
  const actions = [];

  for (const name of files) {
    const match = name.match(AUTO_RE);
    if (!match) continue;

    const date = match[1];
    const source = path.join(resolvedDir, name);
    const targetName = `${date}.html`;
    const target = path.join(resolvedDir, targetName);

    if (!canonical.has(targetName)) {
      actions.push({ type: 'copy_to_canonical', source, target });
      if (!dryRun) {
        fs.copyFileSync(source, target);
        canonical.add(targetName);
      }
    }

    actions.push({ type: 'delete_legacy_auto_name', source });
    if (!dryRun) fs.unlinkSync(source);
  }

  return {
    reportDir: resolvedDir,
    actions,
    remainingLegacyFiles: fs.readdirSync(resolvedDir).filter(name => AUTO_RE.test(name)),
    canonicalFiles: fs.readdirSync(resolvedDir).filter(name => CANONICAL_RE.test(name)).sort(),
  };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reportDir = args.find(arg => !arg.startsWith('--')) || DEFAULT_REPORT_DIR;
  const result = normalizeDailyReportNames(reportDir, { dryRun });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeDailyReportNames,
};
