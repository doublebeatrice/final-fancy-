const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUTPUT_ROOT = path.join('data', 'snapshots', 'old_product_market_evidence');
const LAYER_REPORT_KEYS = {
  selection_keyword_research: 'keywordResearch',
  selection_keyword_conversion_rate: 'keywordConversion',
  selection_aba_search_terms: 'abaSearchTerms',
  selection_keyword_seasonality: 'keywordSeasonality',
  selection_product_time_machine: 'productTimeMachine',
};

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

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function walkJsonFiles(dir) {
  const root = text(dir);
  if (!root || !fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.json$/i.test(entry.name)) out.push(full);
    }
  }
  return out.sort();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function quoteArg(value) {
  return `"${String(value ?? '').replace(/"/g, '\\"')}"`;
}

function safePart(value) {
  return text(value)
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function relativeOrAbsolute(file) {
  const raw = text(file);
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : raw.replace(/\//g, path.sep);
}

function hasOutArg(command = '') {
  return /\s--out(?:\s|=)/.test(text(command));
}

function reportKeyFor(report = {}, file = '') {
  const source = text(report.source);
  if (LAYER_REPORT_KEYS[source]) return LAYER_REPORT_KEYS[source];
  const name = path.basename(file).toLowerCase();
  const layer = Object.keys(LAYER_REPORT_KEYS).find(key => name.includes(key));
  return layer ? LAYER_REPORT_KEYS[layer] : '';
}

function skuForEvidenceFile(file = '') {
  const name = path.basename(file, path.extname(file));
  const layer = Object.keys(LAYER_REPORT_KEYS).find(key => name.includes(`_${key}`));
  if (!layer) return '';
  const sku = name.slice(0, name.lastIndexOf(`_${layer}`));
  return text(sku).toUpperCase();
}

function emptySelectionReports() {
  return {
    keywordResearch: {},
    keywordConversion: {},
    abaSearchTerms: {},
    keywordSeasonality: {},
    productTimeMachine: {},
  };
}

function ensureSkuReports(bySku = {}, sku = '') {
  const key = text(sku).toUpperCase();
  if (!key) return null;
  if (!bySku[key]) {
    bySku[key] = {
      ...emptySelectionReports(),
      summary: {
        files: 0,
        acceptedFiles: 0,
        failedFiles: 0,
        byLayer: {},
        failed: [],
      },
    };
  }
  return bySku[key];
}

function appendArray(target = {}, key = '', values = []) {
  if (!Array.isArray(values) || !values.length) return;
  if (!Array.isArray(target[key])) target[key] = [];
  target[key].push(...values);
}

function mergeReport(target = {}, report = {}, key = '') {
  target.source = target.source || report.source;
  target.generatedAt = target.generatedAt || report.generatedAt || report.exportedAt || '';
  target.ok = target.ok !== false && report.ok !== false;
  appendArray(target, 'rows', report.rows);
  appendArray(target, 'candidateKeywords', report.candidateKeywords);
  appendArray(target, 'directCompetitorAsins', report.directCompetitorAsins);
  appendArray(target, 'sceneCompetitorAsins', report.sceneCompetitorAsins);
  appendArray(target, 'trafficBridgeAsins', report.trafficBridgeAsins);
  appendArray(target, 'excludedAsins', report.excludedAsins);
  appendArray(target, 'keywordHistory', report.keywordHistory);
  appendArray(target, 'apiResults', report.apiResults);
  if (report.queryRows && typeof report.queryRows === 'object') {
    target.queryRows = { ...(target.queryRows || {}), ...report.queryRows };
  }
  target.reports = [...(target.reports || []), {
    source: report.source || '',
    key,
    rowCount: Number(report.rowCount || (Array.isArray(report.rows) ? report.rows.length : 0)) || 0,
    generatedAt: report.generatedAt || report.exportedAt || '',
  }];
  return target;
}

function buildSelectionReportsFromEvidenceFiles(options = {}) {
  const evidenceDir = options.evidenceDir || path.join(ROOT, DEFAULT_OUTPUT_ROOT, dateOnly(options.businessDate || options.date || new Date()));
  const files = walkJsonFiles(evidenceDir);
  const reports = emptySelectionReports();
  const bySku = {};
  const failed = [];
  const accepted = [];
  for (const file of files) {
    const report = readJson(file, null);
    if (!report || typeof report !== 'object') continue;
    const key = reportKeyFor(report, file);
    if (!key) continue;
    const sku = skuForEvidenceFile(file);
    const skuReports = ensureSkuReports(bySku, sku);
    if (skuReports) skuReports.summary.files += 1;
    const rowCount = Number(report.rowCount || (Array.isArray(report.rows) ? report.rows.length : 0)) || 0;
    if (report.ok === false) {
      const failedItem = { file, key, source: report.source || '', rowCount, message: text(report.message) };
      failed.push(failedItem);
      if (skuReports) {
        skuReports.summary.failedFiles += 1;
        skuReports.summary.failed.push(failedItem);
      }
      continue;
    }
    mergeReport(reports[key], report, key);
    accepted.push({ file, key, source: report.source || '', rowCount });
    if (skuReports) {
      mergeReport(skuReports[key], report, key);
      skuReports.summary.acceptedFiles += 1;
      skuReports.summary.byLayer[key] = (skuReports.summary.byLayer[key] || 0) + 1;
    }
  }
  const byLayer = {};
  for (const item of accepted) byLayer[item.key] = (byLayer[item.key] || 0) + 1;
  return {
    ...reports,
    bySku,
    summary: {
      evidenceDir,
      files: files.length,
      acceptedFiles: accepted.length,
      failedFiles: failed.length,
      byLayer,
      failed,
    },
  };
}

function defaultOutputFile({ outputRoot = DEFAULT_OUTPUT_ROOT, businessDate = '', sku = '', layer = '' } = {}) {
  const root = text(outputRoot) || DEFAULT_OUTPUT_ROOT;
  const datedRoot = root.includes(dateOnly(businessDate)) ? root : path.join(root, dateOnly(businessDate));
  return path.join(datedRoot, `${safePart(sku)}_${safePart(layer)}.json`);
}

function datedEvidenceDir(outputRoot = DEFAULT_OUTPUT_ROOT, businessDate = '') {
  const root = text(outputRoot) || path.join(ROOT, DEFAULT_OUTPUT_ROOT);
  return root.includes(dateOnly(businessDate)) ? root : path.join(root, dateOnly(businessDate));
}

function commandWithOutput(command = '', output = '') {
  const raw = text(command);
  if (!raw || !output || hasOutArg(raw)) return raw;
  return `${raw} --out ${quoteArg(relativeOrAbsolute(output))}`;
}

function commandToHubCommand(command = {}, item = {}, options = {}) {
  if (text(command.evidenceBoundary) !== 'read_only_market_evidence') return null;
  if (!text(command.command).startsWith('npm run ops:selection:')) return null;
  const layer = text(command.layer);
  const output = text(command.output) || defaultOutputFile({
    outputRoot: options.outputRoot,
    businessDate: item.businessDate || options.businessDate,
    sku: item.sku,
    layer,
  });
  return {
    label: text(command.label || layer),
    layer,
    command: commandWithOutput(command.command, output),
    output,
    riskLevel: 'read_only',
    evidenceBoundary: 'read_only_market_evidence',
  };
}

function queueItemToTask(item = {}, options = {}) {
  const commands = (Array.isArray(item.commands) ? item.commands : [])
    .map(command => commandToHubCommand(command, item, options))
    .filter(Boolean);
  if (!commands.length) return null;
  return {
    taskId: text(item.requestId || item.candidateId || item.sku),
    title: `Old product market evidence ${text(item.sku).toUpperCase()}`,
    source: 'old_product_market_evidence_queue',
    priority: text(item.priority || 'P1'),
    subject: {
      sku: text(item.sku).toUpperCase(),
      asin: text(item.asin).toUpperCase(),
      candidateId: text(item.candidateId),
    },
    evidenceBoundary: 'read_only_market_evidence',
    terms: Array.isArray(item.terms) ? item.terms.map(text).filter(Boolean) : [],
    executionPlan: {
      safeToAutoRun: true,
      actionBoundary: 'read_only_market_evidence',
      commands,
      expectedOutputs: commands.map(command => command.output),
    },
  };
}

function buildMarketEvidenceRunPlan(queue = {}, options = {}) {
  const businessDate = dateOnly(options.businessDate || queue.businessDate || new Date());
  const rawItems = Array.isArray(queue.items) ? queue.items : [];
  const maxItems = Number.isFinite(Number(options.maxItems)) && Number(options.maxItems) > 0
    ? Number(options.maxItems)
    : rawItems.length;
  const items = rawItems
    .filter(item => text(item.status) === 'ready_to_fetch')
    .slice(0, maxItems);
  const todayQueue = items
    .map(item => queueItemToTask({ ...item, businessDate: item.businessDate || businessDate }, {
      ...options,
      businessDate,
    }))
    .filter(Boolean);
  const commandCount = todayQueue.reduce((sum, task) => sum + (task.executionPlan?.commands || []).length, 0);
  return {
    generatedAt: text(options.generatedAt || new Date().toISOString()),
    businessDate,
    source: 'old_product_market_evidence_queue',
    sourceQueueSummary: queue.summary || {},
    summary: {
      items: todayQueue.length,
      commands: commandCount,
      sourceItems: rawItems.length,
      skippedItems: rawItems.length - todayQueue.length,
      mode: 'read_only_market_evidence',
    },
    todayQueue,
  };
}

function renderMarketEvidenceRunPlanMarkdown(plan = {}) {
  const lines = [];
  lines.push(`# Old Product Market Evidence ${plan.businessDate || ''}`);
  lines.push('');
  lines.push(`Items: ${plan.summary?.items || 0}; commands: ${plan.summary?.commands || 0}`);
  lines.push('Boundary: read-only selection market evidence. Do not execute ads, listing, price, inventory, or clearance actions from this file.');
  lines.push('');
  for (const task of plan.todayQueue || []) {
    lines.push(`## ${task.priority || ''} ${task.subject?.sku || ''} ${task.subject?.asin || ''}`.trim());
    if (task.terms?.length) lines.push(`Terms: ${task.terms.join(', ')}`);
    for (const command of task.executionPlan?.commands || []) {
      lines.push(`- ${command.layer}: \`${command.command}\``);
      lines.push(`  Output: ${command.output}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function runOldProductMarketEvidenceQueue(options = {}) {
  const businessDate = dateOnly(options.businessDate || options.date || new Date());
  const queueFile = options.queueFile || path.join(ROOT, 'data', 'tasks', `old_product_market_evidence_queue_${businessDate}.json`);
  const queue = options.queue || readJson(queueFile, {});
  const plan = buildMarketEvidenceRunPlan(queue, {
    businessDate,
    outputRoot: options.outputRoot,
    maxItems: options.maxItems,
    generatedAt: options.generatedAt,
  });
  const hubFile = options.hubFile || path.join(ROOT, 'data', 'agent', `old_product_market_evidence_hub_${businessDate}.json`);
  const markdownFile = options.markdownFile || path.join(ROOT, 'data', 'agent', `old_product_market_evidence_hub_${businessDate}.md`);
  writeJson(hubFile, plan);
  writeText(markdownFile, renderMarketEvidenceRunPlanMarkdown(plan));
  const aggregateOutFile = text(options.aggregateOutFile);
  let aggregateFile = '';
  if (aggregateOutFile) {
    const reports = buildSelectionReportsFromEvidenceFiles({
      evidenceDir: datedEvidenceDir(options.outputRoot, businessDate),
      businessDate,
    });
    writeJson(aggregateOutFile, reports);
    aggregateFile = aggregateOutFile;
  }
  return {
    plan,
    files: {
      queueFile,
      hubFile,
      markdownFile,
      aggregateFile,
    },
  };
}

module.exports = {
  buildSelectionReportsFromEvidenceFiles,
  buildMarketEvidenceRunPlan,
  renderMarketEvidenceRunPlanMarkdown,
  runOldProductMarketEvidenceQueue,
};
