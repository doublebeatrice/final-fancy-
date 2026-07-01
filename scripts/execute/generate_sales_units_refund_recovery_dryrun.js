const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function round(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  const date = text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return {
    date,
    gateFile: text(options.gate || path.join(ROOT, 'data', 'tasks', `kpi_recovery_gate_${date}.json`)),
    snapshotFile: text(options.snapshot || path.join(ROOT, 'data', 'snapshots', 'runs', `today_ops_${date}T01-14-14-249Z`, `snapshot_${date}.json`)),
    operatingReviewFile: text(options.operatingReview || options['operating-review'] || path.join(ROOT, 'data', 'tasks', `all_sku_operating_review_${date}.json`)),
    highEfficiencySchemaFile: text(options.highEfficiencySchema || options['high-efficiency-schema'] || path.join(ROOT, 'data', 'snapshots', `high_efficiency_bid_schema_${date}_current.json`)),
    dryRunDecisionsFile: text(options.dryRunDecisions || options['dry-run-decisions'] || path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${date}.json`)),
    adjustmentsFile: text(options.adjustments || path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`)),
    writeExecutionFile: text(options.writeExecution || options['write-execution'] || path.join(ROOT, 'data', 'agent', `write_execution_${date}.json`)),
    closureVerifyFile: text(options.closureVerify || options['closure-verify'] || path.join(ROOT, 'data', 'agent', `daily_closure_verify_${date}.json`)),
    outFile: text(options.out || path.join(ROOT, 'data', 'tasks', `sales_units_refund_recovery_dryrun_${date}.json`)),
    markdownFile: text(options.md || path.join(ROOT, 'data', 'tasks', `sales_units_refund_recovery_dryrun_${date}.md`)),
  };
}

function bySku(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const sku = text(row.sku || row.productLine?.sku || row.productVariantInfo?.sku);
    if (sku && !map.has(sku)) map.set(sku, row);
  }
  return map;
}

function sumBySku(rows = [], skuField = 'sku') {
  const map = new Map();
  for (const row of rows) {
    const sku = text(row[skuField] || row.productLine?.sku || row.productVariantInfo?.sku);
    if (!sku) continue;
    const current = map.get(sku) || {
      spend7: 0,
      sales7: 0,
      orders7: 0,
      clicks7: 0,
      impressions7: 0,
      spend30: 0,
      sales30: 0,
      orders30: 0,
      clicks30: 0,
      impressions30: 0,
    };
    current.spend7 += num(row.spend7 ?? row['7_cost'] ?? row['7_spend'] ?? 0);
    current.sales7 += num(row.sales7 ?? row['7_sales'] ?? 0);
    current.orders7 += num(row.orders7 ?? row['7_orders'] ?? 0);
    current.clicks7 += num(row.clicks7 ?? row['7_clicks'] ?? 0);
    current.impressions7 += num(row.impressions7 ?? row['7_impressions'] ?? 0);
    current.spend30 += num(row.Spend ?? row.spend ?? row['30_cost'] ?? 0);
    current.sales30 += num(row.Sales ?? row.sales ?? row['30_sales'] ?? 0);
    current.orders30 += num(row.Orders ?? row.orders ?? row['30_orders'] ?? 0);
    current.clicks30 += num(row.Clicks ?? row.clicks ?? row['30_clicks'] ?? 0);
    current.impressions30 += num(row.Impressions ?? row.impressions ?? row['30_impressions'] ?? 0);
    map.set(sku, current);
  }
  for (const value of map.values()) {
    value.acos7 = value.sales7 > 0 ? value.spend7 / value.sales7 : 0;
    value.acos30 = value.sales30 > 0 ? value.spend30 / value.sales30 : 0;
  }
  return map;
}

