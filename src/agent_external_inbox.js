const { normalizeAgentTask } = require('./agent_control_plane');

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

function addDays(ymd, days) {
  const date = new Date(`${dateOnly(ymd)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function unique(list) {
  return [...new Set((list || []).map(text).filter(Boolean))];
}

function firstMatch(raw, pattern) {
  const match = text(raw).match(pattern);
  return match ? match[1] || match[0] : '';
}

function extractAsin(raw) {
  return firstMatch(raw, /(?:\/dp\/|\/gp\/product\/|\b)(B[0-9A-Z]{9})(?:[/?\s]|$)/i).toUpperCase();
}

function extractSku(raw) {
  const value = text(raw);
  const withoutAsin = value.replace(/B[0-9A-Z]{9}/ig, ' ');
  const match = withoutAsin.match(/\b[A-Z]{2,6}\d{3,5}[A-Z0-9-]*\b/);
  return match ? match[0].toUpperCase() : '';
}

function extractKeyword(raw) {
  const value = text(raw);
  const quoted = firstMatch(value, /["“”']([^"“”']{2,80})["“”']/);
  if (quoted) return quoted;
  const cn = firstMatch(value, /(?:词|关键词)\s*([a-z0-9][a-z0-9 -]{2,80}?)(?:\s*(?:能不能|可以|要不要|加广告|投|看|转化)|\?|？|，|,|。|$)/i);
  if (cn) return cn.replace(/\s+/g, ' ').trim();
  return '';
}

function classify(raw) {
  const value = text(raw).toLowerCase();
  if (/老板|kpi|销售掉|销量掉|销售为什么|趋势|总盘/.test(value)) return 'kpi_or_sales_drop_review';
  if (/开发|新品|能不能推|没流量|曝光|产品诉求|开发诉求/.test(value)) return 'developer_product_inquiry';
  if (/标题|listing|文案|五点|search term|卖点/.test(value)) return 'listing_copy_review';
  if (/价格|提价|降价|price/.test(value)) return 'price_review';
  if (/库存|滞销|清仓|补货|断货|库容/.test(value)) return 'inventory_review';
  if (/关键词|这个词|加广告|投词|keyword/.test(value)) return 'keyword_question';
  if (/asin|amazon\.com|\/dp\/|竞品/.test(value)) return 'product_market_review';
  return 'external_general';
}

function evidenceForKind(kind) {
  const common = ['recent_action_history'];
  const byKind = {
    developer_product_inquiry: ['ad_backend_sku_summary', 'inventory_health', 'selection_keyword_research', 'selection_keyword_seasonality', 'selection_market_evidence', 'product_market_profile', 'operator_ready_reply'],
    keyword_question: ['selection_keyword_research', 'selection_keyword_seasonality', 'selection_keyword_conversion', 'selection_aba_search_terms', 'sku_ad_proof', 'listing_keyword_fit', 'inventory_health'],
    listing_copy_review: ['amazon_listing_front', 'sellerinventory_origin_data', 'season_or_event_evidence', 'listing_copy_boundary'],
    price_review: ['sellerinventory_price_baseline', 'ful_res_sellable_days', 'profit_and_inventory_check', 'price_execution_boundary'],
    inventory_review: ['inventory_health', 'sales_velocity', 'stagnant_inventory_rules', 'ad_spend_dependency'],
    product_market_review: ['amazon_listing_front', 'selection_keyword_research', 'selection_keyword_seasonality', 'selection_aba_search_terms', 'selection_keyword_conversion', 'product_market_profile'],
    kpi_or_sales_drop_review: ['sales_core_total_row', 'latest_snapshot', 'ad_cost_pressure', 'inventory_and_refund_context'],
    external_general: ['classify_request', 'identify_subject', 'choose_minimal_read_path'],
  };
  return unique([...(byKind[kind] || byKind.external_general), ...common]);
}

function authorizationHintForKind(kind) {
  if (kind === 'listing_copy_review') return ['listing_copy_boundary', 'top50_or_protected_sku_requires_boundary_release'];
  if (kind === 'price_review') return ['price_execution_boundary', 'sellerinventory_application_verification_required'];
  if (kind === 'keyword_question') return ['selection_evidence_is_read_only', 'ad_action_requires_schema_dry_run_verification'];
  if (kind === 'developer_product_inquiry') return ['agent_handles_default', 'escalate_only_high_impact_uncertain_cases'];
  return ['use_agent_authorization_boundary'];
}

function priorityForKind(kind, raw) {
  const value = text(raw).toLowerCase();
  if (/老板|kpi|紧急|马上|今天/.test(value)) return 'P0';
  if (['developer_product_inquiry', 'keyword_question', 'listing_copy_review', 'price_review', 'inventory_review', 'kpi_or_sales_drop_review'].includes(kind)) return 'P1';
  return 'P2';
}

function parseExternalRequest(input, timeContext = {}) {
  const rawInput = typeof input === 'string' ? input : text(input.text || input.message || input.rawInput);
  const kind = text(input.kind) || classify(rawInput);
  const subject = {
    sku: text(input.subject?.sku || input.sku || extractSku(rawInput)),
    asin: text(input.subject?.asin || input.asin || extractAsin(rawInput)),
    keyword: text(input.subject?.keyword || input.keyword || extractKeyword(rawInput)),
  };
  const businessDate = dateOnly(timeContext.businessDate || timeContext.runAt);
  const task = normalizeAgentTask({
    source: 'external_request',
    kind,
    title: text(input.title || rawInput).slice(0, 80),
    description: rawInput,
    rawInput,
    subject,
    requestedBy: text(input.requestedBy || input.sender || ''),
    priority: text(input.priority || priorityForKind(kind, rawInput)),
    evidenceRequirements: evidenceForKind(kind),
    authorizationHint: authorizationHintForKind(kind),
    replyExpectation: 'operator_ready_reply',
    nextCheckpoint: `${addDays(businessDate, 1)} 前复查或给出下一步处理结论`,
    businessDate,
    dataDate: timeContext.dataDate,
    sourceRunId: timeContext.sourceRunId,
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
  }, timeContext);
  return task;
}

function buildExternalInbox(items = [], timeContext = {}) {
  const normalizedItems = Array.isArray(items) ? items : [items];
  const tasks = normalizedItems
    .map(item => typeof item === 'string' ? item.trim() : item)
    .filter(item => typeof item === 'string' ? item : text(item.text || item.message || item.rawInput))
    .map(item => parseExternalRequest(item, timeContext));
  const summary = {
    total: tasks.length,
    byKind: tasks.reduce((acc, task) => {
      acc[task.kind] = (acc[task.kind] || 0) + 1;
      return acc;
    }, {}),
    byPriority: tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {}),
  };
  return {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    businessDate: dateOnly(timeContext.businessDate || timeContext.runAt),
    summary,
    tasks,
  };
}

function compareDate(a, b) {
  return dateOnly(a).localeCompare(dateOnly(b));
}

function reviewChecklist(task = {}) {
  const metrics = (task.reviewPlan?.metrics || []).join(', ');
  const checklist = [
    '拉取广告后台最新 SKU/实体表现',
    '拉取库存和销售趋势，确认是否受库存或断货影响',
    '对比执行前基线和当前窗口',
  ];
  if (metrics) checklist.push(`对比 reviewPlan 指标：${metrics}`);
  if (task.reviewOf?.actionType) checklist.push(`判断原动作 ${task.reviewOf.actionType}/${task.reviewOf.entityType || ''} 是否有效`);
  checklist.push('输出继续观察、关闭、回滚或二次动作建议');
  return checklist;
}

function reviewTaskKey(task = {}) {
  return text(task.taskId) ||
    [task.source, task.lane, task.kind, task.dueDate, task.subject?.sku, task.subject?.entityId, task.title]
      .map(text)
      .join('|');
}

function dedupeReviewTasks(tasks = []) {
  const seen = new Set();
  const out = [];
  for (const task of tasks) {
    const key = reviewTaskKey(task);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(task);
  }
  return out;
}

function buildDueReviewQueue(ledger = {}, options = {}) {
  const today = dateOnly(options.today || options.businessDate || new Date().toISOString());
  const source = Array.isArray(ledger.nextOpenTasks) ? ledger.nextOpenTasks : (ledger.tasks || []);
  const reviews = dedupeReviewTasks(source
    .filter(task => task.status === 'waiting_review')
    .filter(task => task.lane === 'effect_review' || task.source === 'effect_review' || task.kind === 'effect_review')
    .map(task => ({
      ...task,
      checklist: reviewChecklist(task),
      rollbackIf: text(task.reviewPlan?.rollbackIf || ''),
    })));
  const due = reviews.filter(task => compareDate(task.dueDate, today) <= 0);
  const upcoming = reviews.filter(task => compareDate(task.dueDate, today) > 0);
  return {
    generatedAt: text(options.generatedAt || new Date().toISOString()),
    today,
    summary: {
      totalWaitingReview: reviews.length,
      due: due.length,
      upcoming: upcoming.length,
    },
    due,
    upcoming,
  };
}

module.exports = {
  buildDueReviewQueue,
  buildExternalInbox,
  dedupeReviewTasks,
  parseExternalRequest,
};
