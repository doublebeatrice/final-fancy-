const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const { buildDailyTaskPool } = require('../src/task_scheduler');
const { buildDailyTaskBoard } = require('../src/task_board');
const { buildSeasonGapAudit } = require('../src/season_gap_audit');

const snapshotFile = process.argv[2];
const businessDate = process.argv[3] || '2026-05-06';
const outJson = process.argv[4] || path.join('data', 'tasks', `season_gap_audit_${businessDate}.json`);
const outMd = process.argv[5] || path.join('data', 'tasks', `season_gap_audit_${businessDate}.md`);

if (!snapshotFile) {
  throw new Error('Usage: node scripts/generate_season_gap_audit.js <snapshot.json> [YYYY-MM-DD] [out.json] [out.md]');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function renderMarkdown(audit) {
  const lines = [
    `# Season Gap Audit ${audit.businessDate}`,
    '',
    `Data date: ${audit.dataDate || 'unknown'} (${audit.siteTimezone || 'unknown'})`,
    '',
    `- Active season tasks: ${audit.summary.activeSeasonTasks}`,
    `- Risk items: ${audit.summary.riskItems}`,
    `- Suppressed by main task limit: ${audit.summary.suppressedRiskItems}`,
    `- By risk type: ${Object.entries(audit.summary.byRiskType).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
    '',
    '| SKU | Risk | Season | Units 30d | Sellable Days | Profit | 7d Ads | Suppressed | Suggested Action |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];

  for (const item of audit.items.slice(0, 40)) {
    const seasons = item.seasonWindows.map(window => `${window.label}:${window.phase}`).join(', ');
    lines.push([
      item.sku,
      item.riskType,
      seasons,
      item.units30d,
      item.sellableDays,
      pct(item.profitRate),
      `${item.adSpend7d.toFixed(2)}/${item.adOrders7d}`,
      item.suppressedByMainTaskLimit ? 'yes' : 'no',
      item.suggestedAction,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return `${lines.join('\n')}\n`;
}

const snapshot = readJson(snapshotFile);
const time = buildOpsTimeContext({
  now: new Date(`${businessDate}T08:30:00.000Z`),
  site: 'Amazon.com',
  sourceRunId: `season_gap_audit_${businessDate}`,
});
const pool = buildDailyTaskPool({ snapshot, timeContext: time, adjustments: [] });
const board = buildDailyTaskBoard(pool, { mainTaskLimit: 200 });
const audit = buildSeasonGapAudit(board, { limit: 120 });

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(audit, null, 2), 'utf8');
fs.writeFileSync(outMd, renderMarkdown(audit), 'utf8');

console.log(JSON.stringify({
  outJson,
  outMd,
  summary: audit.summary,
  top: audit.items.slice(0, 12).map(item => ({
    sku: item.sku,
    riskType: item.riskType,
    season: item.seasonWindows.map(window => `${window.label}:${window.phase}`),
    units30d: item.units30d,
    sellableDays: item.sellableDays,
    suppressed: item.suppressedByMainTaskLimit,
  })),
}, null, 2));
