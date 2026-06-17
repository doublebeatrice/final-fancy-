const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const SCHEMA_FILE = path.join(ROOT, 'data', 'schema', 'action_schema_uan_history_yoy_scale_2026-06-12.json');
const SNAPSHOT_FILE = path.join(ROOT, 'data', 'snapshots', 'uan_history_yoy_scale_execution_snapshot_2026-06-12.json');

const BUSINESS_DATE = '2026-06-12';
const SOURCE = 'codex_uan_history_yoy_scale_2026_06_12';
const FORCE_REASON = 'Operator explicitly instructed on 2026-06-12 to scale all 9 UAN mini-notebook SKUs using historical converting terms/targets and same-period-last-year converting terms; every action is narrow, evidence-backed, and requires landed readback.';

const ACTIONS = [
  { sku: 'UAN0188', id: '460104542537202', type: 'autoTarget', suggestedBid: 0.40, route: 'current30 winner auto loose-match' },
  { sku: 'UAN0188', id: '535139973667632', type: 'keyword', suggestedBid: 0.44, route: 'current30 winner phrase keyword' },
  { sku: 'UAN0188', id: '342269358392704', type: 'sbKeyword', suggestedBid: 0.36, route: 'same-period-last-year SBV winner' },

  { sku: 'UAN2600', id: '490835818394574', type: 'manualTarget', suggestedBid: 0.32, route: 'current30 ASIN exact winner' },
  { sku: 'UAN2600', id: '312302937290164', type: 'manualTarget', suggestedBid: 0.12, route: 'current30 expanded ASIN winner with under-CPC bid' },
  { sku: 'UAN2600', id: '514086328662086', type: 'autoTarget', suggestedBid: 0.36, route: 'current30 B2B substitute winner' },

  { sku: 'UAN2599', id: '438937671402705', type: 'autoTarget', suggestedBid: 0.24, route: 'same-period-last-year queryHighRelMatches winner' },
  { sku: 'UAN2599', id: '453350646575906', type: 'autoTarget', suggestedBid: 0.29, route: 'current30 accessory auto winner' },
  { sku: 'UAN2599', id: '274932927005870', type: 'keyword', suggestedBid: 0.34, route: 'current30 exact buyer keyword winner' },

  { sku: 'UAN3644', id: '113953351905728', type: 'manualTarget', suggestedBid: 0.40, route: 'current30 ASIN expanded winner' },
  { sku: 'UAN3644', id: '374091509911230', type: 'sbKeyword', suggestedBid: 0.40, route: 'current30 SBV keyword winner' },
  { sku: 'UAN3644', id: '346558289421532', type: 'sbKeyword', suggestedBid: 0.40, route: 'current30 SBV keyword winner' },
  { sku: 'UAN3644', id: '521121936994238', type: 'sbKeyword', suggestedBid: 0.31, route: 'same-period-last-year SBV keyword winner' },

  { sku: 'UAN3645', id: '302851125375034', type: 'manualTarget', suggestedBid: 0.33, route: 'current30 ASIN expanded winner' },
  { sku: 'UAN3645', id: '327937589976788', type: 'autoTarget', suggestedBid: 0.35, route: 'current30 B2B broad auto winner' },

  { sku: 'UAN3257', id: '281498068191983', type: 'autoTarget', suggestedBid: 0.35, route: 'current30 B2B broad auto winner' },
  { sku: 'UAN3257', id: '139194356149672', type: 'keyword', suggestedBid: 0.34, route: 'current30 mini notebooks keyword winner' },
  { sku: 'UAN3257', id: '324642262212349', type: 'manualTarget', suggestedBid: 0.22, route: 'current30 ASIN expanded winner with under-CPC bid' },

  { sku: 'UAN3256', id: '393772582337964', type: 'autoTarget', suggestedBid: 0.28, route: 'same-period-last-year queryHighRelMatches winner' },
  { sku: 'UAN3256', id: '281616262998243', type: 'autoTarget', suggestedBid: 0.36, route: 'current30 accessory auto winner' },
  { sku: 'UAN3256', id: '298208014677799', type: 'autoTarget', suggestedBid: 0.10, route: 'current30 broad auto winner with very low bid' },

  { sku: 'UAN3646', id: '385359973835496', type: 'sbKeyword', suggestedBid: 0.36, route: 'history365/lifetime SBV keyword winner' },
  { sku: 'UAN3646', id: '541483846463541', type: 'sbKeyword', suggestedBid: 0.33, route: 'history365/lifetime SBV keyword winner' },
  { sku: 'UAN3646', id: '391720909704942', type: 'autoTarget', suggestedBid: 0.16, route: 'lifetime auto queryHighRelMatches winner' },
];

