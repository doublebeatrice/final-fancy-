#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createPanelWs, today } = require('../../src/adjust_lib');
const {
  decideFromPoolMembership,
  normalizeLowEfficiencyRow,
  buildWriterRequest,
} = require('../../src/low_efficiency_decision');
const { appendAdjustmentRecords, readAdjustmentLog } = require('../../src/adjustment_log');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const DRY_RUN = !EXECUTE;
const dateArgIndex = args.indexOf('--date');
const BUSINESS_DATE = dateArgIndex >= 0 && args[dateArgIndex + 1] ? args[dateArgIndex + 1] : today;

const KIND_TO_NORMALIZER = {
  kw: 'spKeyword',
  auto: 'spAuto',
  manual: 'spTarget',
  sbKw: 'sbKeyword',
  sbTarget: 'sbTarget',
};

const KIND_TO_ENTITY_TYPE = {
  kw: 'keyword',
  auto: 'autoTarget',
  manual: 'manualTarget',
  sbKw: 'sbKeyword',
  sbTarget: 'sbTarget',
};

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function entityKey(entityType, id) {
  return `${entityType}:${String(id || '').trim()}`;
}

function originalLowEfficiencyKeys(records = []) {
  const keys = new Set();
  const sourceRunIds = new Set();
  const prefix = `low_efficiency_${BUSINESS_DATE}_`;
  for (const record of records) {
    const sourceRunId = String(record.sourceRunId || '');
    if (record.dryRun === true) continue;
    if (!sourceRunId.startsWith(prefix)) continue;
    if (!String(record.reason || '').includes('[low_efficiency_pool')) continue;
    if (!record.entityType || !record.entityId) continue;
    keys.add(entityKey(record.entityType, record.entityId));
    sourceRunIds.add(sourceRunId);
  }
  return { keys, sourceRunIds: [...sourceRunIds].sort() };
}

function alreadyCorrectedKeys(records = []) {
  const keys = new Set();
  const prefix = `low_efficiency_severity_correction_${BUSINESS_DATE}_`;
  for (const record of records) {
    if (record.dryRun === true) continue;
    if (!String(record.sourceRunId || '').startsWith(prefix)) continue;
    if (!record.entityType || !record.entityId) continue;
    keys.add(entityKey(record.entityType, record.entityId));
  }
  return keys;
}

function isCorrectionDecision(decision = {}) {
  if (decision.actionType === 'pause') return true;
  const reasonCode = String(decision.reasonCode || '');
  return /hard_stop|heavy_cut|severe_acos_cut|extreme_acos_cut/.test(reasonCode);
}

function poolEntryToEntity(kind, entry) {
  const row = {
    [kind === 'kw' || kind === 'sbKw' ? 'keywordId' : 'targetId']: entry.id,
    keywordText: entry.keywordText || entry.text || entry.targetText || entry.targetType || '',
    matchType: entry.matchType,
    campaignId: entry.campaignId,
    adGroupId: entry.adGroupId,
    accountId: entry.accountId,
    siteId: entry.siteId || 4,
    campaignName: entry.campaignName,
    groupName: entry.groupName,
    state: entry.state ?? 1,
    campaignState: entry.campaignState ?? 1,
    groupState: entry.groupState ?? 1,
    bid: entry.bid,
    updatedAt: entry.updatedAt,
    operatedAt: entry.operatedAt,
  };
  const w = entry.windows || {};
  return normalizeLowEfficiencyRow(KIND_TO_NORMALIZER[kind], row, {
    metrics: {
      30: w['30'] || {},
      15: w['15'] || {},
      7: w['7'] || {},
      3: w['3'] || {},
    },
  });
}

async function withPanelWs(handler) {
  const ws = await createPanelWs();
  await new Promise(resolve => ws.on('open', resolve));
  const evalInPanel = (expression, awaitPromise = false) => new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const onMsg = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', onMsg);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const inner = response.result?.exceptionDetails;
      if (inner) return reject(new Error(inner.exception?.description || inner.text));
      resolve(response.result?.result?.value);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: !!awaitPromise } }));
  });
  try {
    return await handler(evalInPanel);
  } finally {
    ws.close();
  }
}