function flattenHighEfficiency(schema = []) {
  const rows = [];
  for (const item of Array.isArray(schema) ? schema : []) {
    const sku = text(item.sku);
    for (const action of item.actions || []) {
      rows.push({
        sku,
        asin: text(item.asin),
        entityType: text(action.entityType),
        entityId: text(action.id || action.entityId),
        term: text(action.text || action.entityName),
        reason: text(action.reason),
        suggestedBid: num(action.suggestedBid, null),
        currentBid: num(action.currentBid, null),
      });
    }
  }
  return rows;
}

function productMetrics(card = {}, ad = {}, operating = {}) {
  const labels = card.productLabels || {};
  return {
    sku: text(card.sku || operating.sku),
    asin: text(card.asin || operating.asin),
    saleStatus: text(card.saleStatus),
    price: round(card.price, 2),
    netProfit: round(card.netProfit ?? operating.profitRate, 4),
    busyNetProfit: round(card.busyNetProfit ?? card.netProfit ?? operating.profitRate, 4),
    invDays: round(card.invDays ?? operating.invDays, 1),
    units3d: round(card.unitsSold_3d ?? operating.units3d, 0),
    units7d: round(card.unitsSold_7d ?? operating.units7d, 0),
    units30d: round(card.unitsSold_30d ?? operating.units30d, 0),
    salesPace7v30: round(operating.salesPace7v30, 4),
    yoyUnitsPct: round(card.yoyUnitsPct ?? operating.yoyUnitsPct, 4),
    sessionsLastWeek: round(card.listingSessions?.lastWeek, 0),
    conversionLastWeek: round(card.listingConversionRates?.lastWeek, 4),
    productType: text(labels.product_type),
    highReturnFlag: num(labels.is_high_return_rate, 0),
    illegalVariantFlag: num(labels.is_illegal_variant, 0),
    variationFlag: num(labels.is_variation, 0),
    combinationFlag: num(labels.is_comb_variant, 0),
    brandLogo: text(labels.is_brand_logo),
    compliantFlag: num(labels.is_compliant, 0),
    expiredFlag: text(labels.is_expired),
    ad7: {
      orders: round(ad.orders7, 0),
      clicks: round(ad.clicks7, 0),
      impressions: round(ad.impressions7, 0),
      sales: round(ad.sales7, 2),
      spend: round(ad.spend7, 2),
      acos: round(ad.acos7, 4),
    },
    ad30: {
      orders: round(ad.orders30, 0),
      clicks: round(ad.clicks30, 0),
      impressions: round(ad.impressions30, 0),
      sales: round(ad.sales30, 2),
      spend: round(ad.spend30, 2),
      acos: round(ad.acos30, 4),
    },
    verdict: text(operating.verdict),
    operatingReasons: Array.isArray(operating.reasons) ? operating.reasons.slice(0, 3) : [],
  };
}

