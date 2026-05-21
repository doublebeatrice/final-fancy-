const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readJson(file, fallback = {}) {
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
  const date = dateOnly(options.date || options.today || new Date().toISOString().slice(0, 10));
  return {
    date,
    writeExecutionFile: text(options.writeExecution || options['write-execution'] || path.join(ROOT, 'data', 'agent', `write_execution_${date}.json`)),
    actionSchemaFile: text(options.actions || options.actionSchema || options['action-schema'] || path.join(ROOT, 'data', 'snapshots', `action_schema_${date}_daily_recovery_combined.json`)),
    snapshotFile: text(options.snapshot || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json')),
    kpiCheckpointFile: text(options.checkpoint || path.join(ROOT, 'data', 'tasks', `kpi_recovery_checkpoint_${date}.json`)),
    outFile: text(options.out || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.json`)),
    markdownFile: text(options.md || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.md`)),
  };
}

function extractSchemaActions(schema = []) {
  const groups = Array.isArray(schema) ? schema : [];
  const actions = [];
  for (const group of groups) {
    for (const action of group.actions || []) {
      actions.push({
        ...action,
        sku: text(action.sku || group.sku),
        asin: text(action.asin || group.asin),
        groupSummary: text(group.summary),
      });
    }
  }
  return actions;
}

function approvalKeyParts(key = '') {
  const parts = text(key).split('::');
  return {
    sku: text(parts[0]),
    entityType: text(parts[1]),
    actionType: text(parts[2]),
    id: text(parts[3]),
  };
}

function matchesApproval(action = {}, approval = {}) {
  const p = approvalKeyParts(approval.key);
  return (
    text(action.sku) === p.sku &&
    text(action.entityType) === p.entityType &&
    text(action.actionType) === p.actionType &&
    text(action.id || action.entityId) === p.id
  );
}

function productBySku(snapshot = {}, sku = '') {
  return (snapshot.productCards || []).find(item => text(item.sku || item.SKU || item.localSku) === sku) || {};
}

function metricFromEvidence(evidence = [], name) {
  const joined = Array.isArray(evidence) ? evidence.join(' ') : text(evidence);
  const hit = joined.match(new RegExp(`${name}=(-?\\d+(?:\\.\\d+)?)`, 'i'));
  return hit ? Number(hit[1]) : null;
}

function percentFromEvidence(evidence = [], name) {
  const joined = Array.isArray(evidence) ? evidence.join(' ') : text(evidence);
  const hit = joined.match(new RegExp(`${name}=(-?\\d+(?:\\.\\d+)?)%`, 'i'));
  return hit ? Number(hit[1]) / 100 : null;
}

function firstMetricFromEvidence(evidence = [], names = []) {
  for (const name of names) {
    const value = metricFromEvidence(evidence, name);
    if (value !== null) return value;
  }
  return null;
}

function actionMetrics(action = {}, product = {}) {
  const evidence = action.evidence || [];
  return {
    current: num(action.currentBudget ?? action.currentBid ?? action.beforeValue),
    suggested: num(action.suggestedBudget ?? action.suggestedBid ?? action.afterValue),
    orders: metricFromEvidence(evidence, 'orders'),
    clicks: metricFromEvidence(evidence, 'clicks'),
    spend: metricFromEvidence(evidence, 'spend'),
    sales: metricFromEvidence(evidence, 'sales'),
    acos: percentFromEvidence(evidence, 'acos'),
    profitRate: percentFromEvidence(evidence, 'profitRate') ?? num(product.netProfit ?? product.profitRate),
    invDays: metricFromEvidence(evidence, 'invDays') ?? num(product.invDays),
    units7: firstMetricFromEvidence(evidence, ['units7d', 'units7']) ?? num(product.unitsSold_7d),
    units30: firstMetricFromEvidence(evidence, ['units30d', 'units30']) ?? num(product.unitsSold_30d),
    spend7: metricFromEvidence(evidence, 'spend7d'),
    impressions7: metricFromEvidence(evidence, 'impressions'),
    clicks7: metricFromEvidence(evidence, 'clicks'),
    orders7: metricFromEvidence(evidence, 'orders'),
  };
}

