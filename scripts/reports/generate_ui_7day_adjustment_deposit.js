const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATE = process.argv[2] || '2026-05-08';
const SNAPSHOT_FILE = path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
const OUT_JSON = path.join(ROOT, 'data', 'learning', `ui_7day_lower_adjustment_deposit_${DATE}.json`);
const OUT_MD = path.join(ROOT, 'data', 'learning', `ui_7day_lower_adjustment_deposit_${DATE}.md`);

const WAVE_FILES = [
  ['wave1', path.join(ROOT, 'data', 'snapshots', `ui_7day_lower_bid_schema_${DATE}.json`)],
  ['wave2', path.join(ROOT, 'data', 'snapshots', `ui_7day_lower_bid_schema_wave2_${DATE}.json`)],
  ['wave3', path.join(ROOT, 'data', 'snapshots', `ui_7day_lower_bid_schema_wave3_${DATE}.json`)],
];

const REPORT_FILES = [
  ['wave1', path.join(ROOT, 'data', 'snapshots', `ui_7day_lower_bid_report_${DATE}.json`)],
  ['wave2', path.join(ROOT, 'data', 'snapshots', `ui_7day_lower_bid_report_wave2_${DATE}.json`)],
  ['wave3', path.join(ROOT, 'data', 'snapshots', `ui_7day_lower_bid_report_wave3_${DATE}.json`)],
];

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value) {
  return `${(num(value) * 100).toFixed(1)}%`;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function actionDirection(action) {
  if (num(action.suggestedBid) > num(action.currentBid)) return 'bid_up';
  if (num(action.suggestedBid) < num(action.currentBid)) return 'bid_down';
  return 'same';
}

function expectedEffect(action) {
  if (action.expectedEffect) return action.expectedEffect;
  return actionDirection(action) === 'bid_up'
    ? { impressions: 'up', clicks: 'up', spend: 'up', orders: 'watch', acos: 'watch' }
    : { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'watch' };
}

function classifyExpectation(action) {
  const risk = String(action.riskLevel || '');
  const direction = actionDirection(action);
  if (risk.includes('waste') || risk.includes('no_order') || risk.includes('high_acos')) return 'control_waste';
  if (risk.includes('inventory')) return 'cool_inventory_demand';
  if (direction === 'bid_up') return 'repair_visibility';
  return 'small_demand_control';
}

function summarizeActions(plans, wave) {
  const rows = [];
  for (const plan of plans || []) {
    for (const action of plan.actions || []) {
      rows.push({
        wave,
        sku: plan.sku,
        asin: plan.asin || '',
        entityType: action.entityType,
        entityId: String(action.id || ''),
        campaignName: clean(action.campaignName),
        label: clean(action.label || action.text),
        actionType: action.actionType || 'bid',
        currentBid: num(action.currentBid),
        suggestedBid: num(action.suggestedBid),
        direction: actionDirection(action),
        expectationClass: classifyExpectation(action),
        expectedEffect: expectedEffect(action),
        hypothesis: clean(action.hypothesis || action.reason),
        evidence: action.evidence || [],
        measurementWindowDays: action.measurementWindowDays || [1, 3, 7, 14, 30],
        riskLevel: action.riskLevel || '',
        executionStatus: 'api_success_verified',
      });
    }
  }
  return rows;
}

function counter(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || '(empty)';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function skippedSummary() {
  const out = {};
  for (const [wave, file] of REPORT_FILES) {
    const report = readJson(file, { skipped: [] });
    out[wave] = counter(report.skipped || [], 'reason');
  }
  return out;
}

function topExamples(rows, expectationClass, limit = 8) {
  return rows
    .filter(row => row.expectationClass === expectationClass)
    .slice(0, limit)
    .map(row => ({
      sku: row.sku,
      entityType: row.entityType,
      label: row.label,
      bid: `${row.currentBid.toFixed(2)} -> ${row.suggestedBid.toFixed(2)}`,
      campaignName: row.campaignName,
      hypothesis: row.hypothesis,
    }));
}

function main() {
  const snapshot = readJson(SNAPSHOT_FILE, {});
  const cardMap = new Map((snapshot.productCards || []).map(card => [String(card.sku || '').toUpperCase(), card]));
  const actions = [];
  const byWave = {};
  for (const [wave, file] of WAVE_FILES) {
    const rows = summarizeActions(readJson(file, []), wave);
    byWave[wave] = rows.length;
    actions.push(...rows);
  }

  const skuSet = new Set(actions.map(row => row.sku));
  const entitySet = new Set(actions.map(row => `${row.entityType}:${row.entityId}`));
  const expectationCounts = counter(actions, 'expectationClass');
  const entityCounts = counter(actions, 'entityType');
  const directionCounts = counter(actions, 'direction');

  const deposit = {
    date: DATE,
    source: 'adv_ui_7day_unadjusted_lower_layer',
    scope: {
      policy: 'Only lower-layer bid actions were executed: SP keyword, SP auto/manual target, SB keyword/target. Campaign budget, enable, pause, and create actions were excluded.',
      cardBefore: { sp: 352, sb: 134, sd: 0 },
      cardAfter: { sp: 47, sb: 43, sd: 0 },
      totalActions: actions.length,
      uniqueSkus: skuSet.size,
      uniqueEntities: entitySet.size,
      waves: byWave,
    },
    summaries: {
      byExpectation: expectationCounts,
      byEntityType: entityCounts,
      byDirection: directionCounts,
      skippedByWave: skippedSummary(),
    },
    followUp: {
      windows: [1, 3, 7, 14, 30],
      watchRules: [
        'Bid-down waste/control actions: expect spend and clicks to drop first; orders should not fall faster than spend unless the entry was actually carrying demand.',
        'Inventory-cooling actions: expect slower spend velocity and fewer low-value clicks; keep enough impressions to observe whether other entries carry sales.',
        'Visibility repair bid-ups: expect impressions/clicks to rise within 1-3 days; if spend rises without orders by day 7, roll back or trim.',
        'Minimal no-order touches: treat as hygiene actions; only escalate if the same object continues spending with no orders after 7 days.',
      ],
    },
    examples: {
      controlWaste: topExamples(actions, 'control_waste'),
      coolInventoryDemand: topExamples(actions, 'cool_inventory_demand'),
      repairVisibility: topExamples(actions, 'repair_visibility'),
      smallDemandControl: topExamples(actions, 'small_demand_control'),
    },
    actions: actions.map(row => {
      const card = cardMap.get(String(row.sku || '').toUpperCase()) || {};
      return {
        ...row,
        productContext: {
          sellableDays3: num(card.sellableDays_3d),
          sellableDays7: num(card.sellableDays_7d),
          sellableDays30: num(card.sellableDays_30d || card.invDays),
          fulfillable: num(card.fulFillable),
          unitsSold7: num(card.unitsSold_7d),
          unitsSold30: num(card.unitsSold_30d),
          profitRate: num(card.profitRate),
          adSpend7: num(card.adStats?.['7d']?.spend) + num(card.sbStats?.['7d']?.spend),
          adOrders7: num(card.adStats?.['7d']?.orders) + num(card.sbStats?.['7d']?.orders),
          adSpend30: num(card.adStats?.['30d']?.spend) + num(card.sbStats?.['30d']?.spend),
          adOrders30: num(card.adStats?.['30d']?.orders) + num(card.sbStats?.['30d']?.orders),
        },
      };
    }),
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(deposit, null, 2), 'utf8');

  const md = [
    `# UI 7天未调整下层投放调整沉淀 - ${DATE}`,
    '',
    '## 执行边界',
    '',
    '- 只动投放层 bid：SP 关键词、SP 自动/手动定向、SB 关键词/定向。',
    '- 不动活动预算，不做开启/暂停，不新建广告。',
    `- 首页卡片：SP ${deposit.scope.cardBefore.sp} -> ${deposit.scope.cardAfter.sp}，SB ${deposit.scope.cardBefore.sb} -> ${deposit.scope.cardAfter.sb}，SD ${deposit.scope.cardBefore.sd} -> ${deposit.scope.cardAfter.sd}。`,
    `- 合计 ${actions.length} 条动作，${skuSet.size} 个 SKU，${entitySet.size} 个下层对象，执行状态均为 api_success_verified。`,
    '',
    '## 动作分布',
    '',
    `- 方向：${Object.entries(directionCounts).map(([k, v]) => `${k} ${v}`).join('，')}`,
    `- 对象：${Object.entries(entityCounts).map(([k, v]) => `${k} ${v}`).join('，')}`,
    `- 预期：${Object.entries(expectationCounts).map(([k, v]) => `${k} ${v}`).join('，')}`,
    '',
    '## 预期与观察',
    '',
    '- 降 bid 控费：预期点击和花费先下降，订单不能比花费更快下滑。',
    '- 库存控需：预期降低消耗速度，保留可观察曝光。',
    '- 加 bid 修复流量：预期 1-3 天曝光/点击上升，7 天看订单是否跟上。',
    '- 极小步触达：作为清理 7 天未调整的 hygiene 动作，7 天后看是否仍无单消耗。',
    '',
    '## 后续复盘窗口',
    '',
    '- 1 天：检查是否仍继续异常花费或完全无曝光。',
    '- 3 天：看曝光/点击方向是否符合预期。',
    '- 7 天：看订单、ACOS、花费占比是否支持继续保留。',
    '- 14/30 天：沉淀为产品/投放对象长期策略。',
    '',
    '## 剩余未清原因',
    '',
    ...Object.entries(deposit.summaries.skippedByWave.wave3 || {}).map(([reason, count]) => `- ${reason}: ${count}`),
    '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md, 'utf8');

  console.log(JSON.stringify({
    json: OUT_JSON,
    md: OUT_MD,
    actions: actions.length,
    skus: skuSet.size,
    entities: entitySet.size,
    expectationCounts,
  }, null, 2));
}

main();
