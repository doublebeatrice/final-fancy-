const fs = require('fs');
const path = require('path');

const snapshotFile = process.argv[2];
const outputFile = process.argv[3] || path.join('data', 'snapshots', 'profit_create_action_schema_2026-04-23.json');
const limit = Number(process.argv[4] || process.env.CREATE_ACTION_LIMIT || 40);

if (!snapshotFile) {
  throw new Error('Usage: node scripts/generators/generate_profit_create_schema.js <snapshot.json> [output.json] [limit]');
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cleanTerm(value) {
  return String(value || '')
    .replace(/[\[\]"+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function uniq(items) {
  return [...new Set(items.map(cleanTerm).filter(Boolean))];
}

function textFor(card) {
  const parts = [card.sku, card.asin, card.note, card.solrTerm];
  for (const seed of card.createContext?.keywordSeeds || []) parts.push(seed);
  for (const campaign of card.campaigns || []) {
    parts.push(campaign.name);
    for (const row of campaign.keywords || []) parts.push(row.text);
    for (const row of campaign.autoTargets || []) parts.push(row.text || row.targetType);
    for (const row of campaign.sponsoredBrands || []) parts.push(row.text);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function q2Themes(text) {
  const rules = [
    ['teacher_appreciation', /teacher|appreciation|thank you|school staff/],
    ['nurse_week', /nurse|medical|lab week|healthcare/],
    ['christian_inspirational', /christian|inspir|faith|bible|blessing|prayer/],
    ['graduation', /graduat|class of|senior|grad/],
    ['summer', /summer|beach|pool|swim|luau|tropical|hawaiian|sunglass|goggle/],
    ['wedding_bridal', /wedding|bridal|bridesmaid|bride|bachelorette/],
    ['mexican_fiesta', /mexican|fiesta|pinata|piñata|taco|cactus|cinco/],
    ['baby_shower', /baby shower|gender reveal|baby/],
    ['memorial', /memorial|remembrance|cardinal/],
    ['mothers_fathers_day', /mother|father|dad|mom/],
  ];
  return rules.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function buildTerms(card, themes) {
  const seeds = uniq(card.createContext?.keywordSeeds || []);
  const extras = [];
  if (themes.includes('teacher_appreciation')) extras.push('teacher appreciation gifts', 'teacher appreciation week gifts', 'thank you teacher gifts');
  if (themes.includes('nurse_week')) extras.push('nurse week gifts', 'nurse appreciation gifts', 'healthcare worker gifts');
  if (themes.includes('christian_inspirational')) extras.push('christian gifts for women', 'inspirational gifts', 'faith based gifts');
  if (themes.includes('graduation')) extras.push('graduation gifts', 'class of 2026 gifts', 'senior graduation gifts');
  if (themes.includes('summer')) extras.push('summer party supplies', 'pool party supplies', 'beach party favors');
  if (themes.includes('wedding_bridal')) extras.push('bridal shower favors', 'bridesmaid proposal gifts', 'wedding party favors');
  if (themes.includes('mexican_fiesta')) extras.push('fiesta party supplies', 'mexican party favors', 'cinco de mayo decorations');
  if (themes.includes('baby_shower')) extras.push('baby shower favors', 'baby shower decorations', 'gender reveal party supplies');
  if (themes.includes('memorial')) extras.push('memorial gifts', 'remembrance gifts', 'cardinal memorial gifts');
  if (themes.includes('mothers_fathers_day')) extras.push('mothers day gifts', 'fathers day gifts', 'dad gifts');
  return uniq([...seeds, ...extras]).slice(0, 14);
}

function existingCampaignNames(card) {
  return new Set((card.campaigns || []).map(c => String(c.name || '').toLowerCase()));
}

function createAction(card, mode, coreTerm, matchType, bid, keywords, reason, evidence) {
  const ctx = card.createContext || {};
  return {
    id: `create::${card.sku}::${mode}::${matchType || 'auto'}::${coreTerm}`,
    entityType: 'skuCandidate',
    actionType: 'create',
    createInput: {
      advType: 'SP',
      mode,
      sku: card.sku,
      asin: card.asin,
      accountId: ctx.accountId,
      siteId: ctx.siteId || 4,
      dailyBudget: Math.min(3, num(ctx.recommendedDailyBudget) || 3),
      defaultBid: bid,
      coreTerm,
      matchType,
      keywords,
    },
    reason,
    evidence,
    confidence: 0.82,
    riskLevel: 'low_budget_create',
    actionSource: ['strategy'],
  };
}

const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
const cards = snapshot.productCards || [];
const skipCreatedSkus = new Set();

for (const file of [
  'create_sp_campaign_test_verify_2026-04-23.json',
  'profit_create_execution_detail_2026-04-23.json',
  'profit_create_execution_detail_batch2_2026-04-23.json',
]) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join('data', 'snapshots', file), 'utf8'));
    for (const item of [...(data.verified || []), ...(data.create || [])]) {
      if (item.apiStatus === 'api_success' || item.finalStatus === 'created_pending_visibility' || item.finalStatus === 'success') {
        skipCreatedSkus.add(String(item.sku || ''));
      }
    }
  } catch (_) {}
}

const candidates = [];
for (const card of cards) {
  const ctx = card.createContext || {};
  if (!card.sku || !card.asin || !ctx.accountId) continue;
  if (skipCreatedSkus.has(String(card.sku))) continue;

  const profit = num(card.profitRate);
  const invDays = num(card.invDays);
  const sold30 = num(card.unitsSold_30d);
  const ad30 = card.adStats?.['30d'] || {};
  const clicks30 = num(ad30.clicks);
  const impressions30 = num(ad30.impressions);
  const adSpend30 = num(ad30.spend);
  const text = textFor(card);
  const themes = q2Themes(text);
  const terms = buildTerms(card, themes);
  const coverage = ctx.coverage || {};
  const hasFullSp = coverage.hasSpKeyword && coverage.hasSpAuto && coverage.hasSpManual;
  const lowCoverage = clicks30 < 30 || impressions30 < 3000 || adSpend30 < 10 || !hasFullSp;
  const stuckRisk = invDays >= 90 && sold30 < 30;
  const q2Relevant = themes.length > 0;
  const marginOk = profit >= 0.12;
  const inventoryOk = invDays >= 30;

  if (!marginOk || !inventoryOk) continue;
  if (!q2Relevant && !stuckRisk && !lowCoverage) continue;
  if (terms.length < 3) continue;

  const score =
    profit * 120 +
    Math.min(invDays, 240) * 0.12 +
    Math.min(sold30, 120) * 0.35 +
    (q2Relevant ? 25 : 0) +
    (stuckRisk ? 24 : 0) +
    (lowCoverage ? 18 : 0) +
    (!coverage.hasSpKeyword ? 18 : 0) +
    (!coverage.hasSpAuto ? 10 : 0) +
    (!coverage.hasSpManual ? 8 : 0);

  candidates.push({ card, themes, terms, score, lowCoverage, stuckRisk, clicks30, impressions30, adSpend30, profit, invDays, sold30 });
}

candidates.sort((a, b) => b.score - a.score);

const plans = [];
let actionCount = 0;
for (const item of candidates) {
  if (actionCount >= limit) break;
  const { card, themes, terms, lowCoverage, stuckRisk, clicks30, impressions30, adSpend30, profit, invDays, sold30 } = item;
  const names = existingCampaignNames(card);
  const summary = `KPI利润导向建广告：利润率${(profit * 100).toFixed(1)}%，库存${invDays}天，30天销量${sold30}，30天点击${clicks30}。`;
  const actions = [];
  const evidence = [
    `profit=${(profit * 100).toFixed(1)}%`,
    `invDays=${invDays}`,
    `sold30=${sold30}`,
    `clicks30=${clicks30}`,
    `impressions30=${impressions30}`,
    `spend30=${adSpend30.toFixed(2)}`,
    `themes=${themes.join(',') || 'coverage_or_stuck_stock'}`,
  ];
  const reason = `建广告无需审核：SKU有利润和库存承接，${lowCoverage ? '当前SP覆盖/点击偏少，' : ''}${stuckRisk ? '库存存在滞销风险，' : ''}需要用低预算SP结构补触达。`;

  const phraseCore = `q2 profit ${card.sku.toLowerCase()} phrase`;
  if (actionCount < limit && !names.has(`kw_${phraseCore}_${String(card.sku).toLowerCase()}`)) {
    actions.push(createAction(card, 'keywordTarget', phraseCore, 'PHRASE', 0.25, terms.slice(0, 12), reason, evidence));
    actionCount += 1;
  }

  const broadCore = `q2 profit ${card.sku.toLowerCase()} broad`;
  if (actionCount < limit && lowCoverage && !names.has(`kw_${broadCore}_${String(card.sku).toLowerCase()}`)) {
    actions.push(createAction(card, 'keywordTarget', broadCore, 'BROAD', 0.2, terms.slice(0, 10), reason, evidence));
    actionCount += 1;
  }

  const autoCore = `q2 profit ${card.sku.toLowerCase()} auto`;
  if (actionCount < limit && (!card.createContext?.coverage?.hasSpAuto || (lowCoverage && stuckRisk)) && !names.has(`auto_${autoCore}_${String(card.sku).toLowerCase()}`)) {
    actions.push(createAction(card, 'auto', autoCore, '', 0.2, [], reason, evidence));
    actionCount += 1;
  }

  if (actions.length) plans.push({ sku: card.sku, asin: card.asin, summary, actions });
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
console.log(JSON.stringify({
  outputFile,
  candidateSkus: candidates.length,
  plannedSkus: plans.length,
  plannedActions: actionCount,
  topSkus: plans.slice(0, 15).map(p => ({ sku: p.sku, actions: p.actions.length, summary: p.summary })),
}, null, 2));
