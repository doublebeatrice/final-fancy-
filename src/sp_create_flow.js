'use strict';

// Fast, single-command SP campaign create against the live ad backend.
// Mirrors src/sbv_create_flow.js but for Sponsored Products (auto / keyword / product target).
//
// It reuses the canonical request builder buildSpCreatePayload exported from
// auto_adjust.js (the same one the heavy daily pipeline uses), so the payload is
// identical to a pipeline create. The point of this flow is operator speed:
//   - resolve accountId/asin/siteId from the SKU automatically
//   - guard against duplicate same-lane structure (warn, require --allow-duplicate)
//   - POST /campaign/createOneTime
//   - read back with retries (covers fresh-create lag) until the new rows are live
//
// Default is dry-run; pass --execute to actually create.

const fs = require('fs');
const path = require('path');
const { buildSpCreatePayload } = require('../auto_adjust');
const { openAdvWs, advRequest, apiList, ymd, resolveSkuAccount } = require('./adv_backend');

const ROOT = path.join(__dirname, '..');
const ACTIONS_DIR = path.join(ROOT, 'data', 'actions');

function parseArgs(argv = []) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[key] = argv[i + 1];
      i += 1;
    } else {
      out[key] = true; // boolean flag
    }
  }
  return out;
}

function parseCsvList(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '')
    .split(/[,;\n]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['auto', 'sp-auto', 'spauto'].includes(raw)) return 'auto';
  if (['keyword', 'keywordtarget', 'kw', 'keywords'].includes(raw)) return 'keywordTarget';
  if (['product', 'producttarget', 'asin', 'producttargeting'].includes(raw)) return 'productTarget';
  return raw;
}