function classifyApproval(action = {}, product = {}) {
  const m = actionMetrics(action, product);
  const entityType = text(action.entityType);
  const actionType = text(action.actionType);
  const margin = m.acos !== null && m.profitRate !== null ? m.profitRate - m.acos : null;

  if (!text(action.id || action.entityId)) {
    return {
      decision: 'blocked',
      reasonCode: 'missing_action_context',
      operatorAction: 'rebuild schema or refresh snapshot before any write',
      confidence: 0.2,
      metrics: m,
    };
  }

  if (entityType === 'campaign' && actionType === 'budget') {
    if (m.invDays !== null && m.invDays < 20) {
      return {
        decision: 'hold',
        reasonCode: 'inventory_tight_before_budget_lift',
        operatorAction: 'hold budget lift until replenishment or sell-through route is confirmed',
        confidence: 0.72,
        metrics: m,
      };
    }
    if ((m.orders || 0) >= 8 && m.invDays >= 25 && margin !== null && margin >= 0.03) {
      return {
        decision: 'recommend_approve',
        reasonCode: 'controlled_profitable_budget_lift',
        operatorAction: 'approve one controlled lift, then review 1d spend/orders and 3d ACOS',
        confidence: 0.78,
        metrics: m,
      };
    }
    return {
      decision: 'approval_needed',
      reasonCode: 'profit_or_inventory_guard_tight',
      operatorAction: 'approve only with same-day sales pressure and 1d rollback check',
      confidence: 0.58,
      metrics: m,
    };
  }

  if (actionType === 'bid' && ['keyword', 'autoTarget'].includes(entityType)) {
    if (m.invDays !== null && m.invDays < 25 && (m.units7 || 0) <= 0) {
      return {
        decision: 'blocked',
        reasonCode: 'no_recent_units_and_inventory_not_deep',
        operatorAction: 'repair listing/traffic evidence first; do not raise bid blindly',
        confidence: 0.7,
        metrics: m,
      };
    }
    if ((m.units7 || 0) > 0 && m.invDays >= 45) {
      return {
        decision: 'approval_needed',
        reasonCode: 'small_new_product_bid_test',
        operatorAction: 'approve a small test only if the matching query/target is still strategically relevant',
        confidence: 0.64,
        metrics: m,
      };
    }
    return {
      decision: 'approval_needed',
      reasonCode: 'low_delivery_bid_up_needs_operator_boundary',
      operatorAction: 'confirm product route before raising bid',
      confidence: 0.55,
      metrics: m,
    };
  }

  return {
    decision: 'approval_needed',
    reasonCode: 'unclassified_surface',
    operatorAction: 'classify the surface before execution',
    confidence: 0.5,
    metrics: m,
  };
}

function buildReview({ date, writeExecution = {}, schema = [], snapshot = {}, checkpoint = {} } = {}) {
  const actions = extractSchemaActions(schema);
  const approvals = writeExecution.plan?.approvalNeeded || [];
  const reviewInputs = approvals.length
    ? approvals
    : actions.map((action, index) => ({
        key: [
          text(action.sku),
          text(action.entityType),
          text(action.actionType || action.type),
          text(action.id || action.entityId),
          index,
        ].filter(item => item !== '').join('::'),
        riskLevel: text(action.riskLevel),
        reason: text(action.reason),
        source: 'action_schema_fallback',
      }));
  const items = reviewInputs.map(approval => {
    const parts = approvalKeyParts(approval.key);
    const action = actions.find(candidate => matchesApproval(candidate, approval)) || {};
    const product = productBySku(snapshot, parts.sku);
    const classification = classifyApproval({ ...approval, ...action, sku: parts.sku, entityType: parts.entityType, actionType: parts.actionType }, product);
    return {
      key: text(approval.key),
      sku: parts.sku,
      asin: text(action.asin || product.asin),
      entityType: parts.entityType,
      actionType: parts.actionType,
      id: parts.id,
      campaignName: text(action.campaignName || action.groupName),
      current: classification.metrics.current,
      suggested: classification.metrics.suggested,
      decision: classification.decision,
      reasonCode: classification.reasonCode,
      operatorAction: classification.operatorAction,
      confidence: classification.confidence,
      sourceRiskLevel: text(action.riskLevel || approval.riskLevel),
      sourceReason: text(action.reason),
      expectedEffect: action.expectedEffect || {},
      reviewPlan: action.reviewPlan || {},
      metrics: classification.metrics,
      evidence: Array.isArray(action.evidence) ? action.evidence : [],
    };
  });
  const byDecision = {};
  const bySku = {};
  for (const item of items) {
    byDecision[item.decision] = (byDecision[item.decision] || 0) + 1;
    bySku[item.sku] = (bySku[item.sku] || 0) + 1;
  }
  return {
    date,
    generatedAt: new Date().toISOString(),
    businessDate: checkpoint.businessDate || writeExecution.businessDate || date,
    dataDate: checkpoint.dataDate || writeExecution.dataDate || '',
    sourceFiles: {},
    summary: {
      total: items.length,
      byDecision,
      skuCount: Object.keys(bySku).length,
      recommendApprove: byDecision.recommend_approve || 0,
      approvalNeeded: byDecision.approval_needed || 0,
      hold: byDecision.hold || 0,
      blocked: byDecision.blocked || 0,
    },
    items,
  };
}

