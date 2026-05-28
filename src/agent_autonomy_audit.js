const fs = require('fs');
const path = require('path');
const { normalizeAgentTask } = require('./agent_control_plane');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readJson(file, fallback = null) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function exists(file) {
  return !!file && fs.existsSync(file);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function relative(file) {
  const raw = text(file);
  if (!raw) return '';
  const resolved = path.resolve(raw);
  return resolved.startsWith(ROOT) ? path.relative(ROOT, resolved) : raw;
}

function defaultAgentFile(prefix, date, ext = 'json') {
  return path.join(ROOT, 'data', 'agent', `${prefix}_${date}.${ext}`);
}

function defaultLearningFile(date) {
  return path.join(ROOT, 'data', 'learning', `daily_learning_${date}.json`);
}

function pushCheck(checks, input = {}) {
  const status = text(input.status || 'pass');
  checks.push({
    id: text(input.id),
    title: text(input.title),
    status,
    severity: text(input.severity || (status === 'pass' ? 'info' : 'warning')),
    evidence: (input.evidence || []).map(text).filter(Boolean),
    gaps: (input.gaps || []).map(text).filter(Boolean),
    nextAction: text(input.nextAction || ''),
  });
}

function taskForCheck(check = {}, context = {}) {
  if (check.status === 'pass') return null;
  const priority = check.severity === 'blocker' ? 'P0' : 'P1';
  return normalizeAgentTask({
    source: 'autonomy_audit',
    kind: 'autonomy_gap',
    status: 'new',
    priority,
    title: check.title,
    description: check.nextAction || check.gaps.join('; '),
    evidence: check.evidence,
    evidenceRequirements: check.gaps,
    subject: { entityId: check.id },
    dueDate: dateOnly(context.businessDate || context.runAt),
    businessDate: context.businessDate,
    dataDate: context.dataDate || context.businessDate,
    sourceRunId: context.sourceRunId,
    rawInput: `autonomy_audit:${check.id}`,
  }, context);
}

function statusFromChecks(checks = [], summary = {}) {
  const blockerCount = checks.filter(check => check.status === 'fail' && check.severity === 'blocker').length;
  const failCount = checks.filter(check => check.status === 'fail').length;
  const warnings = checks.filter(check => check.status === 'warning');
  if (blockerCount > 0 || failCount > 0) return 'not_ready';
  if (warnings.some(check => check.id !== 'daily_recovery_loop')) return 'ready_with_warnings';
  if (text(summary.dailyClosureStatus) === 'needs_recovery') return 'ready_with_recovery';
  if (warnings.length > 0) return 'ready_with_warnings';
  return 'ready';
}

function buildAutonomyAudit(options = {}, timeContext = {}) {
  const businessDate = dateOnly(options.today || options.businessDate || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(options.dataDate || timeContext.dataDate || businessDate);
  const generatedAt = text(timeContext.runAt || options.now || new Date().toISOString());
  const sourceRunId = text(timeContext.sourceRunId || options.sourceRunId || '');
  const closedLoopFile = options.closedLoopFile || defaultAgentFile('agent_closed_loop', businessDate);
  const closedLoop = options.closedLoop || readJson(closedLoopFile, {});
  const files = closedLoop.files || {};
  const summary = closedLoop.summary || {};
  const handoffFile = options.handoffFile || files.handoffOutFile || defaultAgentFile('agent_handoff', businessDate, 'md');
  const commandResultsFile = options.commandResultsFile || files.commandResultsFile || defaultAgentFile('command_results', businessDate);
  const writeExecutionFile = options.writeExecutionFile || files.writeExecutionFile || defaultAgentFile('write_execution', businessDate);
  const learningFile = options.learningFile || defaultLearningFile(dataDate || businessDate);
  const learningMemoryFile = options.learningMemoryFile || '';
  const correctionRiskFile = options.correctionRiskFile || '';
  const checks = [];

  pushCheck(checks, exists(closedLoopFile) && closedLoop.closedLoop === true
    ? {
      id: 'closed_loop_chain',
      title: 'Agent closed-loop chain is present',
      status: 'pass',
      evidence: [`closedLoop=true in ${relative(closedLoopFile)}`],
    }
    : {
      id: 'closed_loop_chain',
      title: 'Agent closed-loop chain is not proven',
      status: 'fail',
      severity: 'blocker',
      evidence: exists(closedLoopFile) ? [`read ${relative(closedLoopFile)}`] : [],
      gaps: [`missing closedLoop=true in ${relative(closedLoopFile) || 'agent closed-loop report'}`],
      nextAction: 'Run the full agent closed-loop and keep the report before claiming unattended operation.',
    });

  pushCheck(checks, summary.artifactVerificationOk === true || options.requireArtifactVerification === false
    ? {
      id: 'artifact_verification',
      title: 'Closure artifacts verify cleanly',
      status: 'pass',
      evidence: ['artifactVerificationOk=true'],
    }
    : {
      id: 'artifact_verification',
      title: 'Closure artifact verification is not clean',
      status: 'fail',
      severity: 'blocker',
      gaps: (summary.artifactVerificationErrors || ['artifactVerificationOk is not true']).map(text),
      nextAction: 'Fix artifact verification errors before treating the loop as unattended.',
    });

  pushCheck(checks, exists(handoffFile)
    ? {
      id: 'handoff',
      title: 'Human-readable handoff exists',
      status: 'pass',
      evidence: [relative(handoffFile)],
    }
    : {
      id: 'handoff',
      title: 'Human-readable handoff is missing',
      status: 'fail',
      severity: 'blocker',
      gaps: [`missing ${relative(handoffFile) || 'handoff markdown'}`],
      nextAction: 'Generate the agent handoff so unattended runs have an inspectable morning report.',
    });

  const commandResults = options.commandResults || readJson(commandResultsFile, {});
  const commandFailed = number(summary.commandFailed || commandResults.summary?.failed);
  pushCheck(checks, exists(commandResultsFile) && commandFailed === 0
    ? {
      id: 'read_only_evidence_runner',
      title: 'Read-only evidence runner has no failed commands',
      status: 'pass',
      evidence: [`${relative(commandResultsFile)} failed=${commandFailed}`],
    }
    : {
      id: 'read_only_evidence_runner',
      title: 'Read-only evidence runner is not clean',
      status: exists(commandResultsFile) ? 'fail' : 'warning',
      severity: exists(commandResultsFile) ? 'blocker' : 'warning',
      gaps: exists(commandResultsFile) ? [`commandFailed=${commandFailed}`] : [`missing ${relative(commandResultsFile)}`],
      nextAction: 'Rerun or repair failed read-only evidence commands before making autonomous decisions.',
    });

  const writeExecution = options.writeExecution || readJson(writeExecutionFile, {});
  const writeFailed = number(summary.writeFailed || writeExecution.summary?.failedStages);
  const dryRunBlocked = number(writeExecution.summary?.dryRunBlockedActions);
  const hardWriteBlocked = Math.max(0, number(summary.writeBlocked || writeExecution.summary?.blockedActions) - dryRunBlocked);
  const writeMode = text(summary.writeMode || writeExecution.mode);
  if (!exists(writeExecutionFile)) {
    pushCheck(checks, {
      id: 'write_execution_gate',
      title: 'Write execution gate is missing',
      status: 'fail',
      severity: 'blocker',
      gaps: [`missing ${relative(writeExecutionFile)}`],
      nextAction: 'Run write execution in dry-run or execute mode so writes are never implicit.',
    });
  } else if (writeFailed > 0 || hardWriteBlocked > 0) {
    pushCheck(checks, {
      id: 'write_execution_gate',
      title: 'Write execution gate has hard failures',
      status: 'fail',
      severity: 'blocker',
      evidence: [`${relative(writeExecutionFile)} mode=${writeMode}`],
      gaps: [`writeFailed=${writeFailed}`, `hardWriteBlocked=${hardWriteBlocked}`],
      nextAction: 'Resolve write failures or hard blockers before allowing unattended continuation.',
    });
  } else if (writeMode === 'dry-run' || writeMode === 'skipped') {
    pushCheck(checks, {
      id: 'write_execution_gate',
      title: 'Write execution is gated but not fully unattended',
      status: 'warning',
      severity: 'warning',
      evidence: [`${relative(writeExecutionFile)} mode=${writeMode}`],
      gaps: ['live writes are not enabled for this run'],
      nextAction: 'Use explicit --execute only when the action schema, authorization boundary, and landing verification are ready.',
    });
  } else {
    pushCheck(checks, {
      id: 'write_execution_gate',
      title: 'Write execution gate is clean',
      status: 'pass',
      evidence: [`${relative(writeExecutionFile)} mode=${writeMode}`],
    });
  }

  const dataLagDays = Number(summary.dataLagDays);
  if (summary.snapshotStale === true || dataLagDays > 1) {
    pushCheck(checks, {
      id: 'data_freshness',
      title: 'Data freshness blocks autonomous judgement',
      status: 'fail',
      severity: 'blocker',
      gaps: [`snapshotStale=${summary.snapshotStale === true}`, `dataLagDays=${Number.isFinite(dataLagDays) ? dataLagDays : 'unknown'}`],
      nextAction: 'Refresh live data or mark the run blocked instead of reusing stale evidence.',
    });
  } else if (text(summary.dataFreshnessStatus) === 'warning' || dataLagDays === 1) {
    pushCheck(checks, {
      id: 'data_freshness',
      title: 'Data is usable with freshness warning',
      status: 'warning',
      severity: 'warning',
      evidence: [`dataFreshnessStatus=${text(summary.dataFreshnessStatus)}`, `dataLagDays=${Number.isFinite(dataLagDays) ? dataLagDays : 'unknown'}`],
      nextAction: 'Prefer same-day data before executing new spend increases.',
    });
  } else {
    pushCheck(checks, {
      id: 'data_freshness',
      title: 'Data freshness is acceptable',
      status: 'pass',
      evidence: [`dataFreshnessStatus=${text(summary.dataFreshnessStatus) || 'ok'}`, `dataLagDays=${Number.isFinite(dataLagDays) ? dataLagDays : 0}`],
    });
  }

  const dailyClosureStatus = text(summary.dailyClosureStatus);
  if (dailyClosureStatus === 'complete') {
    pushCheck(checks, {
      id: 'daily_recovery_loop',
      title: 'Daily loop is complete',
      status: 'pass',
      evidence: ['dailyClosureStatus=complete'],
    });
  } else if (dailyClosureStatus === 'needs_recovery' && summary.kpiRecoveryNextActionsReady === true) {
    pushCheck(checks, {
      id: 'daily_recovery_loop',
      title: 'Daily loop is self-driving recovery mode',
      status: 'warning',
      severity: 'warning',
      evidence: ['dailyClosureStatus=needs_recovery', 'kpiRecoveryNextActionsReady=true'],
      nextAction: 'Continue the recovery plan and verify the next KPI gate instead of waiting for manual nudges.',
    });
  } else {
    pushCheck(checks, {
      id: 'daily_recovery_loop',
      title: 'Daily loop lacks autonomous recovery proof',
      status: 'fail',
      severity: 'blocker',
      gaps: [`dailyClosureStatus=${dailyClosureStatus || 'missing'}`, `kpiRecoveryNextActionsReady=${summary.kpiRecoveryNextActionsReady === true}`],
      nextAction: 'Produce recovery next-actions or close the missing data/write blockers before unattended continuation.',
    });
  }

  pushCheck(checks, exists(learningFile)
    ? {
      id: 'long_term_learning',
      title: 'Daily learning artifact exists',
      status: 'pass',
      evidence: [relative(learningFile)],
    }
    : {
      id: 'long_term_learning',
      title: 'Daily learning artifact is missing',
      status: 'fail',
      severity: 'blocker',
      gaps: [`missing ${relative(learningFile)}`],
      nextAction: 'Persist daily learning so the next run can reuse scoped lessons and unresolved follow-ups.',
    });

  if (learningMemoryFile) {
    const learningMemory = readJson(learningMemoryFile, {});
    pushCheck(checks, exists(learningMemoryFile) && learningMemory.nextRunBrief
      ? {
        id: 'learning_memory_index',
        title: 'Long-term learning memory index exists',
        status: 'pass',
        evidence: [relative(learningMemoryFile)],
      }
      : {
        id: 'learning_memory_index',
        title: 'Long-term learning memory index is missing',
        status: 'fail',
        severity: 'blocker',
        gaps: [`missing or invalid ${relative(learningMemoryFile)}`],
        nextAction: 'Generate agent learning memory so tomorrow can read scoped constraints automatically.',
      });
  }

  const correctionModule = path.join(ROOT, 'src', 'agent_correction_risk.js');
  const correctionScript = path.join(ROOT, 'scripts', 'run_agent_correction_risk.js');
  const correctionReport = correctionRiskFile ? readJson(correctionRiskFile, {}) : null;
  if (!exists(correctionModule) || !exists(correctionScript)) {
    pushCheck(checks, {
      id: 'correction_risk_loop',
      title: 'Correction risk loop is missing',
      status: 'fail',
      severity: 'blocker',
      gaps: ['agent correction module or CLI is missing'],
      nextAction: 'Restore correction-risk audit before accepting operator correction as learnable feedback.',
    });
  } else if (correctionRiskFile && (!exists(correctionRiskFile) || !correctionReport?.learningPatch)) {
    pushCheck(checks, {
      id: 'correction_risk_loop',
      title: 'Correction risk report is incomplete',
      status: 'fail',
      severity: 'blocker',
      gaps: [`invalid correction report ${relative(correctionRiskFile)}`],
      nextAction: 'Regenerate correction risk audit and learning patch.',
    });
  } else {
    pushCheck(checks, {
      id: 'correction_risk_loop',
      title: 'Correction risk loop is available',
      status: 'pass',
      evidence: [relative(correctionModule), relative(correctionScript)].concat(correctionRiskFile ? [relative(correctionRiskFile)] : []),
    });
  }

  const marketPatternDoc = path.join(ROOT, 'docs', 'MARKET_EVIDENCE_FIRST_OPERATING_PATTERN.md');
  pushCheck(checks, exists(marketPatternDoc)
    ? {
      id: 'market_evidence_first',
      title: 'Market-evidence-first operating pattern is documented',
      status: 'pass',
      evidence: [relative(marketPatternDoc)],
    }
    : {
      id: 'market_evidence_first',
      title: 'Market-evidence-first operating pattern is missing',
      status: 'fail',
      severity: 'blocker',
      gaps: ['missing market evidence first operating pattern'],
      nextAction: 'Document the competitor/reverse-mine/rule-filter/action pattern before using it as agent doctrine.',
    });

  const context = { businessDate, dataDate, runAt: generatedAt, sourceRunId };
  const tasks = checks.map(check => taskForCheck(check, context)).filter(Boolean);
  const failCount = checks.filter(check => check.status === 'fail').length;
  const warningCount = checks.filter(check => check.status === 'warning').length;
  const passCount = checks.filter(check => check.status === 'pass').length;
  const score = Math.max(0, Math.round((passCount / Math.max(1, checks.length)) * 100) - (failCount * 8) - (warningCount * 3));
  const status = statusFromChecks(checks, summary);

  return {
    generatedAt,
    businessDate,
    dataDate,
    sourceRunId,
    objective: 'agentization, unattended self-drive, long-term learning, and correction risk audit',
    status,
    score,
    summary: {
      autonomousReady: status === 'ready' || status === 'ready_with_recovery',
      passCount,
      warningCount,
      failCount,
      blockerCount: checks.filter(check => check.status === 'fail' && check.severity === 'blocker').length,
      dailyClosureStatus,
      writeMode,
      kpiStatus: text(summary.kpiStatus),
      dataFreshnessStatus: text(summary.dataFreshnessStatus),
      taskCount: tasks.length,
    },
    files: {
      closedLoopFile,
      handoffFile,
      commandResultsFile,
      writeExecutionFile,
      learningFile,
      learningMemoryFile,
      correctionRiskFile,
    },
    checks,
    tasks,
  };
}

function renderAutonomyAuditMarkdown(audit = {}) {
  const lines = [];
  lines.push(`# Agent autonomy audit - ${audit.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${audit.status || 'unknown'}`);
  lines.push(`- Score: ${audit.score ?? 0}`);
  lines.push(`- Autonomous ready: ${audit.summary?.autonomousReady === true ? 'true' : 'false'}`);
  lines.push(`- Checks: pass ${audit.summary?.passCount || 0}; warning ${audit.summary?.warningCount || 0}; fail ${audit.summary?.failCount || 0}`);
  lines.push(`- Open autonomy tasks: ${audit.summary?.taskCount || 0}`);
  lines.push('');
  lines.push('## Checks');
  for (const check of audit.checks || []) {
    lines.push('');
    lines.push(`### ${check.id}`);
    lines.push(`- Status: ${check.status}`);
    lines.push(`- Severity: ${check.severity}`);
    if (check.evidence?.length) lines.push(`- Evidence: ${check.evidence.join('; ')}`);
    if (check.gaps?.length) lines.push(`- Gaps: ${check.gaps.join('; ')}`);
    if (check.nextAction) lines.push(`- Next action: ${check.nextAction}`);
  }
  if (audit.tasks?.length) {
    lines.push('');
    lines.push('## Tasks');
    for (const task of audit.tasks) {
      lines.push(`- ${task.priority} ${task.taskId}: ${task.title}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function persistAutonomyAudit(audit = {}, options = {}) {
  const date = dateOnly(audit.businessDate || options.today);
  const outFile = options.outFile || defaultAgentFile('autonomy_audit', date);
  const markdownFile = options.markdownFile || defaultAgentFile('autonomy_audit', date, 'md');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(audit, null, 2), 'utf8');
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, renderAutonomyAuditMarkdown(audit), 'utf8');
  return { outFile, markdownFile };
}

module.exports = {
  buildAutonomyAudit,
  persistAutonomyAudit,
  renderAutonomyAuditMarkdown,
};
