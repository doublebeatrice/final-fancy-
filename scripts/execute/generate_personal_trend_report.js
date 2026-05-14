const fs = require('fs');
const path = require('path');
const { generateReport } = require('./generate_personal_trend_report_v2');

const ROOT = path.join(__dirname, '..', '..');

function latestTaskBoardFile() {
  const taskDir = path.join(ROOT, 'data', 'tasks');
  if (!fs.existsSync(taskDir)) return null;
  const candidates = fs.readdirSync(taskDir)
    .filter(name => /^daily_task_board_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => path.join(taskDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || null;
}

function main() {
  const inputFile = process.argv[2] || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
  const outDir = process.argv[3] || path.join(ROOT, '黄成喆个人数据趋势', '每日 近七天 数据趋势');
  const taskFile = latestTaskBoardFile() || path.join(ROOT, 'data', 'tasks', 'daily_task_board_2026-05-13.json');
  const outFile = generateReport({ inputFile, taskFile, outDir });
  console.log(outFile);
}

if (require.main === module) {
  main();
}
