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

function defaultOutDir() {
  return path.join(
    ROOT,
    '\u9ec4\u6210\u5586\u4e2a\u4eba\u6570\u636e\u8d8b\u52bf',
    '\u6bcf\u65e5 \u8fd1\u4e03\u5929 \u6570\u636e\u8d8b\u52bf',
  );
}

function main() {
  const args = process.argv.slice(2);
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (String(args[i]).startsWith('--')) {
      if (args[i + 1] && !String(args[i + 1]).startsWith('--')) i += 1;
    } else {
      positional.push(args[i]);
    }
  }
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const inputFile = get('--snapshot') || positional[0] || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
  const outDir = get('--out-dir') || positional[1] || defaultOutDir();
  const date = get('--date') || '';
  const taskFile = latestTaskBoardFile() || path.join(ROOT, 'data', 'tasks', 'daily_task_board_2026-05-13.json');
  const outFile = generateReport({ inputFile, taskFile, outDir, date });
  console.log(outFile);
}

if (require.main === module) {
  main();
}
