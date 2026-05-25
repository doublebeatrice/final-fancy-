const fs = require('fs');
const path = require('path');
const { run: defaultLegacyRun } = require('../../../auto_adjust');
const { persistAdjustmentLog: defaultPersistAdjustmentLog } = require('../../../scripts/execute/run_actions');

const ROOT = path.join(__dirname, '..', '..', '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'snapshots', 'capability_adapters');

function structuredError(code, message, details = {}, retryable = false) {
  return {
    code,
    message,
    details,
    retryable: retryable === true,
  };
}

function failure(capabilityId, mode, code, message, details = {}, retryable = false) {
  return {
    ok: false,
    capabilityId,
    mode,
    error: structuredError(code, message, details, retryable),
  };
}

function text(value) {
  return String(value || '').trim();
}

function hasValue(value) {
  return value !== undefined && value !== null && text(value) !== '';
}

function requiredFields(input = {}, fields = []) {
  return fields.filter(field => !hasValue(input[field]));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function evidenceList(value) {
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

function approvedActionBase(input = {}, source = 'capability_adapter') {
  return {
    decisionStage: input.decisionStage || 'ai_approved',
    approvedBy: input.approvedBy || 'codex',
    actionSource: Array.isArray(input.actionSource) && input.actionSource.length ? input.actionSource : ['codex'],
    source: input.source || source,
    requiresAiDecision: input.requiresAiDecision === true,
    forceExecute: input.forceExecute === true,
    confidence: finiteNumber(input.confidence) ?? 0.75,
    reason: input.reason || '',
    evidence: evidenceList(input.evidence),
  };
}

function writeSingleActionSchema(capabilityId, input = {}, action = {}, options = {}) {
  if (options.actionSchemaFile) return path.resolve(options.actionSchemaFile);
  const sku = text(input.sku || action.sku);
  if (!sku) {
    throw Object.assign(new Error('sku is required to build legacy action schema'), {
      code: 'SCHEMA_SKU_REQUIRED',
    });
  }
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const safeCapability = capabilityId.replace(/[^a-z0-9_.-]+/gi, '_');
  const safeSku = sku.replace(/[^a-z0-9_.-]+/gi, '_');
  const file = path.join(outDir, `${safeCapability}_${safeSku}_${Date.now()}_${process.pid}.json`);
  const schema = [{
    sku,
    asin: text(input.asin || action.asin),
    summary: input.summary || `Capability adapter schema for ${capabilityId}`,
    actions: [action],
  }];
  fs.writeFileSync(file, JSON.stringify(schema, null, 2), 'utf8');
  return file;
}

function summarizeLegacyResult(result = {}) {
  const report = result.report || result.dryReport || {};
  return {
    mode: result.mode || '',
    plannedSkus: report.plannedSkus ?? null,
    plannedActions: report.plannedActions ?? null,
    aiValidationErrorCount: (report.aiValidationErrors || []).length,
    finalCounts: report.finalCounts || null,
    files: result.files || {},
  };
}

async function runLegacyActionAdapter({ capabilityId, mode, input = {}, action = {}, options = {} }) {
  const runMode = mode === 'execute' ? 'execute' : 'dry-run';
  const snapshotFile = text(options.snapshotFile || input.snapshotFile);
  if (!snapshotFile) {
    return failure(capabilityId, runMode, 'SNAPSHOT_FILE_REQUIRED', 'snapshotFile is required for the legacy execution chain');
  }

  let actionSchemaFile = '';
  try {
    actionSchemaFile = writeSingleActionSchema(capabilityId, input, action, options);
  } catch (error) {
    return failure(capabilityId, runMode, error.code || 'ACTION_SCHEMA_BUILD_FAILED', error.message, { capabilityId });
  }

  const legacyRun = options.legacyRun || defaultLegacyRun;
  const persistAdjustmentLog = options.persistAdjustmentLog || defaultPersistAdjustmentLog;
  try {
    const legacyResult = await legacyRun({
      actionSchemaFile,
      snapshotFile: path.resolve(snapshotFile),
      dryRun: runMode !== 'execute',
      fastScope: options.fastScope,
      timeContext: options.timeContext,
      sourceRunId: options.sourceRunId,
    });
    let adjustmentLog = null;
    if (options.persistAdjustmentLog !== false) {
      adjustmentLog = persistAdjustmentLog(legacyResult);
    }
    return {
      ok: true,
      capabilityId,
      mode: runMode,
      dryRun: runMode !== 'execute',
      actionSchemaFile,
      snapshotFile: path.resolve(snapshotFile),
      action,
      legacyResult: summarizeLegacyResult(legacyResult),
      adjustmentLog,
      error: null,
    };
  } catch (error) {
    return failure(capabilityId, runMode, error.code || 'LEGACY_ACTION_RUN_FAILED', error.message, {
      actionSchemaFile,
      snapshotFile: path.resolve(snapshotFile),
    }, true);
  }
}

function summarizeEvents(events = []) {
  return events.reduce((acc, event) => {
    const status = text(event.finalStatus || event.apiStatus || 'unknown') || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function verifyFromLegacyArtifact({ capabilityId, mode = 'verify', input = {}, options = {} }) {
  const verifyFile = text(input.verifyFile || options.verifyFile || input.legacyResult?.files?.verifyFile);
  if (!verifyFile) {
    return failure(capabilityId, mode, 'VERIFY_FILE_REQUIRED', 'verifyFile or legacyResult.files.verifyFile is required');
  }
  try {
    const payload = readJson(path.resolve(verifyFile));
    const events = Array.isArray(payload.events) ? payload.events : [];
    return {
      ok: true,
      capabilityId,
      mode,
      verifyFile: path.resolve(verifyFile),
      finalCounts: payload.finalCounts || summarizeEvents(events),
      events,
      noteResults: payload.noteResults || [],
      error: null,
    };
  } catch (error) {
    return failure(capabilityId, mode, 'VERIFY_ARTIFACT_READ_FAILED', error.message, { verifyFile }, false);
  }
}

module.exports = {
  approvedActionBase,
  evidenceList,
  failure,
  finiteNumber,
  requiredFields,
  runLegacyActionAdapter,
  structuredError,
  text,
  verifyFromLegacyArtifact,
};
