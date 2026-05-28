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

function readJson(file, fallback = {}) {
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

function addIssue(list, input = {}) {
  list.push({
    id: text(input.id),
    severity: text(input.severity || 'blocker'),
    title: text(input.title || input.id),
    evidence: (input.evidence || []).map(text).filter(Boolean),
    nextAction: text(input.nextAction || ''),
  });
}

function actionNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function actionValueCheck(item = {}) {
  const action = item.action || {};
  const actionType = text(item.actionType || action.actionType || action.type).toLowerCase();
  if (!['bid', 'budget', 'placement'].includes(actionType)) return null;
  const current = actionType === 'budget'
    ? actionNumber(action.currentBudget)
    : (actionType === 'placement' ? actionNumber(action.currentPlacementPercent) : actionNumber(action.currentBid));
  const suggested = actionType === 'budget'
    ? actionNumber(action.suggestedBudget)
    : (actionType === 'placement' ? actionNumber(action.suggestedPlacementPercent) : actionNumber(action.suggestedBid));
  if (current === undefined || suggested === undefined) {
    return {
      id: 'missing_current_or_suggested_value',
      title: `${actionType} action missing current/suggested value`,
      evidence: [`${item.sku || ''} ${item.entityType || ''} ${item.actionType || ''}`],
      nextAction: 'Refresh entity evidence and include current and suggested numeric values before unattended execute.',
    };
  }
  if (suggested > current) {
    return {
      id: 'spend_increase_requires_live_recovery_gate',
      title: `${actionType} increase is not eligible for unattended gate`,
      evidence: [`current=${current}`, `suggested=${suggested}`, `${item.sku || ''} ${item.entityType || ''}`],
      nextAction: 'Handle spend increases through explicit recovery approval or a narrower documented auto-execute path.',
    };
  }
  return null;
}

function taskForIssue(issue = {}, context = {}) {
  return normalizeAgentTask({
    source: 'unattended_gate',
    kind: 'unattended_execute_blocker',
    status: 'new',
    priority: issue.severity === 'blocker' ? 'P0' : 'P1',
    title: issue.title,
    description: issue.nextAction,
    evidence: issue.evidence,
    evidenceRequirements: [issue.id],
    subject: { entityId: issue.id },
    businessDate: context.businessDate,
    dataDate: context.dataDate,
    dueDate: context.businessDate,
    sourceRunId: context.sourceRunId,
    rawInput: `unattended_gate:${issue.id}`,
  }, context);
}

function allowedAutonomyWarnings(audit = {}) {
  const allowed = new Set(['write_execution_gate', 'daily_recovery_loop']);
  return (audit.checks || [])
    .filter(check => check.status === 'warning' && !allowed.has(check.id));
}

function buildUnattendedGate(options = {}, timeContext = {}) {
  const businessDate = dateOnly(options.today || options.businessDate || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(options.dataDate || timeContext.dataDate || businessDate);
  const generatedAt = text(timeContext.runAt || options.now || new Date().toISOString());
  const sourceRunId = text(timeContext.sourceRunId || options.sourceRunId || '');
  const closedLoopFile = options.closedLoopFile || defaultAgentFile('agent_closed_loop', businessDate);
  const autonomyAuditFile = options.autonomyAuditFile || defaultAgentFile('autonomy_audit', businessDate);
  const learningMemoryFile = options.learningMemoryFile || defaultAgentFile('learning_memory', businessDate);
  const writeExecutionFile = options.writeExecutionFile || defaultAgentFile('write_execution', businessDate);
  const closedLoop = options.closedLoop || readJson(closedLoopFile, {});
  const autonomyAudit = options.autonomyAudit || readJson(autonomyAuditFile, {});
  const learningMemory = options.learningMemory || readJson(learningMemoryFile, {});
  const writeExecution = options.writeExecution || readJson(writeExecutionFile, {});
  const summary = closedLoop.summary || {};
  const plan = writeExecution.plan || {};
  const eligibleActionCount = Math.max(number(plan.summary?.eligibleActions), Array.isArray(plan.eligible) ? plan.eligible.length : 0);
  const hasEligibleWriteActions = eligibleActionCount > 0;
  const issues = [];
  const warnings = [];

  if (!exists(closedLoopFile) || closedLoop.closedLoop !== true) {
    addIssue(issues, {
      id: 'closed_loop_not_proven',
      title: 'Closed-loop report is missing or not successful',
      evidence: exists(closedLoopFile) ? [relative(closedLoopFile)] : [],
      nextAction: 'Run a clean closed-loop before unattended execute is considered.',
    });
  }
  if (summary.artifactVerificationOk !== true) {
    addIssue(issues, {
      id: 'artifact_verification_not_clean',
      title: 'Artifact verification is not clean',
      evidence: summary.artifactVerificationErrors || [],
      nextAction: 'Fix artifact verification errors before live unattended execution.',
    });
  }
  if (number(summary.commandFailed) > 0 || number(summary.writeFailed) > 0) {
    addIssue(issues, {
      id: 'prior_stage_failed',
      title: 'Previous evidence or write stage failed',
      evidence: [`commandFailed=${number(summary.commandFailed)}`, `writeFailed=${number(summary.writeFailed)}`],
      nextAction: 'Repair failed stages and rerun dry-run before execute.',
    });
  }
  if (summary.snapshotStale === true || number(summary.dataLagDays) > 1) {
    addIssue(issues, {
      id: 'stale_data_blocks_execute',
      title: 'Stale data blocks unattended execute',
      evidence: [`snapshotStale=${summary.snapshotStale === true}`, `dataLagDays=${summary.dataLagDays ?? 'unknown'}`],
      nextAction: 'Refresh live data before executing any write.',
    });
  }
  const dailyStatus = text(summary.dailyClosureStatus);
  if (!['complete', 'needs_recovery'].includes(dailyStatus)) {
    addIssue(issues, {
      id: 'daily_status_not_executable',
      title: `Daily closure status is ${dailyStatus || 'missing'}`,
      nextAction: 'Close data/write blockers or produce recovery next-actions before unattended execute.',
    });
  } else if (dailyStatus === 'needs_recovery' && summary.kpiRecoveryNextActionsReady !== true) {
    addIssue(issues, {
      id: 'recovery_next_actions_missing',
      title: 'Recovery mode lacks next actions',
      nextAction: 'Generate KPI recovery next-actions before unattended execute.',
    });
  }

  if (!exists(autonomyAuditFile) || text(autonomyAudit.status) === 'not_ready' || number(autonomyAudit.summary?.blockerCount) > 0 || number(autonomyAudit.summary?.failCount) > 0) {
    addIssue(issues, {
      id: 'autonomy_audit_not_ready',
      title: 'Autonomy audit is not ready',
      evidence: exists(autonomyAuditFile) ? [`status=${text(autonomyAudit.status)}`] : [`missing ${relative(autonomyAuditFile)}`],
      nextAction: 'Resolve autonomy audit blockers before unattended execute.',
    });
  }
  for (const warning of allowedAutonomyWarnings(autonomyAudit)) {
    addIssue(hasEligibleWriteActions ? issues : warnings, {
      id: `autonomy_warning:${warning.id}`,
      severity: hasEligibleWriteActions ? 'blocker' : 'warning',
      title: `Autonomy warning requires review: ${warning.title || warning.id}`,
      evidence: warning.evidence || [],
      nextAction: hasEligibleWriteActions
        ? (warning.nextAction || 'Resolve non-execution autonomy warning before unattended execute.')
        : 'No write action is eligible; keep this as a watch item for the next evidence loop.',
    });
  }

  if (!exists(learningMemoryFile) || !learningMemory.nextRunBrief) {
    addIssue(issues, {
      id: 'learning_memory_missing',
      title: 'Learning memory is missing',
      evidence: exists(learningMemoryFile) ? [relative(learningMemoryFile)] : [],
      nextAction: 'Generate learning memory before unattended execute so scoped constraints are applied.',
    });
  } else if (number(learningMemory.summary?.blockers) > 0 || text(learningMemory.status) === 'blocked_constraints') {
    addIssue(issues, {
      id: 'learning_memory_has_blockers',
      title: 'Learning memory has active blockers',
      evidence: [`blockers=${number(learningMemory.summary?.blockers)}`, `status=${text(learningMemory.status)}`],
      nextAction: 'Resolve correction or learning blockers before unattended execute.',
    });
  } else if (number(learningMemory.summary?.warnings) > 0) {
    addIssue(warnings, {
      id: 'learning_memory_active_watch',
      severity: 'warning',
      title: 'Learning memory has active watch constraints',
      evidence: [`warnings=${number(learningMemory.summary?.warnings)}`],
      nextAction: 'Proceed only if the active watches are recovery-mode warnings and not blockers.',
    });
  }

  if (!exists(writeExecutionFile) || !writeExecution.plan) {
    addIssue(issues, {
      id: 'write_execution_missing',
      title: 'Write execution dry-run report is missing',
      evidence: exists(writeExecutionFile) ? [relative(writeExecutionFile)] : [],
      nextAction: 'Run write execution dry-run before unattended execute.',
    });
  } else if (text(writeExecution.mode) === 'execute') {
    addIssue(warnings, {
      id: 'already_execute_mode',
      severity: 'warning',
      title: 'Write execution already ran in execute mode',
      evidence: [relative(writeExecutionFile)],
      nextAction: 'Do not execute the same schema twice; move to effect review.',
    });
  } else {
    if (number(writeExecution.summary?.failedStages) > 0) {
      addIssue(issues, {
        id: 'write_dry_run_failed',
        title: 'Write dry-run failed',
        evidence: [`failedStages=${number(writeExecution.summary?.failedStages)}`],
        nextAction: 'Fix dry-run failures before execute.',
      });
    }
    if (number(plan.summary?.blockedActions) > 0 || number(plan.summary?.dryRunBlockedActions) > 0) {
      addIssue(issues, {
        id: 'write_plan_has_blocked_actions',
        title: 'Write plan has blocked actions',
        evidence: [`blockedActions=${number(plan.summary?.blockedActions)}`, `dryRunBlockedActions=${number(plan.summary?.dryRunBlockedActions)}`],
        nextAction: 'Remove blocked actions or repair evidence before execute.',
      });
    }
    if (number(plan.summary?.approvalNeededActions) > 0) {
      addIssue(issues, {
        id: 'approval_needed_actions_present',
        title: 'Approval-needed actions are present',
        evidence: [`approvalNeededActions=${number(plan.summary?.approvalNeededActions)}`],
        nextAction: 'Split review-only actions out of the unattended schema.',
      });
    }
    if (number(plan.summary?.remainingActions) !== number(plan.summary?.eligibleActions)) {
      addIssue(issues, {
        id: 'remaining_actions_not_all_eligible',
        title: 'Not all remaining actions are eligible for unattended execute',
        evidence: [`remainingActions=${number(plan.summary?.remainingActions)}`, `eligibleActions=${number(plan.summary?.eligibleActions)}`],
        nextAction: 'Keep only low-risk auto-executable writes in an unattended schema.',
      });
    }
    if (number(plan.summary?.eligibleActions) <= 0) {
      addIssue(warnings, {
        id: 'no_eligible_actions',
        severity: 'warning',
        title: 'No eligible actions remain',
        nextAction: 'No unattended execute is needed; move to review or next evidence loop.',
      });
    }
    const maxActions = Number(options.maxActions || 50);
    if (number(plan.summary?.eligibleActions) > maxActions) {
      addIssue(issues, {
        id: 'too_many_actions_for_unattended_execute',
        title: 'Eligible action count exceeds unattended cap',
        evidence: [`eligibleActions=${number(plan.summary?.eligibleActions)}`, `maxActions=${maxActions}`],
        nextAction: 'Split the schema into smaller guarded batches.',
      });
    }
    for (const item of plan.eligible || []) {
      if (text(item.authorization?.mode) !== 'auto_execute' || text(item.authorization?.riskLevel) !== 'low') {
        addIssue(issues, {
          id: 'eligible_action_not_low_risk',
          title: 'Eligible action is not low-risk auto-execute',
          evidence: [`${item.sku || ''} ${item.entityType || ''} ${item.actionType || ''}`, `mode=${text(item.authorization?.mode)}`, `riskLevel=${text(item.authorization?.riskLevel)}`],
          nextAction: 'Rewrite or review this action before unattended execute.',
        });
      }
      const valueIssue = actionValueCheck(item);
      if (valueIssue) addIssue(issues, valueIssue);
    }
    if (hasEligibleWriteActions && (!text(plan.actionSchemaFile) || !exists(plan.actionSchemaFile))) {
      addIssue(issues, {
        id: 'action_schema_missing',
        title: 'Action schema file is missing',
        evidence: [relative(plan.actionSchemaFile)],
        nextAction: 'Provide the exact action schema used in dry-run before execute.',
      });
    }
    if (hasEligibleWriteActions && (!text(plan.snapshotFile) || !exists(plan.snapshotFile))) {
      addIssue(issues, {
        id: 'snapshot_missing',
        title: 'Snapshot file is missing',
        evidence: [relative(plan.snapshotFile)],
        nextAction: 'Provide the exact snapshot used in dry-run before execute.',
      });
    }
  }

  const noActions = issues.length === 0 && number(plan.summary?.eligibleActions) <= 0;
  const decision = issues.length
    ? 'execute_blocked'
    : (text(writeExecution.mode) === 'execute'
      ? 'already_execute'
      : (noActions ? 'no_actions' : 'execute_allowed'));
  const canAutoExecute = decision === 'execute_allowed';
  const context = { businessDate, dataDate, runAt: generatedAt, sourceRunId };
  return {
    generatedAt,
    businessDate,
    dataDate,
    sourceRunId,
    decision,
    canAutoExecute,
    summary: {
      blockers: issues.length,
      warnings: warnings.length,
      eligibleActions: number(plan.summary?.eligibleActions),
      approvalNeededActions: number(plan.summary?.approvalNeededActions),
      blockedActions: number(plan.summary?.blockedActions),
      dailyClosureStatus: dailyStatus,
      autonomyStatus: text(autonomyAudit.status),
      learningMemoryStatus: text(learningMemory.status),
      writeMode: text(writeExecution.mode),
    },
    files: {
      closedLoopFile,
      autonomyAuditFile,
      learningMemoryFile,
      writeExecutionFile,
    },
    executeCommand: text(plan.executeCommand || ''),
    writePlan: plan,
    issues,
    warnings,
    tasks: issues.map(issue => taskForIssue(issue, context)),
  };
}

function renderUnattendedGateMarkdown(gate = {}) {
  const lines = [];
  lines.push(`# Unattended execute gate - ${gate.businessDate || ''}`);
  lines.push('');
  lines.push(`- Decision: ${gate.decision || 'unknown'}`);
  lines.push(`- Can auto execute: ${gate.canAutoExecute === true ? 'true' : 'false'}`);
  lines.push(`- Eligible actions: ${gate.summary?.eligibleActions || 0}`);
  lines.push(`- Blockers: ${gate.summary?.blockers || 0}`);
  lines.push(`- Warnings: ${gate.summary?.warnings || 0}`);
  if (gate.executeCommand) lines.push(`- Execute command: ${gate.executeCommand}`);
  lines.push('');
  lines.push('## Blockers');
  if (gate.issues?.length) {
    for (const issue of gate.issues) {
      lines.push(`- ${issue.id}: ${issue.title}${issue.nextAction ? `; next=${issue.nextAction}` : ''}`);
    }
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Warnings');
  if (gate.warnings?.length) {
    for (const warning of gate.warnings) {
      lines.push(`- ${warning.id}: ${warning.title}${warning.nextAction ? `; next=${warning.nextAction}` : ''}`);
    }
  } else {
    lines.push('- none');
  }
  lines.push('');
  return lines.join('\n');
}

function persistUnattendedGate(gate = {}, options = {}) {
  const date = dateOnly(gate.businessDate || options.today);
  const outFile = options.outFile || defaultAgentFile('unattended_gate', date);
  const markdownFile = options.markdownFile || defaultAgentFile('unattended_gate', date, 'md');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(gate, null, 2), 'utf8');
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, renderUnattendedGateMarkdown(gate), 'utf8');
  return { outFile, markdownFile };
}

module.exports = {
  buildUnattendedGate,
  persistUnattendedGate,
  renderUnattendedGateMarkdown,
};