async function patchInPanel(evalInPanel, request) {
  const expression = `execAdWrite(${JSON.stringify(request.url)}, ${JSON.stringify(request.body)})`;
  return evalInPanel(expression, true);
}

function buildCorrectionActions(scan, landedKeys, correctedKeys) {
  const actions = [];
  const seen = new Set();
  for (const [kind, decisions] of Object.entries(scan.results || {})) {
    for (const item of decisions || []) {
      const entry = { ...(item.entry || {}), kind };
      const entityType = KIND_TO_ENTITY_TYPE[kind];
      const key = entityKey(entityType, entry.id);
      if (!landedKeys.has(key)) continue;
      if (correctedKeys.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      const decision = decideFromPoolMembership(entry, { now: new Date(), cooldownDays: -1 });
      if (!isCorrectionDecision(decision)) continue;
      if (decision.actionType === 'bid' && !(Number(decision.suggestedBid) < Number(entry.bid))) continue;
      if (decision.actionType !== 'bid' && decision.actionType !== 'pause') continue;
      actions.push({ kind, entry, decision, entityType, key });
    }
  }
  return actions;
}

function summarize(actions = []) {
  const summary = { total: actions.length, byKind: {}, byAction: {}, byReason: {} };
  for (const action of actions) {
    summary.byKind[action.kind] = (summary.byKind[action.kind] || 0) + 1;
    summary.byAction[action.decision.actionType] = (summary.byAction[action.decision.actionType] || 0) + 1;
    summary.byReason[action.decision.reasonCode] = (summary.byReason[action.decision.reasonCode] || 0) + 1;
  }
  return summary;
}

function sampleActions(actions = [], limit = 20) {
  return actions.slice(0, limit).map(({ kind, entry, decision }) => ({
    kind,
    id: entry.id,
    text: entry.keywordText || entry.text || entry.targetText || '',
    before: Number(entry.bid) || entry.bid,
    after: decision.actionType === 'bid' ? decision.suggestedBid : 'PAUSE',
    reasonCode: decision.reasonCode,
    reason: decision.reason,
  }));
}

async function main() {
  log(`mode=${DRY_RUN ? 'dry-run' : 'EXECUTE'} businessDate=${BUSINESS_DATE}`);
  const poolFile = path.join(ROOT, 'data', 'tasks', `low_efficiency_pools_${BUSINESS_DATE}.json`);
  const scan = readJson(poolFile, null);
  if (!scan) throw new Error(`Cannot read low-efficiency pool file: ${poolFile}`);

  const adjustmentRecords = readAdjustmentLog({ businessDate: BUSINESS_DATE });
  const { keys: landedKeys, sourceRunIds } = originalLowEfficiencyKeys(adjustmentRecords);
  const correctedKeys = alreadyCorrectedKeys(adjustmentRecords);
  if (!landedKeys.size) throw new Error(`No original live low-efficiency records found for ${BUSINESS_DATE}`);

  const actions = buildCorrectionActions(scan, landedKeys, correctedKeys);
  const plan = {
    generatedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    mode: DRY_RUN ? 'dry-run' : 'execute',
    sourceRunIds,
    originalLandedEntities: landedKeys.size,
    alreadyCorrectedEntities: correctedKeys.size,
    summary: summarize(actions),
    samples: sampleActions(actions),
    actions: actions.map(({ kind, entry, decision, entityType }) => ({
      kind,
      entityType,
      id: entry.id,
      text: entry.keywordText || entry.text || entry.targetText || '',
      campaignId: entry.campaignId,
      adGroupId: entry.adGroupId,
      before: Number(entry.bid) || entry.bid,
      after: decision.actionType === 'bid' ? decision.suggestedBid : 'PAUSE',
      actionType: decision.actionType,
      reasonCode: decision.reasonCode,
      reason: decision.reason,
    })),
  };
  const planFile = path.join(ROOT, 'data', 'tasks', `low_efficiency_severity_correction_${BUSINESS_DATE}.json`);
  writeJson(planFile, plan);

  log(`original landed low-efficiency entities=${landedKeys.size}; already corrected=${correctedKeys.size}`);
  log(`correction candidates=${actions.length}; plan=${planFile}`);
  log(`summary=${JSON.stringify(plan.summary)}`);
  for (const sample of plan.samples.slice(0, 8)) {
    log(`sample ${sample.kind}/${sample.id} "${sample.text}" ${sample.before} -> ${sample.after} ${sample.reasonCode}`);
  }

  if (DRY_RUN || !actions.length) return;

  const executions = [];
  await withPanelWs(async (evalInPanel) => {
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      const entity = poolEntryToEntity(action.kind, action.entry);
      const request = buildWriterRequest(entity, action.decision);
      try {
        const result = await patchInPanel(evalInPanel, request);
        const successList = Array.isArray(result?.data?.success) ? result.data.success : [];
        const errorList = Array.isArray(result?.data?.error) ? result.data.error : [];
        const ok = Number(result?.code) === 200 && successList.length > 0 && errorList.length === 0;
        executions.push({ ...action, request, result, ok });
        if (!ok || (i + 1) % 25 === 0 || i === actions.length - 1) {
          log(`PATCH progress ${i + 1}/${actions.length}: ${ok ? 'ok' : 'failed'} ${action.kind}/${action.entry.id} ${JSON.stringify(result || {}).slice(0, 200)}`);
        }
      } catch (error) {
        executions.push({ ...action, request, error: error.message, ok: false });
        log(`PATCH progress ${i + 1}/${actions.length}: error ${action.kind}/${action.entry.id} ${error.message}`);
      }
    }
  });

  const runAt = new Date().toISOString();
  const timeContext = {
    runAt,
    businessDate: BUSINESS_DATE,
    sourceRunId: `low_efficiency_severity_correction_${BUSINESS_DATE}_${Date.now()}`,
  };
  const records = actions.map((action, index) => {
    const exec = executions[index] || {};
    const text = action.entry.keywordText || action.entry.text || action.entry.targetText || '';
    const apiResultText = exec.result ? JSON.stringify(exec.result).slice(0, 500) : '';
    return {
      sku: action.entry.sku || `lowEff::${action.kind}::${action.entry.id}`,
      asin: '',
      site: 'Amazon.com',
      action: {
        entityType: action.entityType,
        actionType: action.decision.actionType,
        id: action.entry.id,
        text,
        campaignId: action.entry.campaignId,
        adGroupId: action.entry.adGroupId,
        currentBid: Number(action.entry.bid) || 0,
        suggestedBid: action.decision.suggestedBid || null,
        reason: `[low_efficiency_severity_correction:${action.decision.pattern}:${action.decision.reasonCode}] ${action.decision.reason}`,
        approvedBy: 'codex',
        decisionStage: 'ai_approved',
        actionSource: ['codex'],
      },
      outcome: exec.ok ? 'api_success' : 'api_failed',
      dryRun: false,
      reason: exec.error || (!exec.ok ? apiResultText : ''),
      meta: exec.result ? { apiResult: exec.result } : {},
    };
  });
  const appendResult = appendAdjustmentRecords(records.map(record => ({
    ...record,
    runAt: timeContext.runAt,
    businessDate: timeContext.businessDate,
    sourceRunId: timeContext.sourceRunId,
  })), { timeContext });

  const apiOk = executions.filter(event => event.ok).length;
  const apiFailed = executions.filter(event => !event.ok).length;
  log(`done. correction=${actions.length} api_ok=${apiOk} api_failed=${apiFailed} adjustmentLog=${appendResult.file} appended=${appendResult.count} sourceRunId=${timeContext.sourceRunId}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
