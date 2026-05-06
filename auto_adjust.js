const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { log, loadHistory, saveHistory, hasRecentOutcome, SNAPSHOTS_DIR, today, findAdPageId } = require('./src/adjust_lib');
const { hasRequiredVerification, loadExternalActionSchema } = require('./src/ai_decision');
const { analyzeAllowedOperationScope, applyAllowedOperationScope } = require('./src/operation_scope');
const { attachTimeToPlan, buildOpsTimeContext } = require('./src/ops_time');

const BATCH = 50;
const VERIFY_TOLERANCE = 0.0001;

function groupByAccountSite(items, getMeta, typeLabel, bucketKeys = []) {
  const groups = new Map();
  const skipped = [];

  for (const item of items) {
    const meta = getMeta(item) || {};
    if (!meta.accountId) {
      skipped.push(item);
      continue;
    }
    const siteId = meta.siteId || 4;
    const bucketValues = bucketKeys.map(key => String(meta[key] || ''));
    const key = [meta.accountId, siteId, ...bucketValues].join('::');
    if (!groups.has(key)) {
      groups.set(key, {
        accountId: meta.accountId,
        siteId,
        bucketValues,
        items: [],
      });
    }
    groups.get(key).items.push({ item, meta });
  }

  if (skipped.length) log(`${typeLabel} skipped ${skipped.length}: missing accountId/metadata`);
  return { groups, skipped };
}

function hasRecentCandidateBlock(history, candidateKey, days = 7) {
  if (!candidateKey) return false;
  return hasRecentOutcome(
    history,
    h => String(h.entityId || '') === candidateKey && String(h.candidateKey || '') === candidateKey,
    'blocked_by_system_recent_adjust',
    days
  );
}

function apiOk(result) {
  return !!(result && (result.code === 200 || result.msg === 'success' || result.msg === '鏇存柊鎴愬姛'));
}

function isSystemConflict(result) {
  const text = JSON.stringify(result || {});
  return !!(result && (result.code === 403 || /绯荤粺宸茶嚜鍔ㄨ皟鏁磡绂佹鎵嬪姩璋冩暣/.test(text)));
}

function classifyApiResult(result) {
  if (apiOk(result)) return 'api_success';
  if (isSystemConflict(result)) return 'blocked_by_system_recent_adjust';
  return 'failed';
}