function pct(value) {
  return value === null || value === undefined ? '-' : `${(Number(value) * 100).toFixed(1)}%`;
}

function fmt(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function surfaceLabel(item = {}) {
  const label = text(item.campaignName || item.id);
  const id = text(item.id);
  if (!id || label.includes(id)) return label || '-';
  return `${label} [${id}]`;
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# KPI approval review - ${report.date}`);
  lines.push('');
  lines.push(`Business date: ${report.businessDate || report.date}`);
  lines.push(`Data date: ${report.dataDate || '-'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- total ${report.summary.total}; SKUs ${report.summary.skuCount}; recommendApprove ${report.summary.recommendApprove}; approvalNeeded ${report.summary.approvalNeeded}; hold ${report.summary.hold}; blocked ${report.summary.blocked}.`);
  lines.push('- This file is an operator decision pack. It does not authorize live writes by itself.');
  lines.push('');
  for (const decision of ['recommend_approve', 'approval_needed', 'hold', 'blocked']) {
    const rows = report.items.filter(item => item.decision === decision);
    lines.push(`## ${decision}`);
    lines.push('');
    if (!rows.length) {
      lines.push('- none');
      lines.push('');
      continue;
    }
    lines.push('| SKU | Surface | Change | Core evidence | Operator action |');
    lines.push('| --- | --- | ---: | --- | --- |');
    for (const item of rows) {
      const m = item.metrics || {};
      const evidence = [
        `orders=${fmt(m.orders ?? m.orders7)}`,
        `ACOS=${pct(m.acos)}`,
        `profit=${pct(m.profitRate)}`,
        `invDays=${fmt(m.invDays)}`,
        `units7=${fmt(m.units7)}`,
      ].join('; ');
      lines.push(`| ${item.sku} | ${item.entityType}/${item.actionType}: ${surfaceLabel(item)} | ${fmt(item.current)} -> ${fmt(item.suggested)} | ${evidence}; ${item.reasonCode} | ${item.operatorAction} |`);
    }
    lines.push('');
  }
  lines.push('## Next verification');
  lines.push('');
  lines.push('- If any recommended lift is approved, verify next 1d spend/orders and 3d ACOS before repeating the same SKU/entity direction.');
  lines.push('- Keep held or blocked items out of live execution until the stated inventory, listing, or route condition changes.');
  return `${lines.join('\n')}\n`;
}

function run(options = parseArgs()) {
  const config = { ...parseArgs([]), ...options };
  const date = dateOnly(config.date);
  const writeExecution = readJson(config.writeExecutionFile, {});
  const schema = readJson(config.actionSchemaFile, []);
  const snapshot = readJson(config.snapshotFile, {});
  const checkpoint = readJson(config.kpiCheckpointFile, {});
  const report = buildReview({ date, writeExecution, schema, snapshot, checkpoint });
  report.sourceFiles = {
    writeExecution: config.writeExecutionFile,
    actionSchema: config.actionSchemaFile,
    snapshot: config.snapshotFile,
    kpiCheckpoint: config.kpiCheckpointFile,
  };
  writeJson(config.outFile, report);
  writeText(config.markdownFile, renderMarkdown(report));
  return {
    ok: true,
    outFile: config.outFile,
    markdownFile: config.markdownFile,
    summary: report.summary,
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(run(parseArgs()), null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  buildReview,
  classifyApproval,
  extractSchemaActions,
  parseArgs,
  renderMarkdown,
  run,
};