function normalizeTargetType(value) {
  const raw = String(value || 'ASIN_EXPANDED_FROM').trim();
  const map = {
    expanded: 'ASIN_EXPANDED_FROM',
    asin_expanded_from: 'ASIN_EXPANDED_FROM',
    asinexpandedfrom: 'ASIN_EXPANDED_FROM',
    exact: 'ASIN_SAME_AS',
    same: 'ASIN_SAME_AS',
    asin_same_as: 'ASIN_SAME_AS',
    asinsameas: 'ASIN_SAME_AS',
  };
  return map[raw.toLowerCase()] || raw;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

// Match the lane an operator is creating against the SKU's existing campaigns.
// Auto and product/keyword are distinct lanes; B2B (AMAZON_BUSINESS) is distinct
// from the consumer lane and is detected from the campaign name marker `b2b`.
function findDuplicateLane(mode, isB2b, campaigns = []) {
  const positionForMode = mode === 'auto' ? 'auto'
    : mode === 'keywordTarget' ? 'keywordtarget'
    : mode === 'productTarget' ? 'producttarget'
    : '';
  return campaigns.filter(c => {
    const pt = String(c.positionType || '').toLowerCase();
    const name = String(c.campaignName || '').toLowerCase();
    const laneMatch = mode === 'auto' ? pt === 'auto' : pt === positionForMode;
    if (!laneMatch) return false;
    // `b2b` marker, tolerating an underscore prefix (e.g. ai_auto_b2b ...).
    const nameIsB2b = /(?:^|[^a-z0-9])b2b(?:[^a-z0-9]|$)/i.test(name);
    return isB2b ? nameIsB2b : !nameIsB2b;
  });
}

async function buildPlan(args, ws) {
  const errors = [];
  const sku = String(args.sku || '').trim().toUpperCase();
  const mode = normalizeMode(args.mode);
  const isB2b = args.b2b === true || String(args.b2b || '').toLowerCase() === 'true' ||
    String(args.siteRestriction || '').toUpperCase() === 'AMAZON_BUSINESS';
  const bid = Number(args.bid ?? args.defaultBid);
  const budget = Number(args.budget ?? args.dailyBudget ?? 3);
  let siteId = Number(args.siteId || 4);

  if (!sku) errors.push('--sku is required');
  if (!['auto', 'keywordTarget', 'productTarget'].includes(mode)) {
    errors.push('--mode must be auto | keyword | product');
  }
  if (!Number.isFinite(bid) || bid <= 0) errors.push('--bid must be a positive number');
  if (!Number.isFinite(budget) || budget <= 0) errors.push('--budget must be a positive number');

  // Resolve accountId/asin/siteId live unless both are explicitly provided.
  let accountId = args.accountId !== undefined ? Number(args.accountId) : null;
  let asin = args.asin ? String(args.asin).trim().toUpperCase() : '';
  let resolved = null;
  if (sku && (!Number.isFinite(accountId) || !asin)) {
    resolved = await resolveSkuAccount(ws, sku, siteId);
    if (!resolved.ok) {
      errors.push(resolved.error);
    } else {
      if (!Number.isFinite(accountId)) accountId = resolved.accountId;
      if (!asin) asin = resolved.asin;
      if (resolved.siteId) siteId = resolved.siteId;
    }
  }
  if (!Number.isFinite(accountId) || accountId <= 0) errors.push('accountId could not be resolved; pass --account-id');
  if (!/^B[A-Z0-9]{9}$/.test(asin || '')) errors.push('asin could not be resolved; pass --asin');

  const coreTerm = String(args.coreTerm || args.core || '').trim();
  if (!coreTerm) errors.push('--core-term is required (used in the campaign name)');

  const matchType = String(args.matchType || 'BROAD').trim().toUpperCase();
  const keywordsRaw = parseCsvList(args.keywords);
  const keywords = keywordsRaw.map(raw => {
    const colonIdx = raw.lastIndexOf(':');
    if (colonIdx > 0) {
      const maybeBid = Number(raw.slice(colonIdx + 1));
      if (Number.isFinite(maybeBid) && maybeBid > 0) {
        return { text: raw.slice(0, colonIdx).trim(), bid: maybeBid };
      }
    }
    return { text: raw.trim(), bid: null };
  });
  const keywordTexts = keywords.map(k => k.text);
  const keywordBids = keywords.some(k => k.bid !== null) ? keywords.map(k => k.bid) : null;
  const targetAsinsRaw = parseCsvList(args.targetAsins || args.target);
  const targetAsinsParsed = targetAsinsRaw.map(raw => {
    const colonIdx = raw.lastIndexOf(':');
    if (colonIdx > 0) {
      const maybeBid = Number(raw.slice(colonIdx + 1));
      if (Number.isFinite(maybeBid) && maybeBid > 0) {
        return { asin: raw.slice(0, colonIdx).trim().toUpperCase(), bid: maybeBid };
      }
    }
    return { asin: raw.trim().toUpperCase(), bid: null };
  });
  const targetAsins = targetAsinsParsed.map(t => t.asin);
  const targetBids = targetAsinsParsed.some(t => t.bid !== null) ? targetAsinsParsed.map(t => t.bid) : null;
  if (mode === 'keywordTarget' && !keywordTexts.length) errors.push('--keywords is required for keyword mode');
  if (mode === 'productTarget' && !targetAsins.length) errors.push('--target-asins is required for product mode');

  const b2bTag = isB2b ? 'b2b ' : '';
  const prefix = mode === 'auto' ? `ai_auto_${b2bTag}`
    : mode === 'keywordTarget' ? `ai_kw ${matchType.toLowerCase()}_${b2bTag}`
    : `ai_asin_${b2bTag}`;
  const defaultName = `${prefix}${coreTerm}_${sku.toLowerCase()}`.slice(0, 90).trim();
  const campaignName = String(args.campaignName || defaultName).slice(0, 90).trim();

  const createInput = {
    advType: 'SP',
    mode,
    sku,
    asin,
    accountId,
    siteId,
    dailyBudget: budget,
    defaultBid: bid,
    coreTerm,
    campaignName,
    groupName: campaignName,
    matchType: mode === 'keywordTarget' ? matchType : '',
    keywords: mode === 'keywordTarget' ? keywordTexts : [],
    keywordBids: mode === 'keywordTarget' ? keywordBids : null,
    targetType: mode === 'productTarget' ? normalizeTargetType(args.targetType) : '',
    targetAsins: mode === 'productTarget' ? targetAsins : [],
    targetBids: mode === 'productTarget' ? targetBids : null,
    siteRestriction: isB2b ? 'AMAZON_BUSINESS' : '',
  };

  return {
    errors,
    plan: {
      sku, mode, isB2b, bid, budget, siteId, accountId, asin, coreTerm, campaignName,
      goal: {
        metric: 'orders',
        from: 0,
        to: Number(args.goalOrders || 2),
        deadlineDays: Number(args.deadlineDays || 7),
        hardFloor: Number(args.hardFloor ?? -8),
      },
    },
    createInput,
    resolved,
  };
}

function extractCreateMeta(json = {}) {
  const data = json?.data || {};
  const param = data?.param || {};
  return {
    campaignId: String(data.campaignId || param.campaignId || ''),
    adGroupId: String(data.adGroupId || param.adGroupId || ''),
    code: json?.code ?? null,
    msg: json?.msg || '',
    productAdError: data?.productAds?.error || null,
  };
}

// property: 2 = SP auto target rows, 1 = SP keyword rows. We read /keyword/findAllNew
// filtered to the new campaign+group and confirm the expected row count is live and enabled.
async function readbackCreated(ws, createInput, meta, options = {}) {
  const delays = options.delays || [0, 20000, 45000];
  const property = createInput.mode === 'keywordTarget' ? '1' : '2';
  const expectedCount = createInput.mode === 'auto' ? 4
    : createInput.mode === 'keywordTarget' ? createInput.keywords.length
    : createInput.targetAsins.length;
  const end = ymd(new Date(Date.now() - 86400000));
  const start = ymd(new Date(Date.now() - 86400000 * 7));
  const attempts = [];
  let landed = [];

  for (const delay of delays) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    const payload = {
      siteId: createInput.siteId,
      state: '4',
      coreMark: '0',
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      publicAdv: '2',
      lowCost: 2,
      accountId: createInput.accountId,
      campaignId: meta.campaignId,
      adGroupId: meta.adGroupId,
      property,
      selectDate: [start, end],
      field: 'Spend',
      order: 'desc',
      page: 1,
      limit: 500,
      filterArray: { campaignState: '4' },
    };
    const res = await advRequest(ws, 'POST', '/keyword/findAllNew', payload);
    const rows = apiList(res.json || {}).filter(r =>
      String(r.campaignId || '') === meta.campaignId &&
      String(r.adGroupId || '') === meta.adGroupId
    );
    attempts.push({ delayMs: delay, ok: res.ok, status: res.status, rowCount: rows.length });
    landed = rows.map(r => ({
      type: r.type || r.targetType || r.keywordText || r.text,
      bid: r.bid,
      state: r.state,
      campaignState: r.campaignState,
      groupState: r.groupState,
      id: r.targetId || r.keywordId || r.id,
    }));
    if (landed.length >= expectedCount) break;
  }

  const allEnabled = landed.length > 0 && landed.every(row => {
    const st = String(row.state);
    const cs = String(row.campaignState);
    const gs = String(row.groupState);
    return st === '1' && (cs === '1' || cs === 'ENABLED') && (gs === '1' || gs === 'ENABLED' || gs === '');
  });
  const bidMatch = landed.length > 0 && landed.every((row, i) => {
    const expectedBid = (createInput.keywordBids && createInput.keywordBids[i] != null)
      ? createInput.keywordBids[i]
      : createInput.defaultBid;
    return Math.abs(Number(row.bid) - Number(expectedBid)) < 0.005;
  });

  return {
    property,
    expectedCount,
    landedCount: landed.length,
    landed,
    attempts,
    allLanded: landed.length >= expectedCount && allEnabled,
    bidMatch,
  };
}

