const crypto = require('crypto');
const { normalizeAgentTask } = require('./agent_control_plane');

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function slug(value, options = {}) {
  const allowed = options.preserveUnderscore ? /[^a-z0-9_]+/g : /[^a-z0-9]+/g;
  return text(value)
    .toLowerCase()
    .replace(allowed, '-')
    .replace(/^-+|-+$/g, '') || 'capability';
}

function shortHash(parts) {
  return crypto
    .createHash('sha1')
    .update(parts.map(part => text(part)).join('|'))
    .digest('hex')
    .slice(0, 8);
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function defaultAgentCapabilities() {
  return [
    {
      name: 'ad sku summary',
      sourceSystem: 'adv',
      surface: 'ad_backend',
      operationType: 'read',
      endpoint: { method: 'GET', path: '/product/adSkuSummary' },
      contract: {
        params: ['siteId', 'day', 'sku'],
        responseFields: ['spend', 'orders', 'sales', 'acos', 'clicks', 'impressions'],
        freshness: 'same_day',
      },
      verification: {
        probeCommand: 'node scripts/execute/fetch_ad_sku_summary.js 4 7 <SKU> <outFile>',
      },
    },
    {
      name: 'selection keyword conversion',
      sourceSystem: 'selection',
      surface: 'market_evidence',
      operationType: 'read',
      endpoint: { method: 'POST', path: '/soundasia_selection/sif/conversionRate/pageQuery' },
      contract: {
        params: ['keywords'],
        responseFields: ['searchVolume', 'purchaseVolume', 'clickPurchaseRate', 'cpc'],
        freshness: 'same_day',
      },
      verification: {
        probeCommand: 'npm run ops:selection:keyword-conversion -- --keywords "<term>"',
      },
    },
    {
      name: 'selection ABA search terms',
      sourceSystem: 'selection',
      surface: 'market_evidence',
      operationType: 'read',
      endpoint: { method: 'POST', path: '/soundasia_selection/searchTerm/lastDay/list' },
      contract: {
        params: ['searchTerms'],
        responseFields: ['abaRank', 'searchVolume', 'topAsins', 'demandTier', 'competitionTier'],
        freshness: 'same_day',
      },
      verification: {
        probeCommand: 'npm run ops:selection:aba-search-terms -- --search-terms "<term>"',
      },
    },
    {
      name: 'sellerinventory origin data',
      sourceSystem: 'sellerinventory',
      surface: 'listing',
      operationType: 'read',
      endpoint: { method: 'GET', path: '/kernel/productEditApply/getOriginData' },
      contract: {
        params: ['sku', 'type'],
        responseFields: ['title', 'bullet', 'description', 'searchTerms', 'applicationState'],
        freshness: 'live_backend',
      },
      verification: {
        probeCommand: 'node scripts/execute/run_listing_copy_edits.js --dry-run',
      },
    },
    {
      name: 'listing edit submit',
      sourceSystem: 'sellerinventory',
      surface: 'listing',
      operationType: 'write',
      endpoint: { method: 'POST', path: '/kernel/productEditApply/store' },
      contract: {
        params: ['sku', 'title', 'bullet', 'description', 'searchTerms'],
        responseFields: ['code', 'message', 'applicationId'],
      },
      verification: {
        dryRunCommand: 'node scripts/execute/run_listing_copy_edits.js --dry-run',
        postWriteCheck: 'GET /kernel/productEditApply/getOriginData?sku=<SKU>&type=en',
      },
      boundary: {
        reversible: true,
        highImpact: true,
      },
    },
    {
      name: 'review evidence collector',
      sourceSystem: 'agent',
      surface: 'effect_review',
      operationType: 'read',
      endpoint: { method: 'LOCAL', path: 'scripts/run_agent_review_evidence.js' },
      contract: {
        params: ['reviewQueue', 'sku', 'inventoryReport', 'profitReport'],
        responseFields: ['baseline', 'current', 'inventory', 'profit', 'riskSignals', 'warnings'],
        freshness: 'same_day',
      },
      verification: {
        probeCommand: 'npm run ops:agent:review-evidence -- --queue data\\agent\\review_queue_<date>.json --today <date>',
      },
    },
    {
      name: 'effect review runner',
      sourceSystem: 'agent',
      surface: 'effect_review',
      operationType: 'read',
      endpoint: { method: 'LOCAL', path: 'scripts/run_agent_effect_review.js' },
      contract: {
        params: ['reviewQueue', 'evidence'],
        responseFields: ['verdict', 'status', 'reasons', 'nextStep'],
        freshness: 'same_day',
      },
      verification: {
        probeCommand: 'npm run ops:agent:review-effect -- --queue data\\agent\\review_queue_<date>.json --today <date>',
      },
    },
  ];
}

function normalizeEndpoint(endpoint = {}) {
  const method = text(endpoint.method || 'GET').toUpperCase();
  const path = text(endpoint.path || endpoint.url || endpoint.endpoint);
  return {
    method,
    path,
    url: text(endpoint.url || ''),
  };
}

function normalizeAuth(auth = {}) {
  const requestedPersist = auth.persistSensitiveHeaders === true;
  return {
    source: text(auth.source || 'active_browser_session'),
    persistSensitiveHeaders: false,
    requestedPersistSensitiveHeaders: requestedPersist,
    sensitiveHeaderPolicy: 'never_store_tokens_cookies_csrf_or_inventory_tokens',
  };
}

function operationTypeFor(input = {}, endpoint = {}) {
  const explicit = text(input.operationType || input.access || input.mode).toLowerCase();
  if (['read', 'write', 'mixed'].includes(explicit)) return explicit;
  const method = text(endpoint.method).toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return 'write';
  return 'read';
}

function riskFor(input = {}, operationType) {
  if (input.riskLevel) return text(input.riskLevel);
  const boundary = input.boundary || {};
  if (operationType === 'read') return 'low';
  if (boundary.highImpact || boundary.top50Sku || boundary.protectedSurface) return 'high';
  if (boundary.lowRisk && boundary.reversible) return 'low';
  return 'medium';
}

function buildCapabilityId(input = {}, endpoint = {}, operationType) {
  if (input.capabilityId) return text(input.capabilityId);
  const source = slug(input.sourceSystem || input.system || 'unknown');
  const rawName = text(input.name || endpoint.path || shortHash([endpoint.method, endpoint.path]));
  const nameWithoutSource = rawName.toLowerCase().startsWith(`${source} `)
    ? rawName.slice(source.length).trim()
    : rawName;
  const base = [
    source,
    slug(input.surface || input.domain || 'general', { preserveUnderscore: true }),
    slug(nameWithoutSource),
    slug(operationType),
  ].join('::');
  return base;
}

function requirementsFor(input = {}, operationType, riskLevel) {
  const contract = input.contract || {};
  const verification = input.verification || {};
  const boundary = input.boundary || {};
  const requirements = [];
  const missing = [];
  const params = list(contract.params || contract.parameters);
  const responseFields = list(contract.responseFields || contract.fields);

  if (!params.length) missing.push('params');
  if (!responseFields.length) missing.push('response_fields');

  if (operationType === 'read') {
    requirements.push('active_session_probe', 'record_source_and_freshness');
    if (!verification.probeCommand) missing.push('dry_run_or_probe_command');
  } else {
    requirements.push('approved_schema', 'dry_run', 'post_write_verification', 'adjustment_log_or_application_record');
    if (!verification.dryRunCommand && !verification.probeCommand) missing.push('dry_run_or_probe_command');
    if (!verification.postWriteCheck) missing.push('post_write_verification');
    if (riskLevel === 'high' || boundary.highImpact) requirements.push('explicit_authorization_boundary');
  }

  return { requirements, missing };
}

function executionModeFor(operationType, riskLevel, missing, boundary = {}) {
  if (missing.length) return 'blocked';
  if (operationType === 'read') return 'auto_read';
  if (riskLevel === 'low' && boundary.lowRisk && boundary.reversible) return 'auto_execute_with_schema';
  return 'boundary_required';
}

function statusFor(executionMode) {
  if (executionMode === 'blocked') return 'blocked';
  if (executionMode === 'boundary_required') return 'needs_boundary';
  return 'ready';
}

function normalizeCapability(input = {}, timeContext = {}) {
  const endpoint = normalizeEndpoint(input.endpoint || input);
  const operationType = operationTypeFor(input, endpoint);
  const riskLevel = riskFor(input, operationType);
  const auth = normalizeAuth(input.auth || {});
  const boundary = input.boundary || {};
  const { requirements, missing } = requirementsFor(input, operationType, riskLevel);
  const executionMode = executionModeFor(operationType, riskLevel, missing, boundary);
  const warnings = [];
  if (auth.requestedPersistSensitiveHeaders) warnings.push('sensitive_headers_must_not_be_persisted');

  const contract = input.contract || {};
  return {
    capabilityId: buildCapabilityId(input, endpoint, operationType),
    name: text(input.name || endpoint.path || 'unnamed capability'),
    description: text(input.description || ''),
    sourceSystem: text(input.sourceSystem || input.system || 'unknown'),
    surface: text(input.surface || input.domain || 'general'),
    operationType,
    endpoint,
    auth,
    contract: {
      params: list(contract.params || contract.parameters),
      responseFields: list(contract.responseFields || contract.fields),
      errorCodes: list(contract.errorCodes),
      freshness: text(contract.freshness || ''),
      pagination: text(contract.pagination || ''),
    },
    verification: {
      probeCommand: text(input.verification?.probeCommand || ''),
      dryRunCommand: text(input.verification?.dryRunCommand || ''),
      postWriteCheck: text(input.verification?.postWriteCheck || ''),
      sampleFixture: text(input.verification?.sampleFixture || ''),
    },
    boundary: {
      lowRisk: boundary.lowRisk === true,
      reversible: boundary.reversible === true,
      highImpact: boundary.highImpact === true,
      protectedSurface: boundary.protectedSurface === true,
    },
    riskLevel,
    executionMode,
    status: statusFor(executionMode),
    requirements,
    missingRequirements: missing,
    warnings,
    registeredAt: text(input.registeredAt || timeContext.runAt || new Date().toISOString()),
    businessDate: dateOnly(input.businessDate || timeContext.businessDate || timeContext.runAt),
    sourceRunId: text(input.sourceRunId || timeContext.sourceRunId || ''),
  };
}

function capabilityToTasks(capability = {}, timeContext = {}) {
  const tasks = [];
  if ((capability.missingRequirements || []).some(item => ['params', 'response_fields', 'dry_run_or_probe_command'].includes(item))) {
    tasks.push(normalizeAgentTask({
      source: 'capability_registry',
      kind: 'capability_probe',
      title: `${capability.name} 接口探针补齐`,
      description: `补齐接口参数、返回字段、探针命令或样例：${(capability.missingRequirements || []).join(', ')}`,
      subject: { entityId: capability.capabilityId },
      priority: 'P1',
      evidence: [`endpoint: ${capability.endpoint?.method || ''} ${capability.endpoint?.path || ''}`],
      businessDate: capability.businessDate,
      sourceRunId: capability.sourceRunId,
    }, timeContext));
  }

  if ((capability.missingRequirements || []).includes('post_write_verification')) {
    tasks.push(normalizeAgentTask({
      source: 'capability_registry',
      kind: 'capability_verification',
      title: `${capability.name} 写入回查补齐`,
      description: '写入接口必须定义执行后如何回查落地，不能只看接口成功。',
      subject: { entityId: capability.capabilityId },
      priority: 'P0',
      evidence: [`operationType: ${capability.operationType}`],
      businessDate: capability.businessDate,
      sourceRunId: capability.sourceRunId,
    }, timeContext));
  }

  if (capability.executionMode === 'boundary_required') {
    tasks.push(normalizeAgentTask({
      source: 'capability_registry',
      kind: 'capability_boundary',
      title: `${capability.name} 授权边界定义`,
      description: '明确哪些场景可自动执行、哪些需要小步试、哪些必须升级。',
      subject: { entityId: capability.capabilityId },
      priority: capability.riskLevel === 'high' ? 'P0' : 'P1',
      evidence: capability.requirements || [],
      businessDate: capability.businessDate,
      sourceRunId: capability.sourceRunId,
    }, timeContext));
  }

  return tasks;
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildCapabilityRegistry(input = {}) {
  const timeContext = input.timeContext || {};
  const rawCapabilities = [
    ...(input.includeDefaults ? defaultAgentCapabilities() : []),
    ...(input.capabilities || []),
  ];
  const capabilitiesById = new Map();
  for (const item of rawCapabilities) {
    const capability = normalizeCapability(item, timeContext);
    capabilitiesById.set(capability.capabilityId, capability);
  }
  const capabilities = [...capabilitiesById.values()];
  const tasks = capabilities.flatMap(item => capabilityToTasks(item, timeContext));
  return {
    generatedAt: text(input.generatedAt || timeContext.runAt || new Date().toISOString()),
    businessDate: dateOnly(timeContext.businessDate || timeContext.runAt),
    sourceRunId: text(timeContext.sourceRunId || ''),
    summary: {
      total: capabilities.length,
      ready: capabilities.filter(item => item.status === 'ready').length,
      blocked: capabilities.filter(item => item.status === 'blocked').length,
      needsBoundary: capabilities.filter(item => item.status === 'needs_boundary').length,
      taskCount: tasks.length,
      bySourceSystem: countBy(capabilities, item => item.sourceSystem),
      byOperationType: countBy(capabilities, item => item.operationType),
      byExecutionMode: countBy(capabilities, item => item.executionMode),
      byRiskLevel: countBy(capabilities, item => item.riskLevel),
    },
    capabilities,
    tasks,
  };
}

module.exports = {
  buildCapabilityRegistry,
  capabilityToTasks,
  defaultAgentCapabilities,
  normalizeCapability,
};
