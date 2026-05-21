const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  applyCommandResultToTask,
  applyCommandResultsToHub,
  expandResultsWithOutputReports,
} = require('../src/agent_execution_feedback');
const { runAgentExecutionFeedback } = require('../scripts/run_agent_execution_feedback');

const timeContext = {
  runAt: '2026-05-19T11:00:00.000Z',
  businessDate: '2026-05-19',
  sourceRunId: 'execution-feedback-test',
};

{
  const task = {
    taskId: 'ext-1',
    lane: 'external_inbox',
    status: 'new',
    title: '开发问 SE5608 能不能推',
    subject: { sku: 'SE5608' },
    executionPlan: {
      commands: [{
        label: '拉选品关键词转化证据',
        command: 'npm run ops:selection:keyword-conversion -- --keywords "american flag bucket hat"',
        output: 'data\\snapshots\\selection_keyword_conversion_rate_2026-05-19.json',
      }],
    },
  };

  const updated = applyCommandResultToTask(task, {
    taskId: 'ext-1',
    command: 'npm run ops:selection:keyword-conversion -- --keywords "american flag bucket hat"',
    ok: true,
    exitCode: 0,
    outputFiles: ['data\\snapshots\\selection_keyword_conversion_rate_2026-05-19.json'],
    summary: '选品关键词转化证据已生成。',
  }, timeContext);

  assert.strictEqual(updated.status, 'executed');
  assert.strictEqual(updated.history.length, 1);
  assert.strictEqual(updated.history[0].type, 'command_success');
  assert.strictEqual(updated.history[0].toStatus, 'executed');
  assert.strictEqual(updated.lastCommandResult.ok, true);
  assert.ok(updated.artifacts.includes('data\\snapshots\\selection_keyword_conversion_rate_2026-05-19.json'));
}

{
  const updated = applyCommandResultToTask({
    taskId: 'review-1',
    lane: 'effect_review',
    workType: 'due_effect_review',
    autonomyMode: 'run_review',
    status: 'waiting_review',
    title: 'SE5608 效果复查',
    nextStep: '拉取最新广告证据。',
    subject: { sku: 'SE5608' },
  }, {
    taskId: 'review-1',
    ok: true,
    exitCode: 0,
    report: {
      verdict: 'close_success',
      nextStep: '记录为有效动作，关闭本次复查。',
    },
    outputFiles: ['data\\agent\\effect_review_2026-05-19.json'],
  }, timeContext);

  assert.strictEqual(updated.status, 'closed');
  assert.strictEqual(updated.workType, 'due_effect_review');
  assert.strictEqual(updated.autonomyMode, 'run_review');
  assert.strictEqual(updated.nextStep, '拉取最新广告证据。');
  assert.strictEqual(updated.conclusion, '记录为有效动作，关闭本次复查。');
  assert.strictEqual(updated.history[0].type, 'close');
}

{
  const updated = applyCommandResultToTask({
    taskId: 'review-2',
    lane: 'effect_review',
    status: 'waiting_review',
    title: 'QAA3143 效果复查',
    subject: { sku: 'QAA3143' },
  }, {
    taskId: 'review-2',
    ok: false,
    exitCode: 1,
    error: 'missing current ad data',
    outputFiles: [],
  }, timeContext);

  assert.strictEqual(updated.status, 'blocked');
  assert.strictEqual(updated.history[0].type, 'command_failed');
  assert.ok(updated.lastCommandResult.error.includes('missing current ad data'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-feedback-expand-'));
  const reportFile = path.join(tmpDir, 'effect_review.json');
  fs.writeFileSync(reportFile, JSON.stringify({
    results: [{
      taskId: 'review-1',
      verdict: 'continue_watch',
      nextStep: '继续观察。',
    }, {
      taskId: 'review-2',
      verdict: 'continue_watch',
      nextStep: '继续观察。',
    }],
  }), 'utf8');
  const expanded = expandResultsWithOutputReports([{
    taskId: 'review-1',
    ok: true,
    exitCode: 0,
    outputFiles: [reportFile],
    summary: 'aggregate command',
  }]);
  assert.strictEqual(expanded.length, 2);
  assert.strictEqual(expanded[1].taskId, 'review-2');
  assert.strictEqual(expanded[1].report.verdict, 'continue_watch');
}

{
  const hub = {
    businessDate: '2026-05-19',
    todayQueue: [
      { taskId: 'ext-1', lane: 'external_inbox', status: 'new', title: '开发问 SE5608' },
      { taskId: 'review-1', lane: 'effect_review', status: 'waiting_review', title: 'SE5608 复查' },
    ],
  };
  const updated = applyCommandResultsToHub(hub, {
    results: [
      { taskId: 'ext-1', ok: true, exitCode: 0, summary: '证据已生成。' },
      { taskId: 'missing-task', ok: true, exitCode: 0, summary: '未匹配。' },
    ],
  }, timeContext);

  assert.strictEqual(updated.summary.feedbackApplied, 1);
  assert.strictEqual(updated.summary.feedbackUnmatched, 1);
  assert.strictEqual(updated.todayQueue[0].status, 'executed');
  assert.strictEqual(updated.unmatchedResults[0].taskId, 'missing-task');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-feedback-'));
  const hubFile = path.join(tmpDir, 'hub.json');
  const resultsFile = path.join(tmpDir, 'results.json');
  const outFile = path.join(tmpDir, 'hub_feedback.json');
  fs.writeFileSync(hubFile, JSON.stringify({
    businessDate: '2026-05-19',
    todayQueue: [{ taskId: 'ext-1', lane: 'external_inbox', status: 'new', title: '开发问 SE5608' }],
  }), 'utf8');
  fs.writeFileSync(resultsFile, JSON.stringify({
    results: [{ taskId: 'ext-1', ok: true, exitCode: 0, summary: '证据已生成。' }],
  }), 'utf8');

  const updated = runAgentExecutionFeedback({
    hubFile,
    resultsFile,
    outFile,
    timeContext,
  });

  assert.strictEqual(updated.summary.feedbackApplied, 1);
  assert.ok(fs.existsSync(outFile));
}

console.log('agent_execution_feedback tests passed');