async function runSpCreateFlow(argv = []) {
  const startedAt = Date.now();
  const args = parseArgs(argv);
  const execute = args.execute === true || argv.includes('--execute');
  const allowDuplicate = args.allowDuplicate === true || argv.includes('--allow-duplicate');
  const verify = args.verify === true || argv.includes('--verify');
  const out = {
    exportedAt: new Date().toISOString(),
    dryRun: !execute,
    actor: String(args.actor || 'claude'),
    evidenceBoundary: 'Live ad backend via Chrome debug session (port 9222); SKU account/asin resolved from /product/adProductData; readback from /keyword/findAllNew.',
  };

  let ws;
  try {
    ws = await openAdvWs();
    const { errors, plan, createInput, resolved } = await buildPlan(args, ws);
    out.plan = plan;
    out.resolved = resolved ? { accountId: resolved.accountId, asin: resolved.asin, siteId: resolved.siteId, existingCampaigns: resolved.rowCount } : 'provided explicitly';

    if (errors.length) {
      out.ok = false;
      out.execution = { skipped: true, reason: 'input_invalid', errors };
      return finalize(out, startedAt, args);
    }

    // Build payload via the canonical builder (same one the pipeline uses).
    const built = buildSpCreatePayload(createInput);
    out.built = { ok: built.ok, mode: built.mode, requestUrl: built.requestUrl, campaignName: built.campaignName, errors: built.errors };
    if (!built.ok) {
      out.ok = false;
      out.execution = { skipped: true, reason: 'payload_invalid', errors: built.errors };
      return finalize(out, startedAt, args);
    }

    // Duplicate-structure guard (warn + require --allow-duplicate).
    const dupes = resolved?.campaigns ? findDuplicateLane(createInput.mode, plan.isB2b, resolved.campaigns) : [];
    out.duplicateGuard = {
      lane: `${createInput.mode}${plan.isB2b ? '+b2b' : ''}`,
      matches: dupes.map(d => ({ campaignId: d.campaignId, campaignName: d.campaignName })),
      allowDuplicate,
    };
    if (dupes.length && !allowDuplicate) {
      out.ok = false;
      out.execution = {
        skipped: true,
        reason: 'duplicate_structure',
        message: `SKU ${plan.sku} already has a ${out.duplicateGuard.lane} lane (${dupes.map(d => d.campaignName).join(', ')}). Re-run with --allow-duplicate to create another.`,
      };
      return finalize(out, startedAt, args);
    }

    if (!execute) {
      out.ok = true;
      out.execution = { skipped: true, reason: 'dry-run', requestBody: built.requestBody };
      return finalize(out, startedAt, args);
    }

    // Execute the create.
    const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
    const meta = extractCreateMeta(response.json || {});
    const createOk = Number(meta.code) === 200 && !!meta.campaignId && !!meta.adGroupId;
    out.execution = { skipped: false, createOk, createMeta: meta, response: { status: response.status, code: meta.code, msg: meta.msg } };
    if (!createOk) {
      out.ok = false;
      out.execution.reason = 'create_failed';
      return finalize(out, startedAt, args);
    }

    // Create success: the backend returned a 200 + real campaignId/adGroupId.
    // That is the same signal a human trusts when they see the "创建成功" popup,
    // so we treat the create as done here. ok = true on createOk.
    out.ok = true;

    if (verify) {
      // --verify: full retry readback (0/20/45s) confirming every target/keyword
      // row is live at the requested bid. Use when bid/target correctness must be
      // proven before walking away (~65s slower).
      const readback = await readbackCreated(ws, createInput, meta);
      out.execution.readback = readback;
      out.ok = readback.allLanded && readback.bidMatch;
      out.execution.note = readback.allLanded
        ? 'Verified: all target/keyword rows landed and enabled at the requested bid.'
        : 'Create API succeeded but full readback did not confirm all rows; fresh-create lag is common. Re-read in a few minutes.';
    } else {
      // Default: one instant best-effort read as a bonus. Fresh-create lag means
      // it is often empty; that does NOT mean failure (the IDs already prove it).
      const readback = await readbackCreated(ws, createInput, meta, { delays: [0] });
      out.execution.readback = readback;
      out.execution.note = readback.landedCount >= readback.expectedCount
        ? 'Created and already visible on the backend.'
        : 'Created (backend returned campaignId/adGroupId). Target rows not visible yet due to fresh-create lag; pass --verify or re-read in a few minutes to confirm bids.';
    }
    return finalize(out, startedAt, args);
  } catch (error) {
    out.ok = false;
    out.execution = { ...(out.execution || {}), error: error.message };
    return finalize(out, startedAt, args);
  } finally {
    if (ws) try { ws.close(); } catch (_) {}
  }
}

function finalize(out, startedAt, args) {
  out.elapsedSeconds = Math.round((Date.now() - startedAt) / 100) / 10;
  const sku = (out.plan && out.plan.sku) || 'UNKNOWN';
  const date = ymd();
  const outFile = String(args.out || path.join(ACTIONS_DIR, `sp_create_${sku}_${date}.json`));
  out.artifact = writeJson(outFile, out);
  return out;
}

module.exports = {
  parseArgs,
  parseCsvList,
  normalizeMode,
  findDuplicateLane,
  buildPlan,
  extractCreateMeta,
  readbackCreated,
  runSpCreateFlow,
};
