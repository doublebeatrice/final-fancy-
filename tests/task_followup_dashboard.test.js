const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildTaskFollowupDashboard,
  renderTaskFollowupMarkdown,
} = require('../src/task_followup_dashboard');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-followup-dashboard-'));
const weeklyTaskFile = path.join(tmpDir, 'weekly_team_tasks_2026-06-17.json');
const automationFollowupFile = path.join(tmpDir, 'automation_followups_2026-06-17.json');
fs.writeFileSync(weeklyTaskFile, JSON.stringify({
  tasks: [
    { title: 'SQL 恢复脚本补齐', owner: '数据负责人', status: 'done' },
    { title: '本周低效词读回', owner: '广告负责人', status: 'open', dueDate: '2026-06-19' },
    { title: '到货跟进清单', owner: '产品负责人', status: 'blocked', reason: '缺 live readback' },
  ],
}, null, 2));
fs.writeFileSync(automationFollowupFile, JSON.stringify({
  source: 'unsellable_trend_followup',
  tasks: [
    { title: '滞销复查 YYW2629', owner: '库存负责人', status: 'open', dueDate: '2026-06-20', trace: 'data/analysis/unsellable_trend_followup_2026-06-17.md' },
    { title: '滞销复查 HL2535', owner: '库存负责人', status: 'done', dueDate: '2026-06-20' },
  ],
}, null, 2));

const report = {
  today: '2026-06-17',
  coreMetrics: {
    today: '2026-06-17',
    todayReliability: 'not_reliable',
    todayInvalidReasons: ['sales_core file missing'],
    recovery: { attempted: true, status: 'failed', method: 'recover_daily_raw_inputs' },
    recoveryFile: 'data/agent/core_recovery_2026-06-17.json',
    coverage: {
      dataPipeline: {
        denominator: 1,
        numerator: 0,
        gapCount: 1,
        gaps: [{ item: '2026-06-17', reason: 'sales core missing', trace: 'data/raw/seller_sales_core_7d_2026-06-17.json' }],
      },
    },
  },
  goalFinal: {
    status: 'pending',
    currentStreak: 1,
    requiredBusinessDays: 3,
    blockers: [{ date: '2026-06-16', reason: 'missing_boss_daily_paper' }],
  },
  lines: {
    external: {
      todayDueFollowupsCount: 2,
      todayDueFollowupsCovered: 1,
      coverage: {
        dueFollowups: {
          denominator: 2,
          numerator: 1,
          gapCount: 1,
          gaps: [{ item: 'developer-followup-1', reason: 'missing live trace', trace: 'data/agent/followup.json' }],
        },
      },
    },
  },
  actionClosure: {
    reviewTaskCount: 12,
  },
};

const dashboard = buildTaskFollowupDashboard({
  today: '2026-06-17',
  report,
  weeklyTaskFile,
  automationFollowupFile,
});

assert.strictEqual(dashboard.today, '2026-06-17');
assert.strictEqual(dashboard.summary.totalSections, 4);
assert.ok(dashboard.summary.openItems >= 1);

const byId = new Map(dashboard.sections.map(item => [item.id, item]));
assert.strictEqual(byId.get('sql_recovery').label, 'SQL/数据恢复');
assert.strictEqual(byId.get('sql_recovery').done, 0);
assert.strictEqual(byId.get('sql_recovery').total, 1);
assert.strictEqual(byId.get('goal_progress').done, 1);
assert.strictEqual(byId.get('goal_progress').total, 3);
assert.strictEqual(byId.get('weekly_team_tasks').done, 1);
assert.strictEqual(byId.get('weekly_team_tasks').total, 3);
assert.strictEqual(byId.get('open_followups').total, 4);
assert.strictEqual(byId.get('open_followups').done, 2);

const markdown = renderTaskFollowupMarkdown(dashboard);
assert.ok(markdown.includes('## 5. 任务跟进装置'));
assert.ok(markdown.includes('SQL/数据恢复'));
assert.ok(markdown.includes('目标完成度'));
assert.ok(markdown.includes('小组本周任务'));
assert.ok(markdown.includes('本周低效词读回'));
assert.ok(markdown.includes('滞销复查 YYW2629'));

console.log('task_followup_dashboard tests passed');
