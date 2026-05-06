const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const { readAdjustmentLog } = require('../src/adjustment_log');
const { buildDailyTaskPool } = require('../src/task_scheduler');
const { buildDailyTaskBoard } = require('../src/task_board');

const ROOT = path.join(__dirname, '..');
const TASK_DIR = path.join(ROOT, 'data', 'tasks');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    snapshot: get('--snapshot') || process.env.TODAY_TASK_SNAPSHOT || '',
    aiDecisions: get('--ai-decisions') || process.env.AI_TASK_DECISION_FILE || '',
    dryRun: args.includes('--dry-run'),
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

function latestSnapshot() {
  const runsDir = path.join(ROOT, 'data', 'snapshots', 'runs');
  const candidates = [];
  if (fs.existsSync(runsDir)) {
    for (const run of fs.readdirSync(runsDir)) {
      const dir = path.join(runsDir, run);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of fs.readdirSync(dir)) {
        if (/^snapshot_\d{4}-\d{2}-\d{2}\.json$/.test(name)) candidates.push(path.join(dir, name));
      }
    }
  }
  const flatDir = path.join(ROOT, 'data', 'snapshots');
  if (fs.existsSync(flatDir)) {
    for (const name of fs.readdirSync(flatDir)) {
      if (/snapshot.*\d{4}-\d{2}-\d{2}\.json$/i.test(name)) candidates.push(path.join(flatDir, name));
    }
  }
  const sorted = candidates
    .filter(file => fs.existsSync(file) && fs.statSync(file).size > 3)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const file of sorted) {
    const snapshot = readJson(file, null);
    if (snapshot && Array.isArray(snapshot.productCards) && snapshot.productCards.length > 0) return file;
  }
  return '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(pool) {
  const rows = (pool.candidateContexts || pool.tasks || []).map(item => `
    <tr>
      <td>${escapeHtml(item.deterministicPriorityHint || '')}</td>
      <td>${escapeHtml((item.possibleSignals || []).map(signal => signal.type).join(', '))}</td>
      <td>${escapeHtml(item.guardrailInputs?.reservedPage ? 'reserved_page' : '')}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.asin)}</td>
      <td>${escapeHtml((item.possibleSignals || []).some(signal => signal.executableHint) ? 'hint_yes' : 'hint_no')}</td>
      <td>${escapeHtml((item.possibleSignals || []).map(signal => signal.reason).join(' | '))}</td>
      <td>${escapeHtml('AI decision layer will choose final action')}</td>
      <td>${escapeHtml((item.dataMissing || []).join(', '))}</td>
      <td>${escapeHtml(item.lastAdjustedAt || '')}</td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Daily Ad Ops Task Pool ${escapeHtml(pool.time.businessDate)}</title>
  <style>
    body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 24px; color: #1f2933; background: #f7f8fa; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .meta { color: #52616b; margin-bottom: 18px; line-height: 1.6; }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .pill { background: #fff; border: 1px solid #d7dde3; border-radius: 6px; padding: 8px 10px; }
    table { width: 100%; border-collapse: collapse; background: #fff; font-size: 13px; }
    th, td { border-bottom: 1px solid #e3e8ee; padding: 8px; text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: #edf2f7; z-index: 1; }
    tr:nth-child(even) td { background: #fbfcfd; }
  </style>
</head>
<body>
  <h1>每日广告运营任务池</h1>
  <div class="meta">
    runAt: ${escapeHtml(pool.time.runAt)} |
    businessDate: ${escapeHtml(pool.time.businessDate)} |
    dataDate: ${escapeHtml(pool.time.dataDate)} |
    siteTimezone: ${escapeHtml(pool.time.siteTimezone)} |
    sourceRunId: ${escapeHtml(pool.time.sourceRunId)}
  </div>
  <div class="summary">
    <div class="pill">candidate contexts: ${pool.summary.total}</div>
    <div class="pill">signals: ${Object.values(pool.summary.bySignal || {}).reduce((a, b) => a + b, 0)}</div>
    <div class="pill">reservedPageBlocked: ${pool.summary.reservedPageBlocked || 0}</div>
    <div class="pill">dataMissing: ${pool.summary.dataMissing}</div>
  </div>
  <table>
    <thead>
      <tr><th>Priority Hint</th><th>Input Signals</th><th>Guardrail Input</th><th>SKU</th><th>ASIN</th><th>Executable Hint</th><th>Facts/Signal Reasons</th><th>Final Action Owner</th><th>Missing</th><th>Last Adjusted</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function layerTitle(layer) {
  return {
    P0: 'P0 Today Must Handle',
    P1: 'P1 Recommended Today',
    P2: 'P2 Watch Pool',
    'Data Missing': 'Data Missing',
    'Low Priority': 'Low Priority Summary',
  }[layer] || layer;
}

function renderBoardRows(tasks) {
  return tasks.map(task => `
    <tr>
      <td>${escapeHtml(task.priority)}</td>
      <td>${escapeHtml(task.primaryTaskType)}</td>
      <td>${escapeHtml(task.sku)}</td>
      <td>${escapeHtml(task.asin)}</td>
      <td>${task.boardExecutableHint ? 'yes' : 'no'}</td>
      <td>${escapeHtml(task.priorityReason)}</td>
      <td>${escapeHtml(task.suggestedAction)}</td>
      <td>${escapeHtml(task.decisionSummary || '')}</td>
      <td>${escapeHtml((task.factsConsidered || []).join(' | '))}</td>
      <td>${escapeHtml(task.guardrailStatus || '')}</td>
      <td>${escapeHtml((task.guardrailBlocks || []).join(', '))}</td>
      <td>${escapeHtml((task.missingData || []).join(', '))}</td>
      <td>${escapeHtml(task.lastAdjustedAt || '')}</td>
      <td>${escapeHtml(task.cooldown?.active ? `${task.cooldown.ageDays}d/${task.cooldown.cooldownDays}d` : '')}</td>
      <td>${escapeHtml((task.mergedSignals || []).join(', '))}</td>
      <td>${escapeHtml(task.aiDecisionSource || '')}</td>
    </tr>`).join('');
}

function renderBoardSection(layer, tasks, open) {
  return `<details ${open ? 'open' : ''}>
    <summary>${escapeHtml(layerTitle(layer))} (${tasks.length})</summary>
    <table>
      <thead>
        <tr><th>AI Priority</th><th>Primary</th><th>SKU</th><th>ASIN</th><th>Executable</th><th>AI Why</th><th>Suggested Action</th><th>AI Summary</th><th>Facts</th><th>Guardrail</th><th>Blocks</th><th>Missing Data</th><th>Last Adjusted</th><th>Cooldown</th><th>Input Signals</th><th>Decision Source</th></tr>
      </thead>
      <tbody>${renderBoardRows(tasks)}</tbody>
    </table>
  </details>`;
}

function renderBoardHtml(board) {
  const missingTypes = Object.entries(board.summary.dataMissing.byType || {})
    .map(([key, count]) => `<span class="pill">${escapeHtml(key)}: ${count}</span>`).join('');
  const suppressed = Object.entries(board.summary.suppressedRuleCounts || {})
    .map(([key, count]) => `<span class="pill">${escapeHtml(key)} lowered: ${count}</span>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Daily Task Board ${escapeHtml(board.time.businessDate)}</title>
  <style>
    body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 24px; color: #17212b; background: #f6f7f9; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .meta { color: #52616b; margin-bottom: 16px; line-height: 1.6; }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 18px; }
    .pill { background: #fff; border: 1px solid #d7dde3; border-radius: 6px; padding: 8px 10px; }
    details { margin: 14px 0; background: #fff; border: 1px solid #d7dde3; border-radius: 6px; }
    summary { cursor: pointer; font-weight: 700; padding: 12px 14px; background: #edf2f7; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-top: 1px solid #e3e8ee; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Daily Ad Ops Task Board</h1>
  <div class="meta">
    runAt: ${escapeHtml(board.time.runAt)} |
    businessDate: ${escapeHtml(board.time.businessDate)} |
    dataDate: ${escapeHtml(board.time.dataDate)} |
    siteTimezone: ${escapeHtml(board.time.siteTimezone)} |
    sourceRunId: ${escapeHtml(board.time.sourceRunId)}
  </div>
  <div class="summary">
    <span class="pill">candidate contexts: ${board.summary.fullContextCount}</span>
    <span class="pill">board tasks: ${board.summary.boardTaskCount}</span>
    <span class="pill">main tasks: ${board.summary.mainTaskCount}/${board.summary.mainTaskLimit}</span>
    <span class="pill">executable main: ${board.summary.executableMainTasks}</span>
    <span class="pill">P0: ${board.summary.byLayer.P0}</span>
    <span class="pill">P1: ${board.summary.byLayer.P1}</span>
    <span class="pill">P2: ${board.summary.byLayer.P2}</span>
    <span class="pill">Data Missing: ${board.summary.byLayer['Data Missing']}</span>
    <span class="pill">Low Priority: ${board.summary.byLayer['Low Priority']}</span>
  </div>
  <div class="summary">${Object.entries(board.summary.aiDecisionSources || {}).map(([key, count]) => `<span class="pill">AI source ${escapeHtml(key)}: ${count}</span>`).join('')}</div>
  <div class="summary">${Object.entries(board.summary.guardrailBlocks || {}).map(([key, count]) => `<span class="pill">Guardrail ${escapeHtml(key)}: ${count}</span>`).join('') || '<span class="pill">no guardrail blocks</span>'}</div>
  <div class="summary">${missingTypes || '<span class="pill">no missing data</span>'}</div>
  <div class="summary">${suppressed || '<span class="pill">no suppressed rules</span>'}</div>
  ${renderBoardSection('P0', board.layers.P0 || [], true)}
  ${renderBoardSection('P1', board.layers.P1 || [], true)}
  ${renderBoardSection('P2', board.layers.P2 || [], false)}
  ${renderBoardSection('Data Missing', board.layers['Data Missing'] || [], false)}
  ${renderBoardSection('Low Priority', board.layers['Low Priority'] || [], false)}
</body>
</html>`;
}

function main() {
  const options = parseArgs(process.argv);
  const timeContext = buildOpsTimeContext({ site: options.site });
  const snapshotFile = options.snapshot ? path.resolve(options.snapshot) : latestSnapshot();
  const snapshot = snapshotFile ? readJson(snapshotFile, null) : null;
  if (!snapshot || !Array.isArray(snapshot.productCards) || snapshot.productCards.length === 0) {
    throw new Error(`missing usable non-empty snapshot with productCards: ${snapshotFile || '(none found)'}`);
  }
  const adjustments = [
    ...readAdjustmentLog({ businessDate: timeContext.businessDate }),
    ...readAdjustmentLog(),
  ];
  const pool = buildDailyTaskPool({ snapshot, timeContext, adjustments });
  const externalDecisions = options.aiDecisions ? readJson(path.resolve(options.aiDecisions), []) : [];
  if (options.aiDecisions && !Array.isArray(externalDecisions)) {
    throw new Error(`AI decision file must be a JSON array: ${options.aiDecisions}`);
  }
  const board = buildDailyTaskBoard(pool, { externalDecisions });
  pool.snapshotFile = snapshotFile;
  pool.dryRun = options.dryRun;
  board.snapshotFile = snapshotFile;
  board.dryRun = options.dryRun;
  fs.mkdirSync(TASK_DIR, { recursive: true });
  const jsonFile = path.join(TASK_DIR, `daily_tasks_${timeContext.businessDate}.json`);
  const htmlFile = path.join(TASK_DIR, `daily_tasks_${timeContext.businessDate}.html`);
  const boardJsonFile = path.join(TASK_DIR, `daily_task_board_${timeContext.businessDate}.json`);
  const boardHtmlFile = path.join(TASK_DIR, `daily_task_board_${timeContext.businessDate}.html`);
  writeJson(jsonFile, pool);
  fs.writeFileSync(htmlFile, renderHtml(pool), 'utf8');
  writeJson(boardJsonFile, board);
  fs.writeFileSync(boardHtmlFile, renderBoardHtml(board), 'utf8');
  console.log(JSON.stringify({
    dryRun: options.dryRun,
    time: timeContext,
    snapshotFile,
    jsonFile,
    htmlFile,
    boardJsonFile,
    boardHtmlFile,
    aiDecisionFile: options.aiDecisions || '',
    summary: pool.summary,
    boardSummary: board.summary,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { renderBoardHtml, renderHtml };
