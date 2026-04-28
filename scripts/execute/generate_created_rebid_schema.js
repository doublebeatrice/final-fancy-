const fs = require('fs');
const path = require('path');
const { createPanelWs } = require('../../src/adjust_lib');

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch (_) {
    return fallback;
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function modeKey(action = {}) {
  const input = action.createInput || {};
  const mode = String(input.mode || '').toLowerCase();
  if (mode === 'auto') return 'AUTO';
  return String(input.matchType || '').toUpperCase() || mode.toUpperCase();
}

function desiredBidMap(rebidPlans = []) {
  const map = new Map();
  for (const plan of rebidPlans) {
    for (const action of plan.actions || []) {
      if (action.actionType !== 'create') continue;
      const bid = num(action.createInput?.defaultBid);
      if (!bid) continue;
      map.set(`${plan.sku}::${modeKey(action)}`, bid);
    }
  }
  return map;
}

async function readPanelRows() {
  const ws = await createPanelWs();
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));
  const evalInPanel = (expression, awaitPromise = false) => new Promise(resolve => {
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
  const rows = {
    kwRows: parseJson(await evalInPanel('JSON.stringify(STATE.kwRows || [])'), []),
    autoRows: parseJson(await evalInPanel('JSON.stringify(STATE.autoRows || [])'), []),
    targetRows: parseJson(await evalInPanel('JSON.stringify(STATE.targetRows || [])'), []),
    sbRows: parseJson(await evalInPanel('JSON.stringify(STATE.sbRows || [])'), []),
    productCards: parseJson(await evalInPanel('JSON.stringify(STATE.productCards || [])'), []),
    invMap: parseJson(await evalInPanel('JSON.stringify(STATE.invMap || {})'), {}),
  };
  ws.close();
  return rows;
}

function rowBid(row) {
  return num(row.bid ?? row.defaultBid ?? row.cpcBid);
}

function rowId(row) {
  return String(row.keywordId || row.targetId || row.target_id || row.id || '').trim();
}

function rowMatch(row, fallback) {
  return String(row.matchType || row.match_type || fallback || '').toUpperCase();
}

async function main() {
  const verifyFile = process.argv[2];
  const rebidPlanFile = process.argv[3];
  const outSchemaFile = process.argv[4];
  const outSnapshotFile = process.argv[5];
  if (!verifyFile || !rebidPlanFile || !outSchemaFile || !outSnapshotFile) {
    throw new Error('Usage: node scripts/execute/generate_created_rebid_schema.js <execution_verify.json> <rebid_create_schema.json> <out_schema.json> <out_snapshot.json>');
  }

  const verify = JSON.parse(fs.readFileSync(verifyFile, 'utf8'));
  const rebidPlans = JSON.parse(fs.readFileSync(rebidPlanFile, 'utf8'));
  const desired = desiredBidMap(rebidPlans);
  const panel = await readPanelRows();
  const createEvents = (verify.events || []).filter(event => event.action?.actionType === 'create' && event.campaignId);
  const createByCampaign = new Map(createEvents.map(event => [String(event.campaignId), event]));
  const plans = new Map();

  function addAction(sku, action) {
    if (!plans.has(sku)) plans.set(sku, { sku, asin: action.asin || '', summary: 'Rebid newly created SP campaigns using price/CPC-aware initial bid.', actions: [] });
    plans.get(sku).actions.push(action);
  }

  for (const row of panel.kwRows || []) {
    const event = createByCampaign.get(String(row.campaignId || row.campaign_id || ''));
    if (!event) continue;
    const sku = String(event.sku || row.sku || '').trim();
    const match = rowMatch(row, modeKey(event.action));
    const next = desired.get(`${sku}::${match}`);
    const current = rowBid(row);
    const id = rowId(row);
    if (!id || !next || !current || next <= current + 0.01) continue;
    addAction(sku, {
      id,
      entityType: 'keyword',
      actionType: 'bid',
      currentBid: current,
      suggestedBid: next,
      reason: 'Initial bid was too low for price/CPC context; correct newly created keyword bid to a click-capable level.',
      evidence: [`campaignId=${row.campaignId || row.campaign_id}`, `matchType=${match}`, `oldBid=${current}`, `newBid=${next}`],
      confidence: 0.82,
      riskLevel: 'initial_bid_correction',
      actionSource: ['generator_candidate'],
    });
  }

  for (const row of panel.autoRows || []) {
    const event = createByCampaign.get(String(row.campaignId || row.campaign_id || ''));
    if (!event) continue;
    const sku = String(event.sku || row.sku || '').trim();
    const next = desired.get(`${sku}::AUTO`);
    const current = rowBid(row);
    const id = rowId(row);
    if (!id || !next || !current || next <= current + 0.01) continue;
    addAction(sku, {
      id,
      entityType: 'autoTarget',
      actionType: 'bid',
      currentBid: current,
      suggestedBid: next,
      reason: 'Initial auto target bid was too low for price/CPC context; correct newly created auto bid to a click-capable level.',
      evidence: [`campaignId=${row.campaignId || row.campaign_id}`, `targetType=${row.targetType || ''}`, `oldBid=${current}`, `newBid=${next}`],
      confidence: 0.82,
      riskLevel: 'initial_bid_correction',
      actionSource: ['generator_candidate'],
    });
  }

  const schema = [...plans.values()].filter(plan => plan.actions.length);
  fs.mkdirSync(path.dirname(outSchemaFile), { recursive: true });
  fs.writeFileSync(outSchemaFile, JSON.stringify(schema, null, 2), 'utf8');
  fs.writeFileSync(outSnapshotFile, JSON.stringify(panel, null, 2), 'utf8');
  console.log(JSON.stringify({
    outSchemaFile,
    outSnapshotFile,
    plannedSkus: schema.length,
    plannedActions: schema.reduce((sum, plan) => sum + plan.actions.length, 0),
    top: schema.slice(0, 20).map(plan => ({ sku: plan.sku, actions: plan.actions.length, bids: plan.actions.slice(0, 5).map(action => `${action.currentBid}->${action.suggestedBid}`) })),
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
