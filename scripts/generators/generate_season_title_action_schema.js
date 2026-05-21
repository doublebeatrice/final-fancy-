const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    report: get('--report') || '',
    snapshot: get('--snapshot') || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    out: get('--out') || '',
    limit: Number(get('--limit') || 120),
  };
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function latestSeasonTitleReport() {
  const taskDir = path.join(ROOT, 'data', 'tasks');
  if (!fs.existsSync(taskDir)) return '';
  return fs.readdirSync(taskDir)
    .filter(name => /^season_title_dry_run_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => path.join(taskDir, name))
    .filter(file => fs.existsSync(file) && fs.statSync(file).size > 3)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function productMap(snapshot = {}) {
  return new Map((snapshot.productCards || []).map(card => [String(card.sku || '').trim().toUpperCase(), card]));
}

function actionModeFor(adAction = {}) {
  if (adAction.mode === 'auto') return 'auto';
  return 'keywordTarget';
}

function displaySeasonTerm(item = {}, adAction = {}) {
  const coreTerm = String(item.selectedEvent?.coreTerm || adAction.coreTerm || '').trim();
  const eventName = String(item.selectedEvent?.name || '').trim();
  if (/^summer product season$/i.test(eventName) && coreTerm) return coreTerm;
  return eventName || coreTerm;
}

function cleanKeywordList(keywords = []) {
  const seen = new Set();
  const out = [];
  for (const raw of keywords || []) {
    const term = String(raw || '').replace(/\s+/g, ' ').trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    if (/\bunknown\b/i.test(term)) continue;
    if (/\bfor\s*$/i.test(term)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

function seasonAdName(mode, coreTerm, sku, matchType = '') {
  const term = String(coreTerm || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, ' ')
    .toLowerCase()
    .replace(/[\\'"`]+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'target';
  const skuPart = String(sku || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'sku';
  const prefix = mode === 'auto' ? 'auto' : `kw ${String(matchType || 'phrase').toLowerCase()}`;
  return `ai_${prefix}_${term}_${skuPart}`.slice(0, 90);
}

function createActionFromSeasonAd(item = {}, adAction = {}, product = {}) {
  const mode = actionModeFor(adAction);
  const coreTerm = item.selectedEvent?.coreTerm || adAction.coreTerm || '';
  const campaignName = adAction.campaignName || seasonAdName(mode, coreTerm, item.sku, adAction.matchType);
  const seasonTerm = displaySeasonTerm(item, adAction);
  const reason = `Season title dry-run create candidate: ${seasonTerm} for ${item.sku}.`;
  return {
    entityType: 'skuCandidate',
    actionType: 'create',
    id: `season_title::${item.sku}::${mode}::${coreTerm}`,
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex'],
    source: 'season_title_dry_run',
    forceExecute: true,
    requiresAiDecision: false,
    confidence: 0.76,
    reason,
    hypothesis: reason,
    expectedEffect: {
      impressions: 'up',
      clicks: 'up_controlled',
      spend: 'up_controlled',
      orders: 'watch',
      acos: 'watch',
    },
    reviewPlan: {
      checkAfterDays: [1, 3, 7],
      rollbackIf: 'spend rises without impressions, clicks, or orders after the seasonal test window',
    },
    campaignName,
    groupName: adAction.groupName || campaignName,
    riskLevel: 'season_title_low_budget_create',
    evidence: [
      `season=${seasonTerm}`,
      `seasonStatus=${item.selectedStatus || ''}`,
      `titleDecision=${item.titleDecision || ''}`,
      `adDecision=${item.adDecision || ''}`,
    ],
    createInput: {
      advType: 'SP',
      mode,
      sku: item.sku || product.sku,
      asin: item.asin || product.asin || '',
      accountId: product.createContext?.accountId,
      siteId: product.createContext?.siteId || 4,
      dailyBudget: adAction.dailyBudget,
      defaultBid: adAction.defaultBid,
      coreTerm,
      matchType: mode === 'keywordTarget' ? (adAction.matchType || 'BROAD') : '',
      keywords: mode === 'keywordTarget' ? cleanKeywordList(adAction.keywords || []) : [],
      campaignName,
      groupName: adAction.groupName || campaignName,
    },
  };
}

function buildSeasonTitleActionSchema(input = {}) {
  const report = input.report || {};
  const products = productMap(input.snapshot || {});
  const limit = Number(input.limit || 120);
  const plans = [];
  let actionCount = 0;
  for (const item of report.items || []) {
    if (actionCount >= limit) break;
    if (item.adDecision !== 'auto_execute' || item.highSales) continue;
    const product = products.get(String(item.sku || '').trim().toUpperCase()) || {};
    const actions = [];
    for (const adAction of item.adActions || []) {
      if (actionCount + actions.length >= limit) break;
      actions.push(createActionFromSeasonAd(item, adAction, product));
    }
    if (!actions.length) continue;
    plans.push({
      sku: item.sku,
      asin: item.asin || product.asin || '',
      summary: `Seasonal ad create candidates from season title dry-run for ${displaySeasonTerm(item, actions[0] || {}) || 'seasonal event'}.`,
      actions,
    });
    actionCount += actions.length;
  }
  return plans;
}

function main() {
  const options = parseArgs(process.argv);
  const reportFile = options.report ? path.resolve(options.report) : latestSeasonTitleReport();
  if (!reportFile) throw new Error('missing season title dry-run report; run npm run ops:season-title:dry first');
  const snapshotFile = path.resolve(options.snapshot);
  const report = readJson(reportFile, null);
  const snapshot = readJson(snapshotFile, null);
  if (!report) throw new Error(`cannot read report: ${reportFile}`);
  if (!snapshot) throw new Error(`cannot read snapshot: ${snapshotFile}`);
  const plan = buildSeasonTitleActionSchema({ report, snapshot, limit: options.limit });
  const date = report.businessDate || path.basename(reportFile).match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
  const out = options.out || path.join(ROOT, 'data', 'snapshots', `action_schema_${date}_season_title_ads.json`);
  writeJson(out, plan);
  console.log(JSON.stringify({
    reportFile,
    snapshotFile,
    out,
    skus: plan.length,
    actions: plan.reduce((sum, item) => sum + item.actions.length, 0),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSeasonTitleActionSchema,
  createActionFromSeasonAd,
};
