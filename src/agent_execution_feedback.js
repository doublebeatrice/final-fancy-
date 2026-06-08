const fs = require('fs');
const path = require('path');
const { normalizeAgentTask, transitionAgentTask } = require('./agent_control_plane');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function okFromResult(result = {}) {
  if (result.ok === false) return false;
  const exitCode = Number(result.exitCode ?? 0);
  return Number.isFinite(exitCode) ? exitCode === 0 : true;
}

function reviewVerdict(result = {}) {
  return text(result.report?.verdict || result.verdict);
}

function commandSummary(result = {}) {
  return text(
    result.summary ||
    result.report?.nextStep ||
    result.error ||
    result.stderrSummary ||
    result.stdoutSummary ||
    ''
  );
}

function normalizeCommandResult(result = {}, timeContext = {}) {
  return {
    taskId: text(result.taskId),
    command: text(result.command),
    label: text(result.label),
    ok: okFromResult(result),
    exitCode: Number(result.exitCode ?? (result.ok === false ? 1 : 0)),
    verdict: reviewVerdict(result),
    summary: commandSummary(result),
    error: text(result.error || ''),
    outputFiles: list(result.outputFiles || result.outputFile),
    artifactFiles: list(result.artifactFiles || result.artifacts),
    stdoutSummary: text(result.stdoutSummary || ''),
    stderrSummary: text(result.stderrSummary || ''),
    at: text(result.at || timeContext.runAt || new Date().toISOString()),
    sourceRunId: text(result.sourceRunId || timeContext.sourceRunId || ''),
  };
}

function eventForResult(result = {}) {
  if (!result.ok) {
    return {
      type: 'command_failed',
      statusEvent: 'block',
      conclusion: '',
      note: result.summary || result.error || '命令执行失败。',
    };
  }

  if (result.verdict === 'close_success' || result.verdict === 'goal_met') {
    return {
      type: 'close',
      statusEvent: 'close',
      conclusion: result.summary || '复查判断为有效，任务关闭。',
      note: result.summary || '复查判断为有效，任务关闭。',
    };
  }

  if (['continue_watch', 'goal_partial', 'early_window'].includes(result.verdict)) {
    return {
      type: 'schedule_review',
      statusEvent: 'schedule_review',
      conclusion: '',
      note: result.summary || '复查判断为继续观察。',
    };
  }

  if (['rollback_review', 'goal_missed', 'needs_data'].includes(result.verdict)) {
    return {
      type: 'command_requires_action',
      statusEvent: 'block',
      conclusion: '',
      note: result.summary || '复查需要进一步处理。',
    };
  }

  return {
    type: 'command_success',
    statusEvent: 'execute',
    conclusion: '',
    note: result.summary || '命令执行成功。',
  };
}

function appendArtifacts(task = {}, result = {}) {
  return [...new Set([
    ...list(task.artifacts),
    ...list(result.outputFiles),
    ...list(result.artifactFiles),
  ])];
}

function applyCommandResultToTask(task = {}, rawResult = {}, timeContext = {}) {
  const result = normalizeCommandResult(rawResult, timeContext);
  const event = eventForResult(result);
  const transitioned = transitionAgentTask(task, {
    type: event.statusEvent,
    actor: text(rawResult.actor || 'agent'),
    at: result.at,
    note: event.note,
    conclusion: event.conclusion,
  });
  const history = transitioned.history || [];
  const lastHistory = history[history.length - 1] || {};
  const enrichedHistory = [
    ...history.slice(0, -1),
    {
      ...lastHistory,
      type: event.type,
      command: result.command,
      label: result.label,
      exitCode: result.exitCode,
      ok: result.ok,
      verdict: result.verdict,
      outputFiles: result.outputFiles,
      artifactFiles: result.artifactFiles,
      sourceRunId: result.sourceRunId,
    },
  ];

  return {
    ...task,
    ...transitioned,
    history: enrichedHistory,
    artifacts: appendArtifacts(task, result),
    lastCommandResult: result,
  };
}

function resultsFromInput(input = {}) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.results)) return input.results;
  if (input && typeof input === 'object' && input.taskId) return [input];
  return [];
}

function readJson(file, fallback = null) {
  try {
    const raw = fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function expandResultsWithOutputReports(results = []) {
  const expanded = [...results];
  const seen = new Set(results.map(result => text(result.taskId)).filter(Boolean));
  for (const result of results) {
    for (const file of list(result.outputFiles || result.outputFile)) {
      const parsed = readJson(file, null);
      if (!parsed || !Array.isArray(parsed.results)) continue;
      for (const report of parsed.results) {
        const taskId = text(report.taskId);
        if (!taskId || seen.has(taskId)) continue;
        seen.add(taskId);
        expanded.push({
          ...result,
          taskId,
          report,
          summary: text(report.nextStep || report.summary || result.summary),
        });
      }
    }
  }
  return expanded;
}

function applyCommandResultsToHub(hub = {}, resultInput = {}, timeContext = {}) {
  const results = expandResultsWithOutputReports(resultsFromInput(resultInput));
  const byTaskId = new Map(results.map(result => [text(result.taskId), result]).filter(([taskId]) => taskId));
  let applied = 0;
  const todayQueue = (hub.todayQueue || []).map(task => {
    const result = byTaskId.get(text(task.taskId));
    if (!result) return task;
    applied += 1;
    return applyCommandResultToTask(task, result, timeContext);
  });
  const known = new Set((hub.todayQueue || []).map(task => text(task.taskId)).filter(Boolean));
  const unmatchedResults = results.filter(result => !known.has(text(result.taskId)));
  return {
    ...hub,
    generatedAt: text(hub.generatedAt || timeContext.runAt || new Date().toISOString()),
    feedbackAppliedAt: text(timeContext.runAt || new Date().toISOString()),
    todayQueue,
    unmatchedResults,
    summary: {
      ...(hub.summary || {}),
      feedbackApplied: applied,
      feedbackUnmatched: unmatchedResults.length,
      byStatus: todayQueue.reduce((acc, task) => {
        const key = task.status || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

module.exports = {
  applyCommandResultToTask,
  applyCommandResultsToHub,
  expandResultsWithOutputReports,
  normalizeCommandResult,
};