function extractCreateResultMeta(result = {}) {
  const raw = result.rawResponse || result;
  const param = raw?.data?.param || result.param || {};
  return {
    siteId: param.siteId || result.siteId || '',
    accountId: param.accountId || result.accountId || '',
    campaignId: String(result.campaignId || param.campaignId || raw?.data?.campaignId || ''),
    adGroupId: String(result.adGroupId || param.adGroupId || raw?.data?.adGroupId || ''),
    campaignName: result.campaignName || param.campaignName || '',
    groupName: result.groupName || param.groupName || '',
    raw,
  };
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarize(events) {
  return events.reduce((acc, event) => {
    const status = event.finalStatus || event.apiStatus || 'unknown';
    const type = event.entityType || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    acc[`${type}:${status}`] = (acc[`${type}:${status}`] || 0) + 1;
    return acc;
  }, {});
}

function groupEventsBySku(events) {
  const map = new Map();
  for (const event of events || []) {
    const sku = String(event.sku || '').trim();
    if (!sku) continue;
    if (!map.has(sku)) map.set(sku, []);
    map.get(sku).push(event);
  }
  return map;
}

function normalizeSources(source) {
  if (Array.isArray(source)) return [...new Set(source.filter(Boolean))];
  if (!source) return ['codex'];
  return [source];
}

function readStats(row) {
  const spend = toNum(row?.spend7 ?? row?.Spend7 ?? row?.Spend ?? row?.spend ?? row?.cost ?? row?.Cost) || 0;
  const orders = toNum(row?.orders7 ?? row?.Orders7 ?? row?.Orders ?? row?.orders ?? row?.order) || 0;
  const sales = toNum(row?.sales7 ?? row?.Sales7 ?? row?.Sales ?? row?.sales) || 0;
  const clicks = toNum(row?.clicks7 ?? row?.Clicks7 ?? row?.Clicks ?? row?.clicks ?? row?.click) || 0;
  let acos = toNum(row?.acos7 ?? row?.ACOS7 ?? row?.ACOS ?? row?.acos);
  if (acos == null && sales > 0) acos = spend / sales;
  return { spend, orders, sales, clicks, acos: acos || 0 };
}

function dedupeKeyFor(action, meta = {}, sku = '') {
  const adType = action.adType || (String(action.entityType || '').startsWith('sb') ? 'SB' : 'SP');
  const entityLevel = action.entityLevel || action.entityType || '';
  return [
    meta.siteId || action.siteId || 4,
    adType,
    entityLevel,
    sku || action.sku || meta.sku || '',
    meta.campaignId || action.campaignId || '',
    meta.adGroupId || action.adGroupId || '',
    meta.keywordId || action.keywordId || (action.entityType === 'keyword' || action.entityType === 'sbKeyword' ? action.id : ''),
    meta.targetId || action.targetId || (action.entityType === 'autoTarget' || action.entityType === 'manualTarget' || action.entityType === 'sbTarget' ? action.id : ''),
  ].map(v => String(v ?? '')).join('::');
}

function executionEntityKey(entityType, id) {
  return `${String(entityType || '')}::${String(id || '')}`;
}

function entityRowId(row = {}) {
  return String(row.keywordId || row.targetId || row.target_id || row.adId || row.ad_id || row.campaignId || row.campaign_id || row.id || row.keyword_id || '').trim();
}

function campaignRowId(row = {}) {
  return String(row.campaignId || row.campaign_id || row.id || '').trim();
}

function isInvalidState(value) {
  const text = String(value ?? '').toUpperCase();
  return /PAUSED|ARCHIVED|DISABLED|ENDED|INCOMPLETE|CAMPAIGN_INCOMPLETE/.test(text) || text === '0' || text === '2';
}

function hasInactiveParentAdObject(row = {}) {
  return isInvalidState(row.campaignState ?? row.campaign_state ?? row.campaignStatus ?? row.campaign_status) ||
    isInvalidState(row.groupState ?? row.group_state ?? row.adGroupState ?? row.ad_group_state);
}

function sbRowIsVideo(meta = {}) {
  const adFormat = String(meta.adFormat || '').toLowerCase();
  const campaignName = String(meta.campaignName || '').toLowerCase();
  return adFormat === 'video' || campaignName.includes('sbv');
}

function minAllowedBidFor(action, meta = {}) {
  const entityType = String(action?.entityType || '');
  if ((entityType === 'sbKeyword' || entityType === 'sbTarget') && sbRowIsVideo(meta)) return 0.25;
  return 0.05;
}

function ensureTouchedBidChange(bid, factor, direction, minBid = 0.05) {
  const currentBid = toNum(bid);
  if (!currentBid || currentBid <= 0) return null;

  const rounded = parseFloat(Math.max(minBid, currentBid * factor).toFixed(2));
  if (Math.abs(rounded - currentBid) > 0.001) return rounded;

  if (direction === 'down') {
    const nudgedDown = parseFloat(Math.max(minBid, currentBid - 0.01).toFixed(2));
    if (nudgedDown < currentBid) return nudgedDown;
    return null;
  }

  const nudgedUp = parseFloat((currentBid + 0.01).toFixed(2));
  if (nudgedUp > currentBid) return nudgedUp;
  return null;
}

async function run(options = {}) {
  const dryRun = options.dryRun === true || (options.dryRun !== false && process.env.DRY_RUN === '1');
  const timeContext = options.timeContext || buildOpsTimeContext({
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId,
  });
  const adPageId = await findAdPageId();
  log(`Ad backend page ID: ${adPageId}`);
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${adPageId}`);
  const send = msg => ws.send(JSON.stringify(msg));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  await new Promise(resolve => ws.on('open', resolve));
  const closeWs = () => {
    try { ws.close(); } catch (_) {}
    try { ws.terminate(); } catch (_) {}
  };

  const eval_ = (expression, awaitPromise = false) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', handler);
      resolve(response.result && response.result.result && response.result.result.value);
    };
    ws.on('message', handler);
    send({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: !!awaitPromise },
    });
  });

  async function execAdApi(pathname, payload, method = 'PATCH') {
    const expression = `(async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch(${JSON.stringify(pathname)}, {
        method: ${JSON.stringify(method)},
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
        body: ${JSON.stringify(JSON.stringify(payload))}
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (error) {}
      return JSON.stringify(json || { code: 0, msg: text.slice(0, 500), httpStatus: res.status });
    })()`;
    const text = await eval_(expression, true);
    try {
      return JSON.parse(text || '{}');
    } catch (e) {
      return { code: 0, msg: e.message, raw: text };
    }
  }

  async function execCreateSpCampaign(createInput) {
    const built = buildSpCreatePayload(createInput);
    if (!built.ok) return built;
    const json = await execAdApi(built.requestUrl, built.requestBody, 'POST');
    const productAdsError = json?.data?.productAds?.error || {};
    const createdParam = json?.data?.param || {};
    const campaignId = String(json?.data?.campaignId || createdParam?.campaignId || '');
    const adGroupId = String(json?.data?.adGroupId || createdParam?.adGroupId || '');
    const ok = Number(json?.code) === 200 && !!campaignId && !!adGroupId;
    return {
      ...built,
      ok,
      responseCode: json?.code ?? null,
      responseMsg: json?.msg || '',
      campaignId,
      adGroupId,
      errorType: productAdsError?.errorType || '',
      reason: productAdsError?.reason || '',
      rawResponse: json,
      errors: ok ? [] : [json?.msg || 'createOneTime failed', productAdsError?.errorType || '', productAdsError?.reason || ''].filter(Boolean),
    };
  }

  const executionEvents = [];
  const landedIds = new Set();

  function recordExecutionEvent(item, entityType, apiStatus, result, meta = {}) {
    const planItem = plan.find(p => p.sku === item.sku) ||
      plan.find(p => (p.actions || []).some(a => String(a.id) === String(item.id)));
    const action = (planItem?.actions || []).find(a => String(a.id) === String(item.id) && a.entityType === entityType) ||
      (planItem?.actions || []).find(a => String(a.id) === String(item.id)) ||
      item;
    const productCard = (cards || []).find(card => String(card.sku || '') === String(item.sku || planItem?.sku || '')) || {};
    const learning = action.learning || item.learning || {};
    const executionLearning = {
      ...learning,
      executedAt: new Date().toISOString(),
      apiStatus,
      measurementStatus: apiStatus === 'api_success' ? 'pending_observation' : 'not_started',
      resultLabel: apiStatus === 'api_success' ? 'pending' : 'not_executable',
      attributionWeight: learning.baselineQuality === 'complete' ? 1 : 0.35,
      executionBaseline: {
        ...(learning.baseline || {}),
        sku: item.sku || planItem?.sku || productCard.sku || '',
        asin: productCard.asin || learning.baseline?.asin || '',
        siteId: meta.siteId || action.siteId || '',
        accountId: meta.accountId || action.accountId || '',
        campaignId: meta.campaignId || action.campaignId || '',
        adGroupId: meta.adGroupId || action.adGroupId || '',
        currentBid: item.currentBid ?? action.currentBid ?? meta.bid ?? null,
        suggestedBid: item.suggestedBid ?? action.suggestedBid ?? null,
        currentBudget: item.currentBudget ?? action.currentBudget ?? meta.budget ?? meta.dailyBudget ?? null,
        suggestedBudget: item.suggestedBudget ?? action.suggestedBudget ?? null,
        placementKey: item.placementKey ?? action.placementKey ?? '',
        currentPlacementPercent: item.currentPlacementPercent ?? action.currentPlacementPercent ?? null,
        suggestedPlacementPercent: item.suggestedPlacementPercent ?? action.suggestedPlacementPercent ?? null,
        product: {
          profitRate: productCard.profitRate ?? null,
          invDays: productCard.invDays ?? null,
          unitsSold_7d: productCard.unitsSold_7d ?? null,
          unitsSold_30d: productCard.unitsSold_30d ?? null,
          adDependency: productCard.adDependency ?? null,
          listingSessions: productCard.listingSessions || {},
          listingConversionRates: productCard.listingConversionRates || {},
        },
      },
    };
    const enrichedAction = {
      ...action,
      campaignId: action.campaignId || meta.campaignId || '',
      adGroupId: action.adGroupId || meta.adGroupId || '',
      accountId: action.accountId || meta.accountId || '',
      siteId: action.siteId || meta.siteId || '',
      campaignName: action.campaignName || meta.campaignName || '',
      groupName: action.groupName || meta.groupName || '',
      matchType: action.matchType || meta.matchType || '',
      learning: executionLearning,
    };
    executionEvents.push({
      sku: item.sku || planItem?.sku,
      id: item.id,
      siteId: meta.siteId || action.siteId || '',
      accountId: meta.accountId || action.accountId || '',
      campaignId: meta.campaignId || action.campaignId || '',
      adGroupId: meta.adGroupId || action.adGroupId || '',
      keywordId: meta.keywordId || action.keywordId || (entityType === 'keyword' || entityType === 'sbKeyword' ? item.id : ''),
      targetId: meta.targetId || meta.target_id || action.targetId || (entityType !== 'keyword' && entityType !== 'sbKeyword' ? item.id : ''),
      campaignName: meta.campaignName || action.campaignName || '',
      groupName: meta.groupName || action.groupName || '',
      bid: item.suggestedBid,
      suggestedBid: item.suggestedBid,
      currentBid: item.currentBid,
      suggestedBudget: item.suggestedBudget,
      currentBudget: item.currentBudget,
      placementKey: item.placementKey,
      suggestedPlacementPercent: item.suggestedPlacementPercent,
      currentPlacementPercent: item.currentPlacementPercent,
      entityType,
      apiStatus,
      success: false,
      plan: planItem || { sku: item.sku },
      action: enrichedAction,
      source: enrichedAction.source || item.source || 'codex',
      actionSource: normalizeSources(enrichedAction.actionSource || item.actionSource || enrichedAction.source || item.source),
      riskLevel: enrichedAction.riskLevel || item.riskLevel || '',
      learning: executionLearning,
      hypothesis: executionLearning.hypothesis || '',
      expectedEffect: executionLearning.expectedEffect || {},
      measurementWindowDays: executionLearning.measurementWindowDays || [1, 3, 7, 14, 30],
      baselineQuality: executionLearning.baselineQuality || 'unknown',
      dataQualityWarnings: executionLearning.dataQualityWarnings || [],
      canAutoExecute: enrichedAction.canAutoExecute !== false,
      dedupeKey: enrichedAction.dedupeKey || item.dedupeKey || '',
      executionKey: executionEntityKey(entityType, item.id),
      resultMessage: JSON.stringify(result || {}),
      errorReason: apiStatus === 'api_success' ? '' : JSON.stringify(result || {}),
    });
  }

  async function executeKeywordItems(items, metaById, typeLabel, endpoint, property, entityType, advType = 'SP') {
    let apiSuccess = 0;
    let apiFailed = 0;
    let apiSkipped = 0;
    const invalidParent = [];
    const validItems = [];
    for (const item of items) {
      const meta = metaById[String(item.id)];
      if (meta && hasInactiveParentAdObject(meta)) invalidParent.push({ item, meta });
      else validItems.push(item);
    }
    apiSkipped += invalidParent.length;
    invalidParent.forEach(({ item, meta }) => recordExecutionEvent(item, entityType, 'skipped_invalid_state', {
      msg: `parent campaign/ad group inactive; campaignState=${meta.campaignState ?? meta.campaign_state ?? ''}, groupState=${meta.groupState ?? meta.group_state ?? ''}`,
    }, meta));
    const { groups, skipped } = groupByAccountSite(
      validItems,
      item => metaById[String(item.id)],
      typeLabel,
      ['campaignId', 'adGroupId']
    );
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, entityType, 'failed', { msg: 'missing keyword metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += BATCH) {
        const batch = group.items.slice(i, i + BATCH);
        const rows = batch.map(({ item, meta }) => ({
          ...meta,
          keywordId: item.id,
          bid: String(item.suggestedBid),
          siteId: meta.siteId || 4,
          accountId: meta.accountId,
          campaignId: meta.campaignId,
          adGroupId: meta.adGroupId,
          matchType: meta.matchType,
          advType,
          bidThreshold: meta.bidThreshold,
          adFormat: meta.adFormat,
          costType: meta.costType,
        }));
        const payload = {
          column: 'bid',
          property,
          operation: 'bid',
          manualTargetType: '',
          accountId: group.accountId,
          siteId: group.siteId,
          idArray: batch.map(({ item }) => item.id),
          campaignIdArray: [...new Set(rows.map(r => r.campaignId).filter(Boolean))],
          targetArray: rows,
          targetNewArray: rows,
        };
        const result = await execAdApi(endpoint, payload, 'PATCH');
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += batch.length;
        else apiFailed += batch.length;
        batch.forEach(({ item, meta }) => recordExecutionEvent(item, entityType, status, result, meta));
        log(`${typeLabel} ${accountKey}: API ${status} ${batch.length}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed, apiSkipped };
  }

  async function executeTargetItems(items, rows, typeLabel, endpoint, property, entityType, advType = 'SP') {
    let apiSuccess = 0;
    let apiFailed = 0;
    let apiSkipped = 0;
    const findMeta = item => rows.find(r => String(r.targetId || r.target_id || r.id || '') === String(item.id));
    const invalidParent = [];
    const validItems = [];
    for (const item of items) {
      const meta = findMeta(item);
      if (meta && hasInactiveParentAdObject(meta)) invalidParent.push({ item, meta });
      else validItems.push(item);
    }
    apiSkipped += invalidParent.length;
    invalidParent.forEach(({ item, meta }) => recordExecutionEvent(item, entityType, 'skipped_invalid_state', {
      msg: `parent campaign/ad group inactive; campaignState=${meta.campaignState ?? meta.campaign_state ?? ''}, groupState=${meta.groupState ?? meta.group_state ?? ''}`,
    }, meta));
    const { groups, skipped } = groupByAccountSite(
      validItems,
      findMeta,
      typeLabel,
      ['campaignId', 'adGroupId']
    );
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, entityType, 'failed', { msg: 'missing target metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += BATCH) {
        const batch = group.items.slice(i, i + BATCH);
        const targetArray = batch.map(({ item, meta }) => ({
          ...meta,
          siteId: meta.siteId || 4,
          accountId: meta.accountId,
          campaignId: meta.campaignId,
          adGroupId: meta.adGroupId,
          targetId: item.id,
          bid: String(item.suggestedBid),
          advType,
          bidThreshold: meta.bidThreshold,
          adFormat: meta.adFormat,
          costType: meta.costType,
        }));
        const payload = {
          column: 'bid',
          property,
          operation: 'bid',
          accountId: group.accountId,
          siteId: group.siteId,
          idArray: batch.map(({ item }) => item.id),
          campaignIdArray: [...new Set(targetArray.map(r => r.campaignId).filter(Boolean))],
          targetArray,
          targetNewArray: targetArray,
        };
        const result = await execAdApi(endpoint, payload, 'PATCH');
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += batch.length;
        else apiFailed += batch.length;
        batch.forEach(({ item, meta }) => recordExecutionEvent(item, entityType, status, result, meta));
        log(`${typeLabel} ${accountKey}: API ${status} ${batch.length}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed };
  }

  async function executeSbCampaignItems(items, rows, typeLabel) {
    let apiSuccess = 0;
    let apiFailed = 0;
    const { groups, skipped } = groupByAccountSite(
      items,
      item => rows.find(r => String(r.campaignId || r.campaign_id || '') === String(item.id)),
      typeLabel
    );
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, 'sbCampaign', 'failed', { msg: 'missing sb campaign metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += BATCH) {
        const batch = group.items.slice(i, i + BATCH);
        const payload = {
          accountId: group.accountId,
          siteId: group.siteId,
          campaignIdArray: batch.map(({ item }) => String(item.id)),
          batchType: 'budget',
          batchValue: batch.map(({ item }) => item.suggestedBudget),
          campaignNewArray: batch.map(({ item, meta }) => ({
            siteId: meta.siteId || 4,
            accountId: meta.accountId,
            campaignId: String(item.id),
            budget: item.suggestedBudget,
          })),
        };
        const result = await execAdApi('/campaignSb/batchSbCampaign', payload, 'PATCH');
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += batch.length;
        else apiFailed += batch.length;
        batch.forEach(({ item, meta }) => recordExecutionEvent(item, 'sbCampaign', status, result, meta));
        log(`${typeLabel} ${accountKey}: API ${status} ${batch.length}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed };
  }

  async function executeSpCampaignBudgetItems(items, rows, typeLabel) {
    let apiSuccess = 0;
    let apiFailed = 0;
    let apiSkipped = 0;
    const { groups, skipped } = groupByAccountSite(
      items,
      item => rows.find(r => campaignRowId(r) === String(item.id)),
      typeLabel
    );
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, 'campaign', 'failed', { msg: 'missing sp campaign metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += BATCH) {
        const batch = group.items.slice(i, i + BATCH);
        const payload = {
          siteId: group.siteId,
          accountId: group.accountId,
          campaignNewArray: batch.map(({ item, meta }) => ({
            siteId: meta.siteId || group.siteId || 4,
            accountId: meta.accountId || group.accountId,
            campaignId: String(item.id),
            budget: Number(item.suggestedBudget).toFixed(2),
          })),
          batchType: 'add-budget-value',
          batch_campaigns: batch.map(({ item }) => String(item.id)),
          columnVal: batch.map(({ item }) => Number(item.suggestedBudget).toFixed(2)),
          campaignIdArray: batch.map(({ item }) => String(item.id)),
          column: 'budget',
          property: 'campaign',
          operation: 'dailyBudget',
        };
        const result = await execAdApi('/campaign/batchCampaign', payload, 'PATCH');
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += batch.length;
        else apiFailed += batch.length;
        batch.forEach(({ item, meta }) => recordExecutionEvent(item, 'campaign', status, result, meta));
        log(`${typeLabel} ${accountKey}: API ${status} ${batch.length}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed, apiSkipped };
  }

  async function executeSpCampaignPlacementItems(items, rows, typeLabel) {
    let apiSuccess = 0;
    let apiFailed = 0;
    const { groups, skipped } = groupByAccountSite(
      items,
      item => rows.find(r => campaignRowId(r) === String(item.id)),
      typeLabel
    );
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, 'campaign', 'failed', { msg: 'missing sp campaign metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (const { item, meta } of group.items) {
        const payload = {
          siteId: meta.siteId || group.siteId || 4,
          accountId: meta.accountId || group.accountId,
          campaignId: Number(item.id),
          key: item.placementKey,
          column: Number(item.suggestedPlacementPercent),
          property: 'campaign',
          campaignIdArray: [Number(item.id)],
          operation: 'placement',
        };
        const result = await execAdApi('/campaign/editCampaignColumn', payload, 'PATCH');
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += 1;
        else apiFailed += 1;
        recordExecutionEvent(item, 'campaign', status, result, meta);
        log(`${typeLabel} ${accountKey} ${item.placementKey}: API ${status}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed };
  }

  async function executeCreateItems(items) {
    let apiSuccess = 0;
    let apiFailed = 0;
    for (const item of items) {
      const createInput = item.createInput || {};
      if (String(createInput.advType || 'SP').toUpperCase() !== 'SP') {
        apiFailed += 1;
        recordExecutionEvent(item, 'skuCandidate', 'failed', { msg: 'SB create is not supported in this execution chain yet' });
        continue;
      }
      const result = await execCreateSpCampaign(createInput);
      const meta = extractCreateResultMeta(result);
      const status = (result?.ok || (classifyApiResult(meta.raw) === 'api_success' && meta.campaignId && meta.adGroupId))
        ? 'api_success'
        : classifyApiResult(meta.raw || result);
      if (status === 'api_success') apiSuccess += 1;
      else apiFailed += 1;
      recordExecutionEvent(item, 'skuCandidate', status, result, meta);
      log(`SP create ${item.sku || createInput.sku || '-'} ${createInput.mode || '-'}: ${status} campaignId=${meta.campaignId || '-'} adGroupId=${meta.adGroupId || '-'}`);
      await wait(500);
    }
    return { apiSuccess, apiFailed };
  }

  async function verifyLanding() {
    log('Refreshing changed rows for post-write verification...');
    const refreshText = await eval_(
      `(typeof refreshRowsForExecutionEvents === "function"
        ? refreshRowsForExecutionEvents(${JSON.stringify(executionEvents)}).then(d => JSON.stringify(d)).catch(e => JSON.stringify({ok:false,errors:[e.message]}))
        : Promise.resolve(JSON.stringify({ok:false,errors:["refreshRowsForExecutionEvents missing"]})))`,
      true
    );
    let refreshResult = {};
    try { refreshResult = JSON.parse(refreshText || '{}'); } catch (_) {}
    if (refreshResult.ok) {
      log(`Incremental verify refresh: ${JSON.stringify(refreshResult.refreshed || {})}`);
    } else {
      log(`Incremental verify refresh failed; falling back to full fetch: ${JSON.stringify(refreshResult.errors || [])}`);
      await eval_('STATE.kwRows = []; STATE.autoRows = []; STATE.targetRows = []; STATE.sbRows = [];');
      await eval_('fetchAllData().then(()=>true)', true);
    }
    const verifyScript = `
      (() => {
        const events = ${JSON.stringify(executionEvents)};
        const bidNum = value => {
          const n = Number(value);
          return Number.isFinite(n) ? n : null;
        };
        const normalizeState = value => {
          const text = String(value ?? '').trim();
          if (!text) return '';
          if (text === '1') return 'enabled';
          if (text === '2') return 'paused';
          const upper = text.toUpperCase();
          if (upper === 'ENABLED' || upper === 'ENABLE' || upper === 'ACTIVE') return 'enabled';
          if (upper === 'PAUSED' || upper === 'DISABLED' || upper === 'ARCHIVED' || upper === 'ENDED') return 'paused';
          const lower = text.toLowerCase();
          if (lower === 'enabled' || lower === 'enable' || lower === 'active') return 'enabled';
          if (lower === 'paused' || lower === 'disabled' || lower === 'archived' || lower === 'ended') return 'paused';
          return lower;
        };
        const expectedStateFor = event => {
          if (event.action?.actionType === 'enable') return 'enabled';
          if (event.action?.actionType === 'pause') return 'paused';
          return '';
        };
        const placementAliases = {
          placementTop: ['placementTop', 'topOfSearch', 'top_of_search', 'topSearch', 'topSearchPercent'],
          placementProductPage: ['placementProductPage', 'placementPage', 'productPage', 'product_page', 'detailPage', 'detailPagePercent'],
          placementRestOfSearch: ['placementRestOfSearch', 'restOfSearch', 'rest_of_search', 'otherPlacement', 'restSearchPercent'],
        };
        const placementNameMatches = (row, key) => {
          const text = String(row.placement || row.placementName || row.placement_name || row.position || row.positionName || row.targetingPlacement || '').toLowerCase();
          if (!text) return false;
          if (key === 'placementTop') return /top|search top|搜索顶部|首页/.test(text);
          if (key === 'placementProductPage') return /product|detail|商品|详情/.test(text);
          if (key === 'placementRestOfSearch') return /rest|other|其余|其他/.test(text);
          return false;
        };
        const parsePlacement = value => {
          if (value === undefined || value === null || value === '') return null;
          const text = String(value);
          const raw = text.includes(':') ? text.split(':').pop() : text;
          const n = Number(String(raw).replace('%', '').trim());
          return Number.isFinite(n) ? n : null;
        };
        const placementValueFromRows = (campaignId, key) => {
          const rows = (STATE.placementRows || []).filter(r => String(r.campaignId || r.campaign_id || '') === String(campaignId));
          for (const row of rows) {
            for (const field of placementAliases[key] || [key]) {
              const value = parsePlacement(row[field]);
              if (value != null) return value;
            }
            if (placementNameMatches(row, key)) {
              for (const field of ['percentage', 'percent', 'placementPercent', 'bidPlus', 'biddingAdjustment', 'adjustment', 'column', 'value']) {
                const value = parsePlacement(row[field]);
                if (value != null) return value;
              }
            }
          }
          return null;
        };
        const rowId = row => String(row.keywordId || row.targetId || row.target_id || row.adId || row.ad_id || row.id || row.keyword_id || '').trim();
        const rowsFor = type => {
          if (type === 'keyword') return STATE.kwRows || [];
          if (type === 'campaign') return [...(STATE.kwRows || []), ...(STATE.autoRows || []), ...(STATE.targetRows || []), ...(STATE.productAdRows || [])];
          if (type === 'manualTarget') return STATE.targetRows || [];
          if (type === 'productAd') return STATE.productAdRows || [];
          if (type === 'sbKeyword') return (STATE.sbRows || []).filter(r => String(r.__adProperty || '') === '4');
          if (type === 'sbTarget') return (STATE.sbRows || []).filter(r => String(r.__adProperty || '') === '6');
          if (type === 'sbCampaign') return STATE.sbCampaignRows || [];
          if (type === 'sbCampaignCandidate') return STATE.sb7DayUntouchedRows || [];
          return STATE.autoRows || [];
        };
        return JSON.stringify(events.map(event => {
          const out = { ...event };
          if (event.apiStatus === 'skipped_invalid_state') {
            out.finalStatus = 'skipped_invalid_state';
            out.success = false;
            out.errorReason = event.errorReason || event.resultMessage || 'skipped_invalid_state';
            return out;
          }
          if (event.apiStatus !== 'api_success') {
            out.finalStatus = event.apiStatus === 'blocked_by_system_recent_adjust' || event.apiStatus === 'conflict' ? 'blocked_by_system_recent_adjust' : 'failed';
            out.success = false;
            out.errorReason = event.errorReason || event.resultMessage || '';
            return out;
          }
          const sourceTags = Array.isArray(event.actionSource) ? event.actionSource : (event.actionSource ? [event.actionSource] : []);
          const isSpSevenDayTouch = sourceTags.includes('sp_7day_untouched');
          if (isSpSevenDayTouch) {
            const stillInSpUntouchedPool = (STATE.sp7DayUntouchedRows || []).some(r =>
              String(r.campaignId || r.campaign_id || '') === String(event.action?.campaignId || '') &&
              String(r.adGroupId || r.ad_group_id || '') === String(event.action?.adGroupId || '')
            );
            out.stillInSpUntouchedPool = stillInSpUntouchedPool;
            if (!stillInSpUntouchedPool) {
              out.finalStatus = 'success';
              out.success = true;
              out.errorReason = '';
              return out;
            }
          }
          if (event.action?.actionType === 'enable' || event.action?.actionType === 'pause') {
            const row = rowsFor(event.entityType).find(r => rowId(r) === String(event.id));
            const expectedState = expectedStateFor(event);
            const actualState = row ? normalizeState(row.state ?? row.status ?? row.servingStatus ?? row.activeStatus) : '';
            out.rowFound = !!row;
            out.expectedState = expectedState;
            out.actualState = actualState;
            if (row && actualState === expectedState) {
              out.finalStatus = 'success';
              out.success = true;
              out.errorReason = '';
            } else {
              out.finalStatus = 'not_landed';
              out.success = false;
              out.errorReason = row ? 'state action API success but state not landed' : 'state action API success but row missing on verify';
            }
            return out;
          }
          if (event.entityType === 'sbCampaign') {
            const row = (STATE.sbCampaignRows || []).find(r => String(r.campaignId || r.campaign_id || '') === String(event.id));
            out.rowFound = !!row;
            if (event.action?.actionType === 'enable' || event.action?.actionType === 'pause') {
              const expectedState = expectedStateFor(event);
              const actualState = row ? normalizeState(row.state ?? row.status ?? row.activeStatus) : '';
              out.expectedState = expectedState;
              out.actualState = actualState;
              if (row && actualState === expectedState) {
                out.finalStatus = 'success';
                out.success = true;
                out.errorReason = '';
              } else {
                out.finalStatus = 'not_landed';
                out.success = false;
                out.errorReason = row ? 'sb campaign state action API success but state not landed' : 'sb campaign state action API success but row missing on verify';
              }
              return out;
            }
            const expected = bidNum(event.suggestedBudget ?? event.suggestedBid ?? event.bid);
            const actual = row ? bidNum(row.budget ?? row.dailyBudget) : null;
            out.expectedBid = expected;
            out.actualBid = actual;
            if (row && actual != null && expected != null && Math.abs(actual - expected) < ${VERIFY_TOLERANCE}) {
              out.finalStatus = 'success';
              out.success = true;
              out.errorReason = '';
            } else {
              out.finalStatus = 'not_landed';
              out.success = false;
              out.errorReason = row
                ? 'sb campaign budget verify did not land in campaign management table'
                : 'sb campaign budget action API success but row missing in campaign management table';
            }
            return out;
          }
          if (event.entityType === 'campaign') {
            const row = rowsFor(event.entityType).find(r => String(r.campaignId || r.campaign_id || '') === String(event.id));
            out.rowFound = !!row;
            if (event.action?.actionType === 'budget') {
              const expected = bidNum(event.suggestedBudget);
              const actual = row ? bidNum(row.budget ?? row.dailyBudget ?? row.daily_budget) : null;
              out.expectedBudget = expected;
              out.actualBudget = actual;
              if (row && actual != null && expected != null && Math.abs(actual - expected) < ${VERIFY_TOLERANCE}) {
                out.finalStatus = 'success';
                out.success = true;
                out.errorReason = '';
              } else {
                out.finalStatus = 'not_landed';
                out.success = false;
                out.errorReason = row ? 'sp campaign budget verify did not land' : 'sp campaign budget action API success but row missing';
              }
              return out;
            }
            if (event.action?.actionType === 'placement') {
              const key = event.placementKey || event.action?.placementKey || '';
              const expected = bidNum(event.suggestedPlacementPercent);
              const placementActual = placementValueFromRows(event.id, key);
              const actual = placementActual != null ? placementActual : (row ? parsePlacement(row[key] ?? row.placementPage) : null);
              out.expectedPlacementPercent = expected;
              out.actualPlacementPercent = actual;
              out.placementRowFound = placementActual != null;
              if ((row || placementActual != null) && actual != null && expected != null && Math.abs(actual - expected) < ${VERIFY_TOLERANCE}) {
                out.finalStatus = 'success';
                out.success = true;
                out.errorReason = '';
              } else {
                out.finalStatus = 'not_landed';
                out.success = false;
                out.errorReason = row || placementActual != null ? 'sp campaign placement verify did not land' : 'sp campaign placement action API success but row missing';
              }
              return out;
            }
          }
          if (event.action?.actionType === 'create') {
            const campaignId = String(event.campaignId || event.action?.campaignId || '').trim();
            const campaignName = String(event.campaignName || event.action?.campaignName || '').trim();
            const allRows = [
              ...(STATE.kwRows || []),
              ...(STATE.autoRows || []),
              ...(STATE.targetRows || []),
              ...(STATE.sbRows || []),
            ];
            const row = allRows.find(r =>
              (campaignId && String(r.campaignId || r.campaign_id || '') === campaignId) ||
              (campaignName && String(r.campaignName || r.campaign_name || '') === campaignName)
            );
            out.rowFound = !!row;
            out.createdCampaignId = campaignId;
            out.createdCampaignName = campaignName;
            if (row) {
              out.finalStatus = 'success';
              out.success = true;
              out.errorReason = '';
            } else if (campaignId) {
              out.finalStatus = 'created_pending_visibility';
              out.success = true;
              out.errorReason = 'create API returned campaign/adGroup ids but list snapshot has not shown the new rows yet';
            } else {
              out.finalStatus = 'not_landed';
              out.success = false;
              out.errorReason = 'create API success but campaign id missing during verify';
            }
            return out;
          }
          const row = rowsFor(event.entityType).find(r => rowId(r) === String(event.id));
          const expected = bidNum(event.suggestedBid ?? event.bid);
          const actual = row ? bidNum(row.bid ?? row.defaultBid ?? row.cpcBid) : null;
          out.rowFound = !!row;
          out.expectedBid = expected;
          out.actualBid = actual;
          if (row && expected != null && actual != null && Math.abs(actual - expected) < ${VERIFY_TOLERANCE}) {
            out.finalStatus = 'success';
            out.success = true;
            out.errorReason = '';
          } else {
            out.finalStatus = 'not_landed';
            out.success = false;
            out.errorReason = row ? 'api success but verify value did not land' : 'api success but row missing during verify';
          }
          return out;
        }));
      })()
    `;
    const text = await eval_(verifyScript, true);
    if (!text) {
      return executionEvents.map(event => ({
        ...event,
        finalStatus: event.apiStatus === 'api_success' ? 'verify_failed' : (event.apiStatus || 'failed'),
        success: false,
        errorReason: event.apiStatus === 'api_success'
          ? 'verification script returned empty result'
          : (event.errorReason || event.resultMessage || ''),
      }));
    }
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const needsRetry = parsed.some(event =>
          event.apiStatus === 'api_success' &&
          event.finalStatus === 'not_landed' &&
          event.rowFound === false
        );
        if (needsRetry) {
          log('Post-write verification had missing rows; retrying after backend sync delay...');
          await wait(15000);
          const retryRefreshText = await eval_(
            `(typeof refreshRowsForExecutionEvents === "function"
              ? refreshRowsForExecutionEvents(${JSON.stringify(executionEvents)}).then(d => JSON.stringify(d)).catch(e => JSON.stringify({ok:false,errors:[e.message]}))
              : Promise.resolve(JSON.stringify({ok:false,errors:["refreshRowsForExecutionEvents missing"]})))`,
            true
          );
          let retryRefresh = {};
          try { retryRefresh = JSON.parse(retryRefreshText || '{}'); } catch (_) {}
          if (!retryRefresh.ok) {
            await eval_('STATE.kwRows = []; STATE.autoRows = []; STATE.targetRows = []; STATE.sbRows = [];');
            await eval_('fetchAllData().then(()=>true)', true);
          }
          const retryText = await eval_(verifyScript, true);
          try {
            const retryParsed = JSON.parse(retryText || '[]');
            if (Array.isArray(retryParsed)) return retryParsed.map(event => ({ ...event, verifyRetry: true }));
          } catch (_) {}
        }
        return parsed;
      }
    } catch (_) {}
    return executionEvents.map(event => ({
      ...event,
      finalStatus: event.apiStatus === 'api_success' ? 'verify_failed' : (event.apiStatus || 'failed'),
      success: false,
      errorReason: event.apiStatus === 'api_success'
        ? `verification script returned invalid JSON: ${String(text).slice(0, 300)}`
        : (event.errorReason || event.resultMessage || ''),
    }));
  }

  async function fetchSnapshotlessDataDirect() {
    throw new Error('Direct-page execution requires a snapshot file. Export/fetch scripts must provide --snapshot; extension panel fetch is no longer part of execution.');
  }

  function loadSnapshotFile(snapshotFile) {
    if (!snapshotFile) return null;
    const resolved = path.resolve(snapshotFile);
    const snapshot = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    log(`Using execution snapshot file: ${resolved}`);
    return {
      meta: {
        cards: (snapshot.productCards || []).length,
        kwRows: (snapshot.kwRows || []).length,
        autoRows: (snapshot.autoRows || []).length,
        targetRows: (snapshot.targetRows || []).length,
        productAdRows: (snapshot.productAdRows || []).length,
        sbRows: (snapshot.sbRows || []).length,
        sbCampaignRows: (snapshot.sbCampaignRows || []).length,
        sellerSalesRows: (snapshot.sellerSalesRows || []).length,
        inventoryScopeRows: (snapshot.inventoryScopeRows || []).length,
        invMap: Object.keys(snapshot.invMap || {}).length,
        sp7: (snapshot.sp7DayUntouchedRows || []).length,
        sb7: (snapshot.sb7DayUntouchedRows || []).length,
        snapshotFile: resolved,
        exportedAt: snapshot.exportedAt || '',
      },
      cards: snapshot.productCards || [],
      kwRows: snapshot.kwRows || [],
      autoTargetRows: snapshot.autoRows || [],
      manualTargetRows: snapshot.targetRows || [],
      productAdRows: snapshot.productAdRows || [],
      sbRows: snapshot.sbRows || [],
      sbCampaignRows: snapshot.sbCampaignRows || [],
      sellerSalesRows: snapshot.sellerSalesRows || [],
      sellerSalesMeta: snapshot.sellerSalesMeta || {},
      inventoryScopeRows: snapshot.inventoryScopeRows || [],
      invMap: snapshot.invMap || {},
      sp7DayRows: snapshot.sp7DayUntouchedRows || [],
      sb7DayRows: snapshot.sb7DayUntouchedRows || [],
      sevenDayMeta: snapshot.sevenDayUntouchedMeta || {},
      fetchMetrics: snapshot.fetchMetrics || {},
    };
  }

  log('=== Auto adjustment run started ===');
  const snapshotFile = options.snapshotFile || process.env.PANEL_SNAPSHOT_FILE || '';
  const snapshotData = loadSnapshotFile(snapshotFile);
  log(snapshotData ? 'Loading execution context from snapshot...' : 'Fetching full data...');
  let fetchMeta = null;
  fetchMeta = snapshotData ? snapshotData.meta : await fetchSnapshotlessDataDirect();
  if (snapshotData) {
    const directState = {
      productCards: [],
      kwRows: snapshotData.kwRows || [],
      autoRows: snapshotData.autoTargetRows || [],
      targetRows: snapshotData.manualTargetRows || [],
      productAdRows: snapshotData.productAdRows || [],
      sbRows: snapshotData.sbRows || [],
      sbCampaignRows: snapshotData.sbCampaignRows || [],
      sp7DayUntouchedRows: snapshotData.sp7DayRows || [],
      sb7DayUntouchedRows: snapshotData.sb7DayRows || [],
      placementRows: snapshotData.placementRows || [],
      invMap: snapshotData.invMap || {},
    };
    await eval_(`(() => {
      window.STATE = ${JSON.stringify(directState)};
      window.execAdWrite = async (pathname, payload, method = 'PATCH') => {
        const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
        const res = await fetch(pathname, {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        try { return JSON.parse(text); } catch (error) { return { code: 0, msg: text.slice(0, 500), httpStatus: res.status }; }
      };
      window.refreshRowsForExecutionEvents = async events => {
        const rowId = row => String(row.keywordId || row.targetId || row.target_id || row.adId || row.ad_id || row.id || row.keyword_id || '').trim();
        const campaignRowId = row => String(row.campaignId || row.campaign_id || row.id || '').trim();
        const updateRows = (rows, event) => {
          for (const row of rows || []) {
            if (rowId(row) === String(event.id)) {
              if (event.suggestedBid !== undefined) row.bid = event.suggestedBid;
              if (event.action?.actionType === 'enable') row.state = '1';
              if (event.action?.actionType === 'pause') row.state = '2';
            }
            if (campaignRowId(row) === String(event.id) && event.suggestedBudget !== undefined) {
              row.budget = event.suggestedBudget;
              row.dailyBudget = event.suggestedBudget;
            }
          }
        };
        for (const event of events || []) {
          if (event.apiStatus !== 'api_success') continue;
          for (const rows of [STATE.kwRows, STATE.autoRows, STATE.targetRows, STATE.productAdRows, STATE.sbRows, STATE.sbCampaignRows]) updateRows(rows, event);
          if (event.action?.actionType === 'create' && event.campaignId) {
            STATE.autoRows = STATE.autoRows || [];
            STATE.autoRows.push({
              campaignId: event.campaignId,
              adGroupId: event.adGroupId,
              campaignName: event.campaignName,
              campaign_name: event.campaignName,
              bid: event.suggestedBid || event.action?.createInput?.defaultBid || '',
              budget: event.action?.createInput?.dailyBudget || '',
              state: '1'
            });
          }
        }
        return { ok: true, refreshed: { directPageState: true } };
      };
      window.hydrateInventorySnapshot = invMap => {
        window.STATE = window.STATE || {};
        window.STATE.invMap = invMap || {};
        return { ok: true, added: Object.keys(invMap || {}).length, total: Object.keys(invMap || {}).length };
      };
      window.ensureInventoryRecordsForSkus = async skus => ({ ok: true, requested: (skus || []).length, missingAfter: [] });
      window.appendInventoryOperationNotes = async events => (events || []).map(event => ({ sku: event.sku, ok: true, directPageStatusOnly: true }));
      return true;
    })()`, true);
    const hydrateResultText = await eval_(
      'window.hydrateInventorySnapshot ? ' +
      'JSON.stringify(window.hydrateInventorySnapshot(' + JSON.stringify(snapshotData.invMap || {}) + ')) : ' +
      'JSON.stringify({ ok:false, reason:"hydrateInventorySnapshot unavailable" })',
      true
    );
    try {
      const hydrateResult = JSON.parse(hydrateResultText || '{}');
      if (hydrateResult.ok) log(`Hydrated inventory map from snapshot: ${hydrateResult.added || 0} added, total=${hydrateResult.total || 0}`);
      else log(`Inventory snapshot hydrate skipped: ${hydrateResult.reason || 'unknown'}`);
    } catch (e) {
      log(`Inventory snapshot hydrate parse failed: ${e.message}`);
    }
  }
  while (false) {
    await wait(10000);
    const logText = await eval_('document.getElementById("log").innerText');
    if (logText && logText.includes('鍏ㄩ噺鏁版嵁灏辩华')) {
      log('Data ready');
      break;
    }
    if (logText && logText.includes('鎷夊彇澶辫触')) {
      log(`Fatal fetch error: ${(logText || '').split('\n').slice(-1)[0]}`);
      ws.close();
      process.exit(1);
    }
    const last = (logText || '').split('\n').filter(Boolean).slice(-1)[0] || '';
    if (last) log(`  ${last}`);
  }

  const cards = snapshotData ? snapshotData.cards : JSON.parse(await eval_('JSON.stringify(STATE.productCards)') || '[]');
  const kwRows = snapshotData ? snapshotData.kwRows : JSON.parse(await eval_('JSON.stringify(STATE.kwRows)') || '[]');
  const autoTargetRows = snapshotData ? snapshotData.autoTargetRows : JSON.parse(await eval_('JSON.stringify(STATE.autoRows)') || '[]');
  const manualTargetRows = snapshotData ? snapshotData.manualTargetRows : JSON.parse(await eval_('JSON.stringify(STATE.targetRows)') || '[]');
  const productAdRows = snapshotData ? (snapshotData.productAdRows || []) : JSON.parse(await eval_('JSON.stringify(STATE.productAdRows || [])') || '[]');
  const sbRows = snapshotData ? snapshotData.sbRows : JSON.parse(await eval_('JSON.stringify(STATE.sbRows || [])') || '[]');
  const sbCampaignRows = snapshotData ? (snapshotData.sbCampaignRows || []) : JSON.parse(await eval_('JSON.stringify(STATE.sbCampaignRows || [])') || '[]');
  const sbKwRows = sbRows.filter(r => String(r.__adProperty) === '4');
  const sbTargetRows = sbRows.filter(r => String(r.__adProperty) === '6');
  const sp7DayRows = snapshotData ? snapshotData.sp7DayRows : JSON.parse(await eval_('JSON.stringify(STATE.sp7DayUntouchedRows || [])') || '[]');
  const sb7DayRows = snapshotData ? snapshotData.sb7DayRows : JSON.parse(await eval_('JSON.stringify(STATE.sb7DayUntouchedRows || [])') || '[]');
  const sevenDayMeta = snapshotData ? snapshotData.sevenDayMeta : JSON.parse(await eval_('JSON.stringify(STATE.sevenDayUntouchedMeta || {})') || '{}');
  const inventoryScopeRows = snapshotData ? snapshotData.inventoryScopeRows : JSON.parse(await eval_('JSON.stringify(STATE.inventoryScopeRows || [])') || '[]');
  const invMap = snapshotData ? snapshotData.invMap : JSON.parse(await eval_('JSON.stringify(STATE.invMap || {})') || '{}');
  const scopeAnalysis = analyzeAllowedOperationScope({
    productCards: cards,
    inventoryScopeRows,
    invMap,
  });
  log(`Product cards: ${cards.length}; SP keywords: ${kwRows.length}; SP auto: ${autoTargetRows.length}; SP manual targets: ${manualTargetRows.length}; SB keywords: ${sbKwRows.length}; SB targets: ${sbTargetRows.length}`);
  log(`7d untouched: SP candidates=${sp7DayRows.length}; SB candidates=${sb7DayRows.length}; SP granularity=${sevenDayMeta.sp?.entityLevel || 'unknown'}; SB granularity=${sevenDayMeta.sb?.entityLevel || 'unknown'}`);
  log(`Allowed operation scope: rows=${scopeAnalysis.summary.allowedScopeRowCount}; uniqueSkus=${scopeAnalysis.summary.allowedScopeSkuCount}; duplicates=${scopeAnalysis.summary.duplicateScopeSkuCount}`);
  if (!cards.length) {
    closeWs();
    throw new Error(`No product cards after full fetch. Last fetch meta: ${JSON.stringify(fetchMeta || {})}`);
  }

  const history = loadHistory();
  const rowsByType = {
    keyword: kwRows,
    autoTarget: autoTargetRows,
    manualTarget: manualTargetRows,
    productAd: productAdRows,
    sbKeyword: sbKwRows,
    sbTarget: sbTargetRows,
    sbCampaign: sbCampaignRows,
    sbCampaignCandidate: sb7DayRows,
    campaign: [...kwRows, ...autoTargetRows, ...manualTargetRows, ...productAdRows],
  };
  const aiDecisionRaw = loadExternalActionSchema({
    cards,
    rowsByType,
    sp7DayRows,
    sb7DayRows,
    history,
    sevenDayMeta,
    snapshotDir: SNAPSHOTS_DIR,
    actionSchemaFile: options.actionSchemaFile || process.env.ACTION_SCHEMA_FILE,
  });
  const aiDecision = applyAllowedOperationScope(aiDecisionRaw, scopeAnalysis);
  const verificationBlocked = [];
  let plan = (aiDecision.plan || []).map(item => {
    const actions = [];
    for (const action of item.actions || []) {
      if (hasRequiredVerification(action)) {
        actions.push(action);
        continue;
      }
      verificationBlocked.push({
        sku: item.sku,
        action: {
          ...action,
          actionType: 'review',
          canAutoExecute: false,
          riskLevel: action.riskLevel || 'manual_review',
          reason: `${action.reason || ''} [execution_gate:missing_verify_spec]`.trim(),
        },
      });
    }
    return { ...item, actions };
  }).filter(item => (item.actions || []).length > 0);
  plan = attachTimeToPlan(plan, timeContext);
  const aiReview = [...(aiDecision.review || []), ...verificationBlocked];
  const aiSkipped = aiDecision.skipped || [];
  const aiValidationErrors = aiDecision.errors || [];
  const scopeSummary = aiDecision.scope || scopeAnalysis.summary || {};
  const totalActions = plan.reduce((sum, item) => sum + item.actions.length, 0);
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `plan_${today}.json`), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `seven_day_untouched_${today}.json`), JSON.stringify({ meta: sevenDayMeta, spRows: sp7DayRows, sbRows: sb7DayRows, review: aiReview, skipped: aiSkipped }, null, 2));
  log(`External action schema loaded: ${plan.length} SKUs, ${totalActions} actions; review=${aiReview.length}; skipped=${aiSkipped.length}; validationErrors=${aiValidationErrors.length}`);
  if (dryRun) {
    const allActions = plan.flatMap(p => (p.actions || []).map(a => ({ ...a, sku: p.sku })));
    const drySummary = allActions.reduce((acc, action) => {
      for (const source of normalizeSources(action.actionSource)) acc[`source:${source}`] = (acc[`source:${source}`] || 0) + 1;
      acc[`type:${action.entityType}`] = (acc[`type:${action.entityType}`] || 0) + 1;
      acc[`risk:${action.riskLevel || 'normal'}`] = (acc[`risk:${action.riskLevel || 'normal'}`] || 0) + 1;
      return acc;
    }, {});
    const dryReport = {
      dryRun: true,
      time: timeContext,
      runAt: timeContext.runAt,
      businessDate: timeContext.businessDate,
      dataDate: timeContext.dataDate,
      siteTimezone: timeContext.siteTimezone,
      sourceRunId: timeContext.sourceRunId,
      plannedSkus: plan.length,
      plannedActions: totalActions,
      decisionSource: aiDecision.decisionSource,
      actionSchemaFile: aiDecision.actionSchemaFile,
      aiValidationErrors,
      totalProductCards: scopeSummary.totalProductCards || cards.length,
      allowedScopeSkuCount: scopeSummary.allowedScopeSkuCount || 0,
      schemaSkuCount: scopeSummary.schemaSkuCount || 0,
      outOfScopeSkus: scopeSummary.outOfScopeSkus || 0,
      reviewSkus: scopeSummary.reviewSkus || 0,
      executableSkus: scopeSummary.executableSkus || 0,
      outOfScopeSkuList: scopeSummary.outOfScopeSkuList || [],
      fetchMetrics: snapshotData?.fetchMetrics || {},
      stageTimingTop10: (snapshotData?.fetchMetrics?.stages || [])
        .slice()
        .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
        .slice(0, 10)
        .map(stage => ({
          stage: stage.stage,
          durationMs: stage.durationMs,
          attempted: stage.attempted || 0,
          success: stage.success || 0,
          failed: stage.failed || 0,
          skipped: stage.skipped || 0,
          avgMs: stage.avgMs || stage.durationMs || 0,
          p95Ms: stage.p95Ms || stage.durationMs || 0,
        })),
      sevenDayStats: {
        spCandidates: sp7DayRows.length,
        spExecutable: allActions.filter(a => normalizeSources(a.actionSource).includes('sp_7day_untouched') && a.canAutoExecute !== false).length,
        sbCandidates: sb7DayRows.length,
        sbExecutable: allActions.filter(a => normalizeSources(a.actionSource).includes('sb_7day_untouched') && a.canAutoExecute !== false).length,
        overlapWithStrategy: 0,
        manualReview: aiReview.length,
        invalidSkipped: aiSkipped.length,
        granularity: sevenDayMeta,
      },
      drySummary,
    };
    const dryRunFile = path.join(SNAPSHOTS_DIR, `execution_dry_run_${today}.json`);
    fs.writeFileSync(dryRunFile, JSON.stringify(dryReport, null, 2));
    log(`DRY_RUN complete: ${JSON.stringify(dryReport.sevenDayStats)}`);
    closeWs();
    return {
      mode: 'dry-run',
      dryReport,
      verificationBlocked,
      files: {
        dryRunFile,
        planFile: path.join(SNAPSHOTS_DIR, `plan_${today}.json`),
        contextFile: path.join(SNAPSHOTS_DIR, 'ai_decision_context.json'),
        validatedPlanFile: path.join(SNAPSHOTS_DIR, 'ai_decision_validated_plan.json'),
      },
    };
  }

  if (aiValidationErrors.length) {
    closeWs();
    throw new Error(`Action schema validation failed; refusing real execution. errors=${aiValidationErrors.length}`);
  }

  const kwItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'keyword' && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const atItems = plan.flatMap(p => p.actions.filter(a => (a.entityType === 'autoTarget' || a.entityType === 'manualTarget') && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const sbKwItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'sbKeyword' && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const sbTargetItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'sbTarget' && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const sbCampaignItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'sbCampaign' && !['enable', 'pause'].includes(a.actionType)).map(a => ({ ...a, sku: p.sku })));
  const spCampaignBudgetItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'campaign' && a.actionType === 'budget').map(a => ({ ...a, sku: p.sku })));
  const spCampaignPlacementItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'campaign' && a.actionType === 'placement').map(a => ({ ...a, sku: p.sku })));
  const stateItems = plan.flatMap(p => p.actions.filter(a => ['enable', 'pause'].includes(a.actionType)).map(a => ({ ...a, sku: p.sku })));
  const createItems = plan.flatMap(p => p.actions.filter(a => a.actionType === 'create').map(a => ({ ...a, sku: p.sku })));

  const kwMeta = Object.fromEntries(kwRows.map(row => [String(row.keywordId), row]));
  const sbKwMeta = Object.fromEntries(sbKwRows.map(row => [String(row.keywordId), row]));
  const spCampaignRows = [...kwRows, ...autoTargetRows, ...manualTargetRows, ...productAdRows].filter(row => campaignRowId(row));
  const autoTargetIds = new Set(autoTargetRows.map(row => String(row.targetId || row.target_id || row.id || '')));
  const manualTargetIds = new Set(manualTargetRows.map(row => String(row.targetId || row.target_id || row.id || '')));
  const spAutoItems = atItems.filter(item => autoTargetIds.has(String(item.id)));
  const spManualItems = atItems.filter(item => manualTargetIds.has(String(item.id)) && !autoTargetIds.has(String(item.id)));
  const spUnknownItems = atItems.filter(item => !autoTargetIds.has(String(item.id)) && !manualTargetIds.has(String(item.id)));
  spUnknownItems.forEach(item => recordExecutionEvent(item, 'autoTarget', 'failed', { msg: 'missing target row metadata' }));

  const apiStats = {};
  async function executeStateItems(items, rowsByEntityType) {
    let apiSuccess = 0;
    let apiFailed = 0;
    for (const item of items) {
      const rows = rowsByEntityType[item.entityType] || [];
      const meta = rows.find(row => entityRowId(row) === String(item.id));
      if (!meta) {
        apiFailed += 1;
        recordExecutionEvent(item, item.entityType, 'failed', { msg: 'missing state row metadata' });
        continue;
      }
      const built = buildStateToggleRequest(meta, item.actionType, item.entityType);
      const result = built.ok
        ? await execAdApi(built.requestUrl, built.requestBody, 'PATCH')
        : built;
      const status = built.ok
        ? classifyApiResult(result)
        : 'failed';
      if (status === 'api_success') apiSuccess += 1;
      else apiFailed += 1;
      recordExecutionEvent(item, item.entityType, status, result, meta);
      log(`State ${item.actionType} ${item.entityType} ${item.id}: ${status}`);
      await wait(200);
    }
    return { apiSuccess, apiFailed };
  }
  apiStats.state = await executeStateItems(stateItems, {
    keyword: kwRows,
    autoTarget: autoTargetRows,
    manualTarget: manualTargetRows,
    productAd: productAdRows,
    campaign: spCampaignRows,
    sbCampaign: sbCampaignRows,
    sbKeyword: sbKwRows,
    sbTarget: sbTargetRows,
  });
  apiStats.keyword = await executeKeywordItems(kwItems, kwMeta, 'SP keyword', '/keyword/batchKeyword', 'keyword', 'keyword');
  apiStats.sbKeyword = await executeKeywordItems(sbKwItems, sbKwMeta, 'SB keyword', '/keywordSb/batchEditKeywordSbColumn', '', 'sbKeyword', 'SB');
  apiStats.autoTarget = await executeTargetItems(spAutoItems, autoTargetRows, 'SP auto target', '/advTarget/batchEditAutoTarget', 'autoTarget', 'autoTarget');
  apiStats.manualTarget = await executeTargetItems(spManualItems, manualTargetRows, 'SP manual target', '/advTarget/batchUpdateManualTarget', 'manualTarget', 'manualTarget');
  apiStats.unknownTarget = { apiSuccess: 0, apiFailed: spUnknownItems.length };
  apiStats.sbTarget = await executeTargetItems(sbTargetItems, sbTargetRows, 'SB target', '/sbTarget/batchEditTargetSbColumn', '', 'sbTarget', 'SB');
  apiStats.sbCampaign = await executeSbCampaignItems(sbCampaignItems, sbCampaignRows, 'SB campaign');
  apiStats.spCampaignBudget = await executeSpCampaignBudgetItems(spCampaignBudgetItems, spCampaignRows, 'SP campaign budget');
  apiStats.spCampaignPlacement = await executeSpCampaignPlacementItems(spCampaignPlacementItems, spCampaignRows, 'SP campaign placement');
  apiStats.create = await executeCreateItems(createItems);

  const verifiedEvents = await verifyLanding();
  const finalCounts = summarize(verifiedEvents);
  const eventsBySku = groupEventsBySku(verifiedEvents);
  for (const event of verifiedEvents) {
    if (event.finalStatus === 'success' || event.finalStatus === 'created_pending_visibility') landedIds.add(executionEntityKey(event.entityType, event.id));
  }

  const nonExecutionEvents = [
    ...aiReview.map(item => ({
      sku: item.sku,
      id: item.action.id,
      dedupeKey: item.dedupeKey || item.action?.dedupeKey || item.action?.candidateKey || '',
      source: item.source || item.action?.source || 'ai',
      actionSource: item.actionSource || item.action?.actionSource || [item.source || item.action?.source || 'ai'],
      bid: item.action.suggestedBid,
      suggestedBid: item.action.suggestedBid,
      currentBid: item.action.currentBid,
      entityType: item.action.entityType,
      apiStatus: 'manual_review',
      finalStatus: 'manual_review',
      success: false,
      plan: { sku: item.sku, summary: 'AI decision requires manual review' },
      action: item.action,
      resultMessage: 'manual_review',
      errorReason: item.action.reason,
    })),
    ...aiSkipped.map(item => ({
      sku: item.sku,
      id: item.action.id,
      dedupeKey: item.dedupeKey || item.action?.dedupeKey || item.action?.candidateKey || '',
      source: item.source || item.action?.source || 'ai',
      actionSource: item.actionSource || item.action?.actionSource || [item.source || item.action?.source || 'ai'],
      entityType: item.action.entityType,
      apiStatus: 'skipped_invalid_state',
      finalStatus: 'skipped_invalid_state',
      success: false,
      plan: { sku: item.sku, summary: 'AI decision skipped execution' },
      action: item.action,
      resultMessage: 'skipped_invalid_state',
      errorReason: item.action.reason,
    })),
  ];

  const noteEvents = [...verifiedEvents, ...nonExecutionEvents];
  if (snapshotData && noteEvents.length) {
    const noteSkus = [...new Set(noteEvents.map(event => event.sku).filter(Boolean))];
    const ensureInventoryText = await eval_(
      'window.ensureInventoryRecordsForSkus ? ' +
      'window.ensureInventoryRecordsForSkus(' + JSON.stringify(noteSkus) + ').then(d => JSON.stringify(d)) : ' +
      'Promise.resolve(JSON.stringify({ ok:false, reason:"ensureInventoryRecordsForSkus unavailable" }))',
      true
    );
    try {
      const ensureInventory = JSON.parse(ensureInventoryText || '{}');
      if (ensureInventory.ok) {
        log(`Inventory records ready for notes: requested=${ensureInventory.requested || 0}, missingAfter=${(ensureInventory.missingAfter || []).length}`);
      } else {
        log(`Inventory records check failed before notes: ${ensureInventory.reason || JSON.stringify(ensureInventory)}`);
      }
    } catch (e) {
      log(`Inventory records check parse failed before notes: ${e.message}`);
    }
  }
  async function appendNotesWithStructuredFailure(events) {
    if (!events.length) return [];
    const noteResultText = await eval_(
      'appendInventoryOperationNotes(' + JSON.stringify(events) + ')' +
      '.then(d => JSON.stringify(d)).catch(e => JSON.stringify(' +
      JSON.stringify(events.map(event => ({ sku: event.sku, ok: false, error: 'append call failed' }))) +
      '.map(item => ({...item, error:e.message}))))',
      true
    );
    try {
      const parsed = JSON.parse(noteResultText || '[]');
      return Array.isArray(parsed) ? parsed : events.map(event => ({ sku: event.sku, ok: false, error: 'invalid note response' }));
    } catch (e) {
      return events.map(event => ({ sku: event.sku, ok: false, error: e.message }));
    }
  }

  const noteResults = await appendNotesWithStructuredFailure(noteEvents);
  const failedNotePairs = noteResults
    .map((result, index) => ({ result, index, event: noteEvents[index] }))
    .filter(item => item.event && !item.result?.ok);
  if (failedNotePairs.length) {
    log(`Inventory notes had ${failedNotePairs.length} transient failures; retrying failed notes only...`);
    await wait(5000);
    const retryResults = await appendNotesWithStructuredFailure(failedNotePairs.map(item => item.event));
    failedNotePairs.forEach((item, retryIndex) => {
      noteResults[item.index] = retryResults[retryIndex] || item.result;
    });
  }
  const noteFailures = noteResults.filter(r => !r.ok);

  fs.writeFileSync(
    path.join(SNAPSHOTS_DIR, `execution_verify_${today}.json`),
    JSON.stringify({ apiStats, finalCounts, noteResults, events: verifiedEvents, nonExecutionEvents }, null, 2)
  );

  const newHistory = loadHistory();
  for (const p of plan) {
    for (const a of p.actions) {
      if (!landedIds.has(executionEntityKey(a.entityType, a.id))) continue;
      newHistory.push({
        entityId: a.id,
        sku: p.sku,
        entityType: a.entityType,
        date: today,
        fromBid: a.currentBid,
        toBid: a.suggestedBid,
        fromBudget: a.currentBudget,
        toBudget: a.suggestedBudget,
        placementKey: a.placementKey,
        fromPlacementPercent: a.currentPlacementPercent,
        toPlacementPercent: a.suggestedPlacementPercent,
        direction: a.direction,
        reason: a.reason,
        learning: a.learning || null,
        baselineQuality: a.learning?.baselineQuality || '',
      });
    }
  }
  for (const event of verifiedEvents) {
    if (!['blocked_by_system_recent_adjust', 'failed'].includes(event.finalStatus)) continue;
    const action = event.action || {};
    newHistory.push({
      entityId: event.id,
      sku: event.sku,
      entityType: event.entityType,
      date: today,
      outcome: event.finalStatus,
      candidateKey: action.candidateKey || '',
      campaignId: action.campaignId || '',
      adGroupId: action.adGroupId || '',
      direction: action.direction || '',
      reason: action.reason || event.errorReason || event.resultMessage || '',
    });
  }
  const blockedSevenDayCandidates = new Map();
  for (const event of verifiedEvents) {
    if (event.finalStatus !== 'blocked_by_system_recent_adjust') continue;
    const action = event.action || {};
    const candidateKey = String(action.candidateKey || '').trim();
    if (!candidateKey || !normalizeSources(action.actionSource || event.actionSource).includes('sp_7day_untouched')) continue;
    if (!blockedSevenDayCandidates.has(candidateKey)) {
      blockedSevenDayCandidates.set(candidateKey, {
        entityId: candidateKey,
        sku: event.sku,
        entityType: 'adGroup',
        date: today,
        outcome: 'blocked_by_system_recent_adjust',
        candidateKey,
        campaignId: action.campaignId || '',
        adGroupId: action.adGroupId || '',
        direction: '',
        reason: 'seven_day_candidate_all_children_blocked_by_system_recent_adjust',
      });
    }
  }
  for (const summary of blockedSevenDayCandidates.values()) newHistory.push(summary);
  for (const event of nonExecutionEvents) {
    if (!['manual_review', 'skipped_invalid_state'].includes(event.finalStatus)) continue;
    const action = event.action || {};
    newHistory.push({
      entityId: event.id,
      sku: event.sku,
      entityType: event.entityType,
      date: today,
      outcome: event.finalStatus,
      candidateKey: action.candidateKey || '',
      campaignId: action.campaignId || '',
      adGroupId: action.adGroupId || '',
      direction: action.direction || '',
      reason: action.reason || event.errorReason || event.resultMessage || '',
    });
  }
  saveHistory(newHistory);

  const planBySku = new Map(plan.map(item => [item.sku, item]));
  const reviewBySku = groupEventsBySku(nonExecutionEvents.filter(event => event.finalStatus === 'manual_review'));
  const skippedBySku = groupEventsBySku(nonExecutionEvents.filter(event => event.finalStatus === 'skipped_invalid_state'));
  const coverage = cards.map(card => {
    const sku = card.sku;
    const events = eventsBySku.get(sku) || [];
    const reviewEvents = reviewBySku.get(sku) || [];
    const skipEvents = skippedBySku.get(sku) || [];
    const actionCount = planBySku.get(sku)?.actions?.length || 0;
    const finalStatuses = events.reduce((acc, event) => {
      const key = event.finalStatus || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    let status = 'no_action';
    let reason = 'ai_no_action';
    if (events.some(event => event.finalStatus === 'success')) {
      status = 'adjusted';
      reason = 'verified_landed';
    } else if (events.some(event => event.finalStatus === 'created_pending_visibility')) {
      status = 'adjusted';
      reason = 'create_api_success_pending_list_visibility';
    } else if (events.some(event => event.finalStatus === 'blocked_by_system_recent_adjust' || event.finalStatus === 'conflict')) {
      status = 'blocked';
      reason = 'blocked_by_system_recent_adjust';
    } else if (events.some(event => event.finalStatus === 'not_landed' || event.finalStatus === 'verify_failed')) {
      status = 'unverified';
      reason = events.some(event => event.finalStatus === 'verify_failed') ? 'verification_failed' : 'api_success_but_not_landed';
    } else if (events.some(event => event.finalStatus === 'failed')) {
      status = 'failed';
      reason = 'execution_failed';
    } else if (reviewEvents.length) {
      status = 'manual_review';
      reason = 'ai_review';
    } else if (skipEvents.length) {
      status = 'skipped';
      reason = 'invalid_or_paused_state';
    } else if (((card.adStats?.['30d']?.spend || 0) <= 0) && ((card.sbStats?.['30d']?.spend || 0) <= 0)) {
      status = 'no_action';
      reason = 'no_recent_ad_spend';
    }
    return {
      sku,
      status,
      reason,
      plannedActions: actionCount,
      actionsIfIgnoringHistory: 0,
      finalStatuses,
      invDays: card.invDays,
      spSpend30: card.adStats?.['30d']?.spend || 0,
      sbSpend30: card.sbStats?.['30d']?.spend || 0,
    };
  });
  const coverageSummary = coverage.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    acc[`reason:${item.reason}`] = (acc[`reason:${item.reason}`] || 0) + 1;
    return acc;
  }, {});

  const report = {
    time: timeContext,
    runAt: timeContext.runAt,
    businessDate: timeContext.businessDate,
    dataDate: timeContext.dataDate,
    siteTimezone: timeContext.siteTimezone,
    sourceRunId: timeContext.sourceRunId,
    plannedSkus: plan.length,
    plannedActions: totalActions,
    decisionSource: aiDecision.decisionSource,
    actionSchemaFile: aiDecision.actionSchemaFile,
    aiValidationErrors: aiDecision.errors || [],
    sevenDayStats: {
      spCandidates: sp7DayRows.length,
      spExecutable: plan.flatMap(p => p.actions || []).filter(a => normalizeSources(a.actionSource).includes('sp_7day_untouched') && a.canAutoExecute !== false).length,
      sbCandidates: sb7DayRows.length,
      sbExecutable: plan.flatMap(p => p.actions || []).filter(a => normalizeSources(a.actionSource).includes('sb_7day_untouched') && a.canAutoExecute !== false).length,
      overlapWithStrategy: 0,
      manualReview: aiReview.length,
      invalidSkipped: aiSkipped.length,
      blockedBySystemRecentAdjust: finalCounts.blocked_by_system_recent_adjust || finalCounts.conflict || 0,
      granularity: sevenDayMeta,
    },
    totalProductSkus: cards.length,
    apiStats,
    finalCounts,
    coverageSummary,
    noteSuccess: noteResults.filter(r => r.ok).length,
    noteFailure: noteFailures.length,
    missingAidSkus: noteFailures.map(r => ({ sku: r.sku, error: r.error })),
  };
  const verifyFile = path.join(SNAPSHOTS_DIR, `execution_verify_${today}.json`);
  const summaryFile = path.join(SNAPSHOTS_DIR, `execution_summary_${today}.json`);
  const coverageFile = path.join(SNAPSHOTS_DIR, `execution_coverage_${today}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(report, null, 2));
  fs.writeFileSync(coverageFile, JSON.stringify({ summary: coverageSummary, coverage }, null, 2));

  log(`Final lookup: success=${finalCounts.success || 0}, created_pending_visibility=${finalCounts.created_pending_visibility || 0}, not_landed=${finalCounts.not_landed || 0}, blocked=${finalCounts.blocked_by_system_recent_adjust || finalCounts.conflict || 0}, failed=${finalCounts.failed || 0}`);
  log(`SKU coverage: adjusted=${coverageSummary.adjusted || 0}, blocked=${coverageSummary.blocked || 0}, manual_review=${coverageSummary.manual_review || 0}, no_action=${coverageSummary.no_action || 0}, failed=${coverageSummary.failed || 0}, unverified=${coverageSummary.unverified || 0}`);
  log(`Inventory notes: success=${report.noteSuccess}, failed=${report.noteFailure}`);
  log('=== Auto adjustment run finished ===');

  closeWs();
  return {
    mode: 'execute',
    report,
    verificationBlocked,
    files: {
      verifyFile,
      summaryFile,
      coverageFile,
      planFile: path.join(SNAPSHOTS_DIR, `plan_${today}.json`),
      contextFile: path.join(SNAPSHOTS_DIR, 'ai_decision_context.json'),
      validatedPlanFile: path.join(SNAPSHOTS_DIR, 'ai_decision_validated_plan.json'),
    },
  };
}

function formatYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCreateMode(value) {
  const text = String(value || '').trim();
  if (/^(auto|自动组)$/i.test(text)) return 'auto';
  if (/^(productTarget|定位组)$/i.test(text)) return 'productTarget';
  if (/^(keywordTarget|关键词组)$/i.test(text)) return 'keywordTarget';
  return text;
}

function buildSpCreatePayload(input = {}) {
  const mode = normalizeCreateMode(input.mode || input.positionType);
  const sku = String(input.sku || '').trim();
  const asin = String(input.asin || '').trim().toUpperCase();
  const coreTerm = String(input.coreTerm || '').trim();
  const accountId = Number(input.accountId);
  const siteId = Number(input.siteId || 4);
  const dailyBudget = Number(input.dailyBudget);
  const defaultBid = Number(input.defaultBid);
  const errors = [];
  if (!['auto', 'productTarget', 'keywordTarget'].includes(mode)) errors.push('mode must be auto, productTarget, or keywordTarget');
  if (!coreTerm) errors.push('coreTerm is required');
  if (!sku) errors.push('sku is required');
  if (!asin) errors.push('asin is required');
  if (!Number.isFinite(accountId) || accountId <= 0) errors.push('accountId must be positive');
  if (!Number.isFinite(siteId) || siteId <= 0) errors.push('siteId must be positive');
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) errors.push('dailyBudget must be positive');
  if (!Number.isFinite(defaultBid) || defaultBid <= 0) errors.push('defaultBid must be positive');

  const prefix = mode === 'auto' ? 'auto' : mode === 'productTarget' ? 'asin' : 'kw';
  const campaignName = `${prefix}_${coreTerm}_${sku.toLowerCase()}`;
  const requestUrl = '/campaign/createOneTime';
  if (errors.length) return { ok: false, errors, mode, requestUrl, campaignName, groupName: campaignName };

  const payload = {
    createType: 'campaign',
    advType: 'SP',
    name: 'create SP campaign',
    campaignName,
    startDate: formatYmd(),
    accountId,
    siteId,
    dailyBudget,
    offAmazonBudgetControlStrategy: 'MINIMIZE_SPEND',
    placementTop: 0,
    placementProductPage: 0,
    placementRestOfSearch: 0,
    siteAmazonBusiness: 0,
    groupName: campaignName,
    haulFlag: false,
    asinArray: [asin],
    skuArray: [sku],
    defaultBid,
  };
  if (mode === 'auto') {
    payload.targetingType = 'AUTO';
    payload.positionType = 'auto';
    payload.strategy = 'LEGACY_FOR_SALES';
    payload.autoTargetUpdate = {
      QUERY_HIGH_REL_MATCHES: { bid: defaultBid, state: 'enabled' },
      QUERY_BROAD_REL_MATCHES: { bid: defaultBid, state: 'enabled' },
      ASIN_ACCESSORY_RELATED: { bid: defaultBid, state: 'enabled' },
      ASIN_SUBSTITUTE_RELATED: { bid: defaultBid, state: 'enabled' },
    };
    payload.negativeKeywordArray = [];
    payload.negativeProductTargetArray = [];
  } else if (mode === 'productTarget') {
    const targetType = String(input.targetType || '').trim();
    const targetAsins = [...new Set((input.targetAsins || []).map(value => String(value || '').trim().toUpperCase()).filter(Boolean))];
    if (!targetType) errors.push('targetType is required for productTarget');
    if (!targetAsins.length) errors.push('targetAsins is required for productTarget');
    if (errors.length) return { ok: false, errors, mode, requestUrl, campaignName, groupName: campaignName };
    payload.targetingType = 'MANUAL';
    payload.positionType = 'productTarget';
    payload.strategy = 'LEGACY_FOR_SALES';
    payload.productTargetArray = targetAsins.map(value => ({
      bid: defaultBid,
      targetMark: '',
      resolvedExpression: [{ type: targetType, value }],
      expression: [{ type: targetType, value }],
    }));
    payload.negativeProductTargetArray = [];
  } else if (mode === 'keywordTarget') {
    const matchType = String(input.matchType || '').trim().toUpperCase();
    const keywords = [...new Set((input.keywords || []).map(value => String(value || '').trim()).filter(Boolean))];
    if (!matchType) errors.push('matchType is required for keywordTarget');
    if (!keywords.length) errors.push('keywords is required for keywordTarget');
    if (errors.length) return { ok: false, errors, mode, requestUrl, campaignName, groupName: campaignName };
    payload.targetingType = 'MANUAL';
    payload.positionType = 'keywordTarget';
    payload.strategy = 'MANUAL';
    payload.keywordArray = keywords.map(keywordText => ({ keywordText, matchType, bid: defaultBid, coreMark: '' }));
    payload.keywordGroups = [];
    payload.negativeKeywordArray = [];
  }
  return { ok: true, mode, requestUrl, requestBody: payload, campaignName, groupName: campaignName, errors: [] };
}

function normalizeActionEntityType(value) {
  const text = String(value || '').trim();
  if (text === 'keyword') return 'SP_KEYWORD';
  if (text === 'autoTarget') return 'SP_AUTO_TARGET';
  if (text === 'manualTarget') return 'SP_MANUAL_TARGET';
  if (text === 'productAd') return 'SP_PRODUCT_AD';
  if (text === 'sbKeyword') return 'SB_KEYWORD';
  if (text === 'sbTarget') return 'SB_TARGET';
  if (text === 'sbCampaign') return 'SB_CAMPAIGN';
  if (text === 'campaign') return 'SP_CAMPAIGN';
  return text.toUpperCase();
}

function readRowField(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null && row?.[name] !== '') return row[name];
  }
  return '';
}

function stateValues(action) {
  return action === 'enable'
    ? { textState: 'enabled', numericState: 1 }
    : { textState: 'paused', numericState: 2 };
}

function buildStateToggleRequest(row = {}, action = '', hintedType = '') {
  const entityType = normalizeActionEntityType(hintedType);
  const siteId = Number(readRowField(row, ['siteId', 'site_id']) || 4);
  const accountId = Number(readRowField(row, ['accountId', 'account_id']));
  const campaignId = String(readRowField(row, ['campaignId', 'campaign_id', 'id']));
  const adGroupId = String(readRowField(row, ['adGroupId', 'ad_group_id']));
  const keywordId = String(readRowField(row, ['keywordId', 'keyword_id', 'id']));
  const targetId = String(readRowField(row, ['targetId', 'target_id', 'id']));
  const adId = String(readRowField(row, ['adId', 'ad_id', 'id']));
  const matchType = String(readRowField(row, ['matchType', 'match_type']));
  const values = stateValues(action);
  let requestUrl = '';
  let requestBody = null;
  let missingFields = [];

  if (entityType === 'SP_KEYWORD') {
    requestUrl = '/keyword/batchKeyword';
    missingFields = [keywordId ? '' : 'keywordId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = { siteId, accountId, column: 'state', targetArray: [{ keywordId, state: values.textState }], targetNewArray: [{ keywordId, state: values.numericState, accountId, campaignId, adGroupId }], property: 'keyword', idArray: [keywordId], campaignIdArray: [campaignId], operation: 'state' };
  } else if (entityType === 'SP_AUTO_TARGET') {
    requestUrl = '/advTarget/batchEditAutoTarget';
    missingFields = [targetId ? '' : 'targetId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = { siteId, accountId, column: 'state', targetArray: [{ targetId, state: values.textState }], targetNewArray: [{ targetId, state: values.numericState, accountId, campaignId, adGroupId }], property: 'autoTarget', campaignIdArray: [campaignId], idArray: [targetId], operation: 'state' };
  } else if (entityType === 'SP_MANUAL_TARGET') {
    requestUrl = '/advTarget/batchUpdateManualTarget';
    missingFields = [targetId ? '' : 'targetId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = { siteId, accountId, column: 'state', targetArray: [{ targetId, state: values.textState }], targetNewArray: [{ targetId, state: values.numericState, accountId, campaignId, adGroupId }], property: 'manualTarget', campaignIdArray: [campaignId], idArray: [targetId], operation: 'state' };
  } else if (entityType === 'SB_KEYWORD') {
    requestUrl = '/keywordSb/batchEditKeywordSbColumn';
    missingFields = [keywordId ? '' : 'keywordId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId', matchType ? '' : 'matchType'].filter(Boolean);
    requestBody = { siteId, accountId, column: 'state', targetArray: [{ campaignId, adGroupId, matchType, keywordId, state: values.textState }], targetNewArray: [{ campaignId, adGroupId, matchType, keywordId, state: values.numericState, accountId }] };
  } else if (entityType === 'SB_TARGET') {
    requestUrl = '/sbTarget/batchEditTargetSbColumn';
    missingFields = [targetId ? '' : 'targetId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = { column: 'state', targetArray: [{ campaignId, adGroupId, targetId, state: values.textState }], idArray: [targetId], operation: 'state', siteId, accountId, campaignIdArray: [campaignId], targetNewArray: [{ targetId, state: values.numericState, accountId, campaignId, adGroupId }] };
  } else if (entityType === 'SB_CAMPAIGN') {
    requestUrl = '/campaignSb/batchSbCampaign';
    missingFields = [campaignId ? '' : 'campaignId'].filter(Boolean);
    requestBody = { siteId, accountId, campaignIdArray: [campaignId], batchType: 'state', batchValue: values.textState.toUpperCase(), campaignNewArray: [{ siteId, accountId, campaignId, state: values.numericState }] };
  } else if (entityType === 'SP_PRODUCT_AD') {
    requestUrl = '/advProduct/batchProduct';
    missingFields = [adId ? '' : 'adId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = { siteId, accountId, column: 'state', value: values.textState.toLowerCase(), products: [adId], property: 'product', idArray: [adId], operation: 'state', campaignIdArray: [campaignId], productNewArray: [{ siteId, accountId, campaignId, adGroupId, adId, state: values.numericState }] };
  } else {
    return { ok: false, requestUrl, requestBody, reason: 'unsupported entity type' };
  }

  const missing = [...(!accountId ? ['accountId'] : []), ...missingFields];
  if (missing.length) return { ok: false, requestUrl, requestBody, reason: 'missing fields', rawResponse: { missingFields: missing } };
  return { ok: true, requestUrl, requestBody, reason: '' };
}

module.exports = {
  run,
  groupByAccountSite,
  hasRecentCandidateBlock,
};

if (require.main === module) {
  run().catch(e => {
    log(`Fatal error: ${e.stack || e.message}`);
    process.exit(1);
  });
}