function buildHighProfitScaleCandidates(context) {
  const { productCards, operatingBySku, adBySku, highRows } = context;
  const highBySku = new Map();
  for (const row of highRows) {
    if (!highBySku.has(row.sku)) highBySku.set(row.sku, []);
    highBySku.get(row.sku).push(row);
  }
  return productCards
    .map(card => productMetrics(card, adBySku.get(text(card.sku)) || {}, operatingBySku.get(text(card.sku)) || {}))
    .filter(item => {
      const efficientAd = item.ad7.orders >= 1 && item.ad7.acos > 0 && item.ad7.acos <= Math.min(0.18, Math.max(0.08, item.netProfit * 0.85));
      return item.netProfit >= 0.12 &&
        item.busyNetProfit >= 0.08 &&
        item.invDays >= 30 &&
        (item.units7d > 0 || item.ad7.orders > 0) &&
        (efficientAd || highBySku.has(item.sku));
    })
    .map(item => {
      const rows = (highBySku.get(item.sku) || []).slice(0, 3);
      const score = item.units7d * 2 + item.ad7.orders * 5 + item.netProfit * 100 + Math.min(item.invDays, 180) / 10 + rows.length * 3;
      return {
        ...item,
        score: round(score, 2),
        efficientRows: rows,
        action: 'dry_run_watch_existing_efficient_rows_no_budget_up',
        checkpoint: '2026-06-09 read 1d order/spend signal; 2026-06-11 read 3d effect; no budget increase before fresh approval',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}

function buildConversionRepairCandidates(context) {
  const { productCards, operatingBySku, adBySku } = context;
  const repairVerdicts = new Set(['node_conversion_gap', 'old_product_recovery_check', 'deep_check', 'node_traffic_gap']);
  return productCards
    .map(card => productMetrics(card, adBySku.get(text(card.sku)) || {}, operatingBySku.get(text(card.sku)) || {}))
    .filter(item => {
      const weakListing = item.sessionsLastWeek >= 80 && item.conversionLastWeek > 0 && item.conversionLastWeek < 0.02;
      const adClickNoOrder = item.ad7.clicks >= 20 && item.ad7.orders === 0;
      const paceDrop = item.units30d >= 10 && item.salesPace7v30 < -0.35;
      return item.invDays >= 20 && (repairVerdicts.has(item.verdict) || weakListing || adClickNoOrder || paceDrop);
    })
    .map(item => {
      const score = (item.ad7.clicks || 0) + Math.max(0, -item.salesPace7v30) * 50 + (item.sessionsLastWeek || 0) / 20 + (item.units30d || 0) / 3;
      const reasons = [];
      if (item.verdict) reasons.push(`operating_verdict=${item.verdict}`);
      if (item.ad7.clicks >= 20 && item.ad7.orders === 0) reasons.push('7d_ad_clicks_without_orders');
      if (item.sessionsLastWeek >= 80 && item.conversionLastWeek < 0.02) reasons.push('listing_conversion_low');
      if (item.units30d >= 10 && item.salesPace7v30 < -0.35) reasons.push('sales_pace_drop');
      return {
        ...item,
        score: round(score, 2),
        repairReasons: reasons,
        action: 'dry_run_conversion_repair_listing_price_image_search_term_review_no_live_write',
        checkpoint: '2026-06-09 pull listing/session/search-term detail before any ad action',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

function refundRiskSignals(item) {
  const signals = [];
  if (item.highReturnFlag) signals.push('product_label_high_return_rate');
  if (item.illegalVariantFlag) signals.push('illegal_variant_flag');
  if (item.variationFlag || item.combinationFlag) signals.push('variation_or_combination');
  if (/组合/.test(item.productType)) signals.push('combination_product_type');
  if (item.sessionsLastWeek >= 80 && item.conversionLastWeek > 0 && item.conversionLastWeek < 0.02) signals.push('low_listing_conversion_proxy');
  if (item.units7d >= 10 || item.units30d >= 50) signals.push('high_recent_unit_contribution');
  if (item.netProfit < 0.12) signals.push('thin_profit_after_refund_risk');
  if (item.compliantFlag) signals.push('compliance_label_check');
  if (item.expiredFlag) signals.push('expired_label_check');
  return signals;
}

function buildRefundRootCauseSuspects(context) {
  const { productCards, operatingBySku, adBySku } = context;
  return productCards
    .map(card => productMetrics(card, adBySku.get(text(card.sku)) || {}, operatingBySku.get(text(card.sku)) || {}))
    .map(item => ({ ...item, proxySignals: refundRiskSignals(item) }))
    .filter(item => item.proxySignals.length >= 2)
    .map(item => {
      const score = item.proxySignals.length * 10 + item.units7d * 1.5 + item.units30d / 4 + (item.highReturnFlag ? 30 : 0);
      return {
        ...item,
        score: round(score, 2),
        evidenceLevel: 'proxy_suspect_not_confirmed_sku_refund_rate',
        action: 'pull_sku_refund_reason_report_before_operating_action',
        checkpoint: '2026-06-09 verify SKU-level return/refund reason report; do not cut traffic from proxy alone',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

function buildNoWriteAudit(adjustments = [], writeExecution = {}) {
  const rows = Array.isArray(adjustments) ? adjustments : [];
  const nonDryRows = rows.filter(row => row?.dryRun !== true);
  const budgetLive = rows.filter(row => row?.dryRun !== true && text(row.actionType) === 'budget').length;
  const liveSuccessRows = nonDryRows.filter(row => ['success', 'api_success'].includes(text(row.outcome || row.status))).length;
  const liveFailedRows = nonDryRows.filter(row => /fail|error|blocked/i.test(text(row.outcome || row.status))).length;
  const latestRunAt = rows.map(row => text(row.runAt)).filter(Boolean).sort().at(-1) || '';
  const latestRows = rows
    .slice()
    .sort((a, b) => text(b.runAt).localeCompare(text(a.runAt)))
    .slice(0, 5)
    .map(row => ({
      sku: text(row.sku),
      actionType: text(row.actionType),
      entityType: text(row.entityType),
      entityId: text(row.entityId),
      dryRun: row?.dryRun === true,
      outcome: text(row.outcome || row.status),
      runAt: text(row.runAt),
      sourceRunId: text(row.sourceRunId || row.runId),
    }));
  return {
    adjustmentRows: rows.length,
    nonDryRows: nonDryRows.length,
    liveSuccessRows,
    liveFailedRows,
    budgetLiveRows: budgetLive,
    latestRunAt,
    latestRows,
    writeExecutionMode: text(writeExecution.mode),
    totalActions: num(writeExecution.summary?.totalActions, 0),
    executedStages: num(writeExecution.summary?.executedStages, 0),
    failedStages: num(writeExecution.summary?.failedStages, 0),
    noLiveWriteFromThisReport: true,
    noBudgetIncreaseFromThisReport: true,
  };
}

function buildReport({
  date,
  gate = {},
  snapshot = {},
  operatingReview = {},
  highEfficiencySchema = [],
  dryRunDecisions = {},
  adjustments = [],
  writeExecution = {},
  closureVerify = {},
  sourceFiles = {},
} = {}) {
  const productCards = Array.isArray(snapshot.productCards) ? snapshot.productCards : [];
  const operatingBySku = bySku(operatingReview.rows || []);
  const adBySku = sumBySku([
    ...(snapshot.adSkuSummaryRows || []),
    ...(snapshot.productAdRows || []),
  ]);
  const highRows = flattenHighEfficiency(highEfficiencySchema);
  const context = { productCards, operatingBySku, adBySku, highRows };
  const highProfitScaleCandidates = buildHighProfitScaleCandidates(context);
  const conversionRepairCandidates = buildConversionRepairCandidates(context);
  const refundRootCauseSuspectSkus = buildRefundRootCauseSuspects(context);
  const noWriteAudit = buildNoWriteAudit(adjustments, writeExecution);

  return {
    generatedAt: new Date().toISOString(),
    date,
    businessDate: text(gate.evaluatedBusinessDate || gate.outputDate || date),
    evidenceBoundary: {
      liveEvidence: false,
      localSnapshot: true,
      gbrainHistory: true,
      note: '候选来自本地 2026-06-08 快照、已生成 KPI gate/closure/write logs 和 GBrain 历史边界；本报告不读取实时后台、不执行广告写入。',
    },
    boundaries: {
      dryRunOnly: true,
      noLiveWrite: true,
      noBudgetIncrease: true,
      noRepeatLiveWrite: true,
    },
    kpiGate: {
      status: text(gate.status),
      target: gate.target || null,
      actual: gate.actual || null,
      gap: gate.gate?.gap || null,
      passedEfficiencyMetrics: {
        netProfitRate: num(gate.gate?.gap?.netProfitRateGap, 0) === 0,
        acos: num(gate.gate?.gap?.acosGap, 0) === 0,
        adCostShare: num(gate.gate?.gap?.adCostShareGap, 0) === 0,
      },
      remainingGaps: {
        salesGap: round(gate.gate?.gap?.salesGap, 2),
        unitsGap: round(gate.gate?.gap?.unitsGap, 0),
        refundRateGap: round(gate.gate?.gap?.refundRateGap, 4),
      },
    },
    refundRootCauseBoundary: {
      accountRefundRate: gate.actual?.refundRate ?? null,
      refundRateTarget: gate.target?.refundRateMax ?? null,
      sellerSalesRows: Array.isArray(snapshot.sellerSalesRows) ? snapshot.sellerSalesRows.length : 0,
      skuRefundRateFieldsFound: false,
      claimsSkuRefundRate: false,
      note: 'productCards/all_sku 未发现 SKU 退款率字段；退款清单只按销量贡献、标签、转化异常等代理信号列嫌疑，不能作为 SKU 退款率事实。',
    },
    noWriteAudit,
    dryRunDecisionAudit: {
      total: num(dryRunDecisions.summary?.total, 0),
      executed: num(dryRunDecisions.summary?.byDecision?.executed, 0),
      note: 'executed 表示同实体今日已有成功 live write，当前目标禁止重复执行。',
    },
    closureVerify: {
      ok: closureVerify.ok === true,
      kpiGateStatus: text(closureVerify.summary?.kpiGateStatus),
      landedActionSuccess: num(closureVerify.summary?.landedActionSuccess, 0),
      errors: Array.isArray(closureVerify.errors) ? closureVerify.errors : [],
    },
    summary: {
      highProfitScaleCandidates: highProfitScaleCandidates.length,
      conversionRepairCandidates: conversionRepairCandidates.length,
      refundRootCauseSuspectSkus: refundRootCauseSuspectSkus.length,
    },
    highProfitScaleCandidates,
    conversionRepairCandidates,
    refundRootCauseSuspectSkus,
    sourceFiles,
  };
}

function markdownTable(rows, columns) {
  if (!rows.length) return '_none_\n';
  const head = `| ${columns.map(col => col.label).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${columns.map(col => text(col.value(row)).replace(/\|/g, '/')).join(' | ')} |`);
  return [head, sep, ...body].join('\n') + '\n';
}

function toMarkdown(report) {
  const gap = report.kpiGate.remainingGaps || {};
  return [
    `# Sales Units Refund Recovery Dry Run ${report.date}`,
    '',
    '## Evidence Boundary',
    '- 证据来源：本地快照 + 已生成 closure/gate/write 日志 + GBrain 历史边界；未做实时后台读取。',
    '- 执行边界：dry-run only；不 live write；不加预算；不重复今日已落地实体。',
    '- 退款边界：SKU 清单是代理嫌疑，不是 SKU 退款率事实。',
    '',
    '## KPI Gate',
    `- status: ${report.kpiGate.status}`,
    `- remaining gaps: sales=${gap.salesGap}, units=${gap.unitsGap}, refundRate=${gap.refundRateGap}`,
    `- efficiency passed: netProfitRate=${report.kpiGate.passedEfficiencyMetrics.netProfitRate}, ACOS=${report.kpiGate.passedEfficiencyMetrics.acos}, adCostShare=${report.kpiGate.passedEfficiencyMetrics.adCostShare}`,
    '',
    '## No Write Audit',
    `- writeExecution: mode=${report.noWriteAudit.writeExecutionMode}, totalActions=${report.noWriteAudit.totalActions}, executedStages=${report.noWriteAudit.executedStages}`,
    `- adjustments snapshot: rows=${report.noWriteAudit.adjustmentRows}, nonDry=${report.noWriteAudit.nonDryRows}, liveSuccess=${report.noWriteAudit.liveSuccessRows}, liveFailed=${report.noWriteAudit.liveFailedRows}, budgetLive=${report.noWriteAudit.budgetLiveRows}, latestRunAt=${report.noWriteAudit.latestRunAt}`,
    '- this report generated no action schema and performed no live write; latestRows below are read-only audit evidence from the existing adjustment log.',
    markdownTable(report.noWriteAudit.latestRows, [
      { label: 'SKU', value: row => row.sku },
      { label: 'type', value: row => `${row.actionType}/${row.entityType}` },
      { label: 'dryRun', value: row => row.dryRun },
      { label: 'outcome', value: row => row.outcome },
      { label: 'runAt', value: row => row.runAt },
      { label: 'sourceRunId', value: row => row.sourceRunId },
    ]),
    '',
    '## High Profit Scale Candidates',
    markdownTable(report.highProfitScaleCandidates.slice(0, 20), [
      { label: 'SKU', value: row => row.sku },
      { label: 'ASIN', value: row => row.asin },
      { label: 'units7', value: row => row.units7d },
      { label: 'invDays', value: row => row.invDays },
      { label: 'net', value: row => row.netProfit },
      { label: 'ad7 orders/acos', value: row => `${row.ad7.orders}/${row.ad7.acos}` },
      { label: 'action', value: row => row.action },
    ]),
    '## Conversion Repair Candidates',
    markdownTable(report.conversionRepairCandidates.slice(0, 20), [
      { label: 'SKU', value: row => row.sku },
      { label: 'ASIN', value: row => row.asin },
      { label: 'verdict', value: row => row.verdict },
      { label: 'units7/30', value: row => `${row.units7d}/${row.units30d}` },
      { label: 'sessions/cvr', value: row => `${row.sessionsLastWeek}/${row.conversionLastWeek}` },
      { label: 'reasons', value: row => row.repairReasons.join(',') },
    ]),
    '## Refund Root Cause Suspect SKUs',
    markdownTable(report.refundRootCauseSuspectSkus.slice(0, 20), [
      { label: 'SKU', value: row => row.sku },
      { label: 'ASIN', value: row => row.asin },
      { label: 'units7/30', value: row => `${row.units7d}/${row.units30d}` },
      { label: 'type', value: row => row.productType },
      { label: 'signals', value: row => row.proxySignals.join(',') },
      { label: 'evidence', value: row => row.evidenceLevel },
    ]),
  ].join('\n');
}

function run(options = parseArgs()) {
  const sourceFiles = {
    gateFile: options.gateFile,
    snapshotFile: options.snapshotFile,
    operatingReviewFile: options.operatingReviewFile,
    highEfficiencySchemaFile: options.highEfficiencySchemaFile,
    dryRunDecisionsFile: options.dryRunDecisionsFile,
    adjustmentsFile: options.adjustmentsFile,
    writeExecutionFile: options.writeExecutionFile,
    closureVerifyFile: options.closureVerifyFile,
  };
  const report = buildReport({
    date: options.date,
    gate: readJson(options.gateFile, {}),
    snapshot: readJson(options.snapshotFile, {}),
    operatingReview: readJson(options.operatingReviewFile, {}),
    highEfficiencySchema: readJson(options.highEfficiencySchemaFile, []),
    dryRunDecisions: readJson(options.dryRunDecisionsFile, {}),
    adjustments: readJson(options.adjustmentsFile, []),
    writeExecution: readJson(options.writeExecutionFile, {}),
    closureVerify: readJson(options.closureVerifyFile, {}),
    sourceFiles,
  });
  writeJson(options.outFile, report);
  writeText(options.markdownFile, toMarkdown(report));
  return { ok: true, outFile: options.outFile, markdownFile: options.markdownFile, summary: report.summary, noWriteAudit: report.noWriteAudit };
}

function main() {
  console.log(JSON.stringify(run(parseArgs()), null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  buildReport,
  parseArgs,
  run,
};
