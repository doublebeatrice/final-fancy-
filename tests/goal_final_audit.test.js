const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildGoalFinalAuditReport,
  continuityWithCurrentPaper,
  parseArgs,
  runGoalFinalAudit,
} = require('../scripts/run_goal_final_audit');

const continuity = {
  status: 'pending',
  requiredBusinessDays: 3,
  currentStreak: 1,
  today: '2026-06-01',
  daily: [
    { date: '2026-06-01', present: true, pass: true, reasons: [], verificationStatus: 'pass', guardStatus: 'pass', paperFile: 'paper.md', jsonFile: 'paper.json' },
    { date: '2026-05-29', present: false, pass: false, reasons: ['missing_boss_daily_paper'], verificationStatus: 'missing', guardStatus: 'missing', paperFile: 'old.md', jsonFile: '' },
  ],
  blockers: [{ date: '2026-05-29', reason: 'missing_boss_daily_paper', trace: 'old.md' }],
};

{
  const report = buildGoalFinalAuditReport({
    today: '2026-06-01',
    continuity,
    currentReport: { files: { paperFile: 'paper.md' } },
    currentPaper: { exists: true, file: 'paper.md', guard: { status: 'pass', failures: [] } },
  });
  assert.strictEqual(report.status, 'pending');
  assert.strictEqual(report.summary.currentStreak, 1);
  assert.strictEqual(report.summary.neededPassDays, 2);
  assert.deepStrictEqual(report.summary.nextRequiredBusinessDays, ['2026-06-02', '2026-06-03']);
  assert.strictEqual(report.summary.earliestCompletionDate, '2026-06-03');
}

{
  const adjusted = continuityWithCurrentPaper(continuity, {
    exists: false,
    file: 'missing.md',
    guard: { status: 'missing', failures: ['missing_current_boss_paper_markdown'] },
  });
  assert.strictEqual(adjusted.currentStreak, 0);
  assert.ok(adjusted.blockers[0].reason.includes('missing_current_boss_paper_markdown'));
}

{
  const parsed = parseArgs(['--today', '2026-06-01', '--require-complete', '--out', 'out.json']);
  assert.strictEqual(parsed.today, '2026-06-01');
  assert.strictEqual(parsed.requireComplete, true);
  assert.strictEqual(parsed.outFile, 'out.json');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-audit-'));
  const report = runGoalFinalAudit({
    today: '2026-06-01',
    agentDir: tmpDir,
    continuity,
    currentReport: { files: { paperFile: 'paper.md' } },
    currentPaper: { exists: true, file: 'paper.md', guard: { status: 'pass', failures: [] } },
  });
  assert.ok(fs.existsSync(report.files.jsonFile));
  assert.ok(fs.existsSync(report.files.markdownFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(report.files.jsonFile, 'utf8')).status, 'pending');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('goal_final_audit tests passed');