const CREATE_UAN3248 = {
  sku: 'UAN3248',
  asin: 'B0D261HWGC',
  id: 'create::UAN3248::exact_history_terms',
  keywords: [
    'inspirational mini notebooks for students',
    'mini notepads bulk kids 400',
    '100 bulk notebooks',
  ],
  defaultBid: 0.22,
  dailyBudget: 3,
};

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function listHistoryFiles() {
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(name => /^uan_history_rows_.*_2026-06-12\.json$/.test(name))
    .map(name => path.join(SNAPSHOT_DIR, name));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowId(row = {}) {
  return String(row.keywordId || row.targetId || row.target_id || row.id || '').trim();
}

function label(row = {}) {
  return String(row.keywordText || row.targetingExpression || row.expressionText || row.type || row.text || '').trim();
}

function rowWindow(file) {
  return path.basename(file).match(/_(current30|yoy30|history365|all_since_launch)_/)?.[1] || '';
}

function allEvidenceRowsById() {
  const byId = new Map();
  for (const file of listHistoryFiles()) {
    const json = readJson(file, {});
    for (const row of json.targetRows || []) {
      const id = rowId(row);
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push({
        ...row,
        __file: path.relative(ROOT, file).replace(/\\/g, '/'),
        __window: rowWindow(file),
        __property: String(json.property || ''),
      });
    }
  }
  return byId;
}

function preferredRow(rows = []) {
  const order = ['current30', 'history365', 'all_since_launch', 'yoy30'];
  for (const window of order) {
    const row = rows.find(item => item.__window === window);
    if (row) return row;
  }
  return rows[0] || null;
}

function evidenceLines(rows = []) {
  return rows
    .filter(row => Number(row.Orders || 0) > 0 || row.__window === 'current30')
    .map(row => {
      const parts = [
        `${row.__window || 'window'} ${label(row) || rowId(row)}`,
        `bid=${row.bid ?? '-'}`,
        `clicks=${row.Clicks ?? '-'}`,
        `orders=${row.Orders ?? '-'}`,
        `ACOS=${row.ACOS ?? '-'}`,
        `CPC=${row.CPC ?? '-'}`,
        `state=${row.state ?? '-'}`,
        `parent=${row.campaignState ?? '-'}/${row.groupState ?? '-'}`,
        `source=${row.__file}`,
      ];
      return parts.join(' / ');
    });
}

function summaryRow(sku, days) {
  const file = path.join(SNAPSHOT_DIR, `ad_sku_summary_${sku}_${days}d_${BUSINESS_DATE}.json`);
  return readJson(file, {})?.rows?.[0] || {};
}

function productAnalysisRow(sku) {
  const file = path.join(SNAPSHOT_DIR, `product_analysis_query2_${sku}_${BUSINESS_DATE}.json`);
  return readJson(file, {})?.rows?.[0] || {};
}

function productAdRowsFor(sku) {
  const file = path.join(SNAPSHOT_DIR, `sku_ad_product_${sku}_${BUSINESS_DATE}.json`);
  return readJson(file, {})?.rows || [];
}

function makeStats(row) {
  return {
    impressions: num(row.Impressions),
    clicks: num(row.Clicks),
    spend: num(row.Spend),
    orders: num(row.Orders),
    sales: num(row.Sales),
    acos: num(row.ACOS),
    cpc: num(row.CPC),
  };
}

function makeCampaignRow(base = {}) {
  return {
    id: String(base.campaignId || ''),
    campaignId: String(base.campaignId || ''),
    name: base.campaignName || '',
    campaignName: base.campaignName || '',
    groupName: base.groupName || '',
    adGroupId: String(base.adGroupId || ''),
    accountId: base.accountId || 515,
    siteId: base.siteId || 4,
    state: base.campaignState || 1,
    campaignState: base.campaignState || 1,
    groupState: base.groupState || 1,
    budget: num(base.dailyBudget ?? base.budget) || null,
    dailyBudget: num(base.dailyBudget ?? base.budget) || null,
    keywords: [],
    autoTargets: [],
    productAds: [],
    sponsoredBrands: [],
  };
}

function addEntityToCampaign(campaign, action, row) {
  if (action.type === 'keyword') {
    campaign.keywords.push({
      id: String(row.keywordId || action.id),
      text: label(row),
      bid: num(row.bid),
      matchType: row.matchType || '',
      state: row.state,
      campaignState: row.campaignState,
      groupState: row.groupState,
      stats30d: makeStats(row),
    });
  } else if (action.type === 'autoTarget' || action.type === 'manualTarget') {
    campaign.autoTargets.push({
      id: String(row.targetId || row.target_id || action.id),
      targetType: action.type === 'manualTarget' ? 'manual' : 'auto',
      text: label(row),
      targetText: label(row),
      targetingExpression: label(row),
      bid: num(row.bid),
      state: row.state,
      campaignState: row.campaignState,
      groupState: row.groupState,
      stats30d: makeStats(row),
    });
  } else if (action.type === 'sbKeyword') {
    campaign.sbCampaign = campaign.sbCampaign || {
      id: String(row.campaignId || ''),
      campaignId: String(row.campaignId || ''),
      name: row.campaignName || '',
      state: row.campaignState || 'ENABLED',
      budget: null,
    };
    campaign.sponsoredBrands.push({
      id: String(row.keywordId || action.id),
      entityType: 'sbKeyword',
      text: label(row),
      bid: num(row.bid),
      matchType: row.matchType || '',
      state: row.state,
      campaignState: row.campaignState,
      groupState: row.groupState,
      rawProperty: '4',
      stats30d: makeStats(row),
    });
  }
}

function groupSelectedBySku(actions) {
  const bySku = new Map();
  for (const item of actions) {
    const sku = item.action?.sku || item.sku;
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(item);
  }
  return bySku;
}

function makeGoal(sku) {
  const row7 = summaryRow(sku, 7);
  const from = num(row7.orders) ?? num(row7['7_orders']) ?? 0;
  return {
    metric: 'orders',
    from,
    to: from + (from >= 5 ? 2 : 1),
    deadlineDays: 7,
    hardFloor: Math.max(0, from - 1),
  };
}

function makeAction(raw, row, evidenceRows) {
  const currentBid = num(row.bid);
  return {
    id: raw.id,
    entityType: raw.type,
    actionType: 'bid',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    text: label(row),
    label: label(row),
    currentBid,
    suggestedBid: raw.suggestedBid,
    decisionStage: 'manual_approved',
    approvedBy: 'manual',
    actionSource: ['manual', 'codex'],
    requiresAiDecision: false,
    forceExecute: true,
    forceReason: FORCE_REASON,
    allowLargeBidChange: true,
    riskLevel: 'traffic_push',
    confidence: 0.82,
    source: SOURCE,
    reason: `${raw.route}; lift bid ${currentBid} -> ${raw.suggestedBid} using historical converting evidence, with no budget expansion.`,
    hypothesis: `${raw.sku} can recover qualified mini-notebook traffic by lifting only a proven historical/current receiver while keeping spend on narrow lanes.`,
    evidence: evidenceLines(evidenceRows),
    expectedEffect: {
      impressions: 'up',
      clicks: 'up_controlled',
      spend: 'up_controlled',
      orders: 'up_or_watch',
      acos: 'watch',
    },
    goal: makeGoal(raw.sku),
    killSwitch: {
      metric: 'orders',
      condition: 'By 2026-06-19 spend rises but orders do not improve or ACOS breaks above 30% on this lane.',
      rollbackIf: '7d ACOS > 30% or 12+ new clicks with 0 orders after the bid lift.',
    },
    reviewPlan: {
      checkAfterDays: [3, 7],
      rollbackIf: '2026-06-15 no impressions/click recovery; 2026-06-19 spend increase without order lift or irrelevant search terms.',
    },
  };
}

function makeCreateAction() {
  const goal = makeGoal(CREATE_UAN3248.sku);
  return {
    id: CREATE_UAN3248.id,
    entityType: 'skuCandidate',
    actionType: 'create',
    decisionStage: 'manual_approved',
    approvedBy: 'manual',
    actionSource: ['manual', 'codex'],
    requiresAiDecision: false,
    forceExecute: true,
    forceReason: FORCE_REASON,
    allowDuplicateStructureCreate: true,
    riskLevel: 'traffic_push',
    confidence: 0.78,
    source: SOURCE,
    text: 'UAN3248 exact history buyer terms',
    reason: 'UAN3248 shared system auto group has same-SKU buyer-facing converting terms, but no owned target rows; create a narrow exact SP lane instead of scaling the shared system group.',
    hypothesis: 'Moving the three same-SKU buyer-facing terms into an owned exact lane should restore controlled impressions/clicks without relying on shared system attribution.',
    evidence: [
      'current30 system customer search term: inspirational mini notebooks for students / 1 click / 1 order / 3 same-SKU units / CPC 0.10',
      'current30 system customer search term: mini notepads bulk kids 400 / 1 click / 1 order / 2 same-SKU units / CPC 0.10',
      'current30 system customer search term: 100 bulk notebooks / 1 click / 1 order / 1 same-SKU unit / CPC 0.10',
      'SKU 30d CPC 0.2849 and product-line CPC about 0.3407; exact default bid 0.22 is traffic-capable but below broader SKU average.',
    ],
    createInput: {
      advType: 'SP',
      mode: 'keywordTarget',
      sku: CREATE_UAN3248.sku,
      asin: CREATE_UAN3248.asin,
      accountId: 515,
      siteId: 4,
      dailyBudget: CREATE_UAN3248.dailyBudget,
      defaultBid: CREATE_UAN3248.defaultBid,
      coreTerm: 'history mini notebook terms',
      matchType: 'EXACT',
      keywords: CREATE_UAN3248.keywords,
      campaignName: 'ai_kw exact_history mini notebook terms_uan3248',
      groupName: 'ai_kw exact_history mini notebook terms_uan3248',
    },
    expectedEffect: {
      impressions: 'up',
      clicks: 'up_controlled',
      spend: 'up_controlled',
      orders: 'up_or_watch',
      acos: 'watch',
    },
    goal,
    killSwitch: {
      metric: 'orders',
      condition: 'By 2026-06-19 created exact lane gets spend/clicks but no same-SKU order.',
      rollbackIf: 'Created exact terms spend >= 6 USD total or reach 12 clicks with 0 same-SKU orders.',
    },
    reviewPlan: {
      checkAfterDays: [3, 7],
      rollbackIf: 'If exact terms do not receive impressions by 2026-06-15, check bid/parent state; if they spend without orders by 2026-06-19, cut weak terms.',
    },
  };
}

function buildProductCards(selectedBySku) {
  const cards = [];
  for (const sku of [...new Set([...selectedBySku.keys(), CREATE_UAN3248.sku])]) {
    const pa = productAnalysisRow(sku);
    const ad30 = summaryRow(sku, 30);
    const ad7 = summaryRow(sku, 7);
    const inv = ad30.skuInvData || {};
    const card = {
      sku,
      asin: pa.asin || inv.asin || CREATE_UAN3248.asin,
      salesChannel: 'Amazon.com',
      siteId: 4,
      saleStatus: inv.sale_status || inv.saleStatus || 'normal_sale',
      sale_status: inv.sale_status || inv.saleStatus || 'normal_sale',
      opendate: pa.origin_fuldate || inv.ful_date || '',
      fuldate: pa.origin_fuldate || inv.ful_date || '',
      price: num(inv.price) || null,
      profitRate: null,
      invDays: pa.sales_30 ? Math.round((num(pa.fba_inv) || 0) / Math.max(1, num(pa.sales_30)) * 30) : null,
      unitsSold_7d: num(ad7.unitsSoldSameSku7d) || 0,
      unitsSold_30d: num(pa.sales_30) || num(ad30.unitsSoldSameSku7d) || 0,
      fulFillable: num(pa.fba_inv) || 0,
      stockFul: num(pa.fba_inv) || 0,
      title_ch: pa.title_ch || '',
      productName: pa.title_en_file_audit || '',
      listing: {
        title: pa.title_en_file_audit || '',
        isAvailable: true,
        hasImages: true,
      },
      adStats: {
        '7d': {
          orders: num(ad7.orders) || 0,
          clicks: num(ad7.clicks) || 0,
          spend: num(ad7.cost) || 0,
          acos: num(ad7.acos),
        },
        '30d': {
          orders: num(ad30.orders) || 0,
          clicks: num(ad30.clicks) || 0,
          spend: num(ad30.cost) || 0,
          acos: num(ad30.acos),
        },
      },
      campaigns: [],
    };

    const campaignMap = new Map();
    for (const selected of selectedBySku.get(sku) || []) {
      const key = `${selected.row.campaignId}::${selected.row.adGroupId}`;
      if (!campaignMap.has(key)) campaignMap.set(key, makeCampaignRow(selected.row));
      addEntityToCampaign(campaignMap.get(key), selected.action, selected.row);
    }
    for (const ad of productAdRowsFor(sku)) {
      const key = `${ad.campaignId}::${ad.adGroupId}`;
      if (!campaignMap.has(key)) campaignMap.set(key, makeCampaignRow(ad));
      campaignMap.get(key).productAds.push({
        id: String(ad.adId || ad.primaryId || ''),
        adId: String(ad.adId || ad.primaryId || ''),
        entityType: 'productAd',
        sku,
        asin: card.asin,
        state: ad.state,
        campaignState: ad.campaignState,
        groupState: ad.groupState,
        stats30d: makeStats(ad),
      });
    }
    card.campaigns = [...campaignMap.values()];
    cards.push(card);
  }
  return cards;
}

function build() {
  const evidenceById = allEvidenceRowsById();
  const selected = [];
  const schemaBySku = new Map();
  const rows = {
    kwRows: [],
    autoRows: [],
    targetRows: [],
    productAdRows: [],
    sbRows: [],
    sbCampaignRows: [],
  };
  const seenTopRows = new Set();

  for (const action of ACTIONS) {
    const evidenceRows = evidenceById.get(action.id) || [];
    const row = preferredRow(evidenceRows);
    if (!row) throw new Error(`missing row for ${action.sku} ${action.id}`);
    selected.push({ action, row, evidenceRows });
    const planAction = makeAction(action, row, evidenceRows);
    if (!schemaBySku.has(action.sku)) {
      schemaBySku.set(action.sku, {
        sku: action.sku,
        asin: productAnalysisRow(action.sku).asin || '',
        operatorRequested: true,
        summary: 'Scale from historical converting terms/targets and same-period-last-year winners only.',
        actions: [],
      });
    }
    schemaBySku.get(action.sku).actions.push(planAction);

    const topRow = { ...row, sku: action.sku };
    const rowKey = `${action.type}:${action.id}`;
    if (!seenTopRows.has(rowKey)) {
      seenTopRows.add(rowKey);
      if (action.type === 'keyword') rows.kwRows.push(topRow);
      if (action.type === 'autoTarget') rows.autoRows.push(topRow);
      if (action.type === 'manualTarget') rows.targetRows.push(topRow);
      if (action.type === 'sbKeyword') rows.sbRows.push({ ...topRow, __adProperty: '4' });
    }
  }

  if (!schemaBySku.has(CREATE_UAN3248.sku)) {
    schemaBySku.set(CREATE_UAN3248.sku, {
      sku: CREATE_UAN3248.sku,
      asin: CREATE_UAN3248.asin,
      operatorRequested: true,
      summary: 'Create owned exact SP lane from same-SKU buyer-facing converting terms in the historical system auto group.',
      actions: [],
    });
  }
  schemaBySku.get(CREATE_UAN3248.sku).actions.push(makeCreateAction());

  const selectedBySku = groupSelectedBySku(selected);
  const productCards = buildProductCards(selectedBySku);

  for (const sku of productCards.map(card => card.sku)) {
    for (const row of productAdRowsFor(sku)) rows.productAdRows.push(row);
  }

  const invMap = Object.fromEntries(productCards.map(card => [card.sku, {
    sku: card.sku,
    asin: card.asin,
    salesChannel: 'Amazon.com',
    saleStatus: card.saleStatus,
    fuldate: card.fuldate,
    opendate: card.opendate,
  }]));
  const inventoryScopeRows = Object.values(invMap);

  const schema = [...schemaBySku.values()];
  const snapshot = {
    exportedAt: new Date().toISOString(),
    source: SOURCE,
    businessDate: BUSINESS_DATE,
    productCards,
    inventoryScopeRows,
    invMap,
    ...rows,
    sp7DayUntouchedRows: [],
    sb7DayUntouchedRows: [],
    sevenDayUntouchedMeta: {},
  };

  fs.mkdirSync(path.dirname(SCHEMA_FILE), { recursive: true });
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SCHEMA_FILE, JSON.stringify(schema, null, 2), 'utf8');
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(JSON.stringify({
    schemaFile: path.relative(ROOT, SCHEMA_FILE),
    snapshotFile: path.relative(ROOT, SNAPSHOT_FILE),
    skus: schema.length,
    actions: schema.reduce((sum, item) => sum + item.actions.length, 0),
    rows: Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, value.length])),
  }, null, 2));
}

build();
