const fs = require('fs');
const path = require('path');
const { scoreTermRelevance } = require('../../src/product_profile');
const { seasonalTermStatus } = require('../generators/generate_profit_create_schema');

const snapshotFile = process.argv[2];
const outSchema = process.argv[3] || path.join('data', 'snapshots', 'created_keyword_cleanup_schema_2026-04-24.json');
const outReport = process.argv[4] || path.join('data', 'snapshots', 'created_keyword_audit_report_2026-04-24.json');
const currentDate = process.argv[5] || '2026-04-24';

if (!snapshotFile) {
  throw new Error('Usage: node scripts/execute/audit_created_campaign_keywords.js <profiled_snapshot.json> [out_schema.json] [out_report.json] [YYYY-MM-DD]');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function candidateMeta(actionType, reasonSignals = []) {
  return {
    decisionStage: 'candidate',
    candidateSource: 'rule_generator',
    candidateActionType: actionType,
    requiresAiDecision: true,
    approvedBy: null,
    candidateReason: reasonSignals.filter(Boolean).join(', '),
    actionSource: ['generator_candidate', 'rule_generator'],
  };
}

function isEnabled(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function createdCampaignName(name) {
  const text = clean(name);
  return /^kw_q2 profit /.test(text) || /^auto_q2 profit /.test(text);
}

function hasMixedAudience(term) {
  const text = clean(term);
  const groups = [
    ['teacher', /teacher|educator|school staff/],
    ['nurse', /nurse|healthcare|medical|doctor|rn\b/],
    ['mom', /mom|mother|mothers day/],
    ['dad', /dad|father|fathers day/],
    ['bride', /bride|bridal|bridesmaid/],
    ['baby', /baby|newborn|gender reveal/],
  ];
  return groups.filter(([, re]) => re.test(text)).map(([label]) => label);
}

function listingText(card = {}) {
  return clean([
    card.listing?.title,
    ...(card.listing?.bullets || []).slice(0, 5),
    card.listing?.description,
    card.listing?.categoryPath,
    ...(card.listing?.breadcrumbs || []),
    ...(card.createContext?.keywordSeeds || []),
  ].filter(Boolean).join(' '));
}

function hasListingSupport(term, card = {}) {
  const text = clean(term);
  const listing = listingText(card);
  if (!listing) return false;
  return text
    .split(/\s+/)
    .filter(token => token.length >= 4 && !['gift', 'gifts', 'bulk', 'pack', 'with', 'for'].includes(token))
    .some(token => listing.includes(token));
}

function hasSeedSupport(term, card = {}) {
  const text = clean(term);
  const seeds = (card.createContext?.keywordSeeds || []).map(clean).filter(Boolean);
  return seeds.some(seed => seed === text || seed.includes(text) || text.includes(seed));
}

const DISTINCTIVE_SUPPORT_TOKENS = new Set([
  'godmother',
  'godparent',
  'madrina',
  'godchild',
  'godchildren',
  'nurse',
  'teacher',
  'graduate',
  'bride',
  'bridesmaid',
]);

function hasDistinctiveSeedSupport(term, card = {}) {
  const termTokens = clean(term).split(/\s+/).filter(Boolean);
  const seedText = (card.createContext?.keywordSeeds || []).map(clean).join(' ');
  return termTokens.some(token => DISTINCTIVE_SUPPORT_TOKENS.has(token) && seedText.includes(token));
}

function nakedSeasonalGeneric(term) {
  const text = clean(term);
  return /^(teacher appreciation gifts|teacher appreciation week gifts|thank you teacher gifts|nurse week gifts|nurse appreciation gifts|healthcare worker gifts|graduation gifts|class of 2026 gifts|senior graduation gifts|mothers day gifts|fathers day gifts|bridal shower favors|wedding party favors|baby shower favors|memorial gifts|christian gifts for women|inspirational gifts|faith based gifts|summer party supplies|pool party supplies|beach party favors|fiesta party supplies|mexican party favors|cinco de mayo decorations)$/.test(text);
}

function diagnoseKeyword(term, card = {}) {
  const reasons = [];
  const seasonal = seasonalTermStatus(term, new Date(currentDate));
  if (!seasonal.allowed) reasons.push(`wrong_season:${seasonal.label}`);

  const mixedAudience = hasMixedAudience(term);
  if (mixedAudience.length >= 2) reasons.push(`mixed_audience:${mixedAudience.join('+')}`);

  const relevance = scoreTermRelevance(term, card.productProfile || {});
  const supportedByListing = hasListingSupport(term, card);
  const supportedBySeed = hasSeedSupport(term, card) || hasDistinctiveSeedSupport(term, card);
  if ((relevance.level === 'conflict' || (relevance.conflicts || []).length) && !supportedByListing && !supportedBySeed) {
    reasons.push(`product_conflict:${(relevance.conflicts || []).join('+') || relevance.level}`);
  }
  if (nakedSeasonalGeneric(term) && relevance.score != null && relevance.score < 0.35 && !supportedByListing && !supportedBySeed) {
    reasons.push(`unsupported_generic:${relevance.score}`);
  }

  return {
    reasons,
    relevance,
    supportedByListing,
    supportedBySeed,
  };
}

function makePauseAction(row, finding) {
  return {
    ...candidateMeta('pause', ['created_keyword_audit_cleanup', ...(finding.reasons || [])]),
    id: String(row.id),
    entityType: 'keyword',
    actionType: 'pause',
    currentBid: num(row.bid),
    suggestedBid: null,
    reason: `建组关键词自查清理：${finding.keyword} 命中 ${finding.reasons.join(', ')}，暂停具体关键词，不动同组其他相关词。`,
    evidence: [
      `sku=${finding.sku}`,
      `campaign=${finding.campaign}`,
      `keyword=${finding.keyword}`,
      `currentState=${row.state}`,
      `currentBid=${num(row.bid)}`,
      `currentDate=${currentDate}`,
      `relevance=${finding.relevance.score ?? 'unknown'}`,
      `relevanceLevel=${finding.relevance.level}`,
      `listingSupport=${finding.supportedByListing}`,
      `seedSupport=${finding.supportedBySeed}`,
    ],
    confidence: 0.92,
    riskLevel: 'created_keyword_audit_cleanup',
  };
}

function auditVisibleSnapshot(snapshot) {
  const findings = [];
  const cleanupBySku = new Map();

  for (const card of snapshot.productCards || []) {
    for (const campaign of card.campaigns || []) {
      if (!createdCampaignName(campaign.name)) continue;
      for (const keyword of campaign.keywords || []) {
        if (!keyword.id || !keyword.text) continue;
        const diagnosis = diagnoseKeyword(keyword.text, card);
        if (!diagnosis.reasons.length) continue;
        const finding = {
          source: 'visible_campaign',
          sku: card.sku,
          asin: card.asin,
          campaign: campaign.name,
          keyword: keyword.text,
          keywordId: String(keyword.id),
          state: keyword.state,
          bid: num(keyword.bid),
          enabled: isEnabled(keyword.state),
          reasons: diagnosis.reasons,
          relevance: diagnosis.relevance,
          supportedByListing: diagnosis.supportedByListing,
          supportedBySeed: diagnosis.supportedBySeed,
        };
        findings.push(finding);
        if (finding.enabled) {
          if (!cleanupBySku.has(card.sku)) {
            cleanupBySku.set(card.sku, { sku: card.sku, asin: card.asin, summary: '自查清理我新建组里的明显错词。', actions: [] });
          }
          cleanupBySku.get(card.sku).actions.push(makePauseAction(keyword, finding));
        }
      }
    }
  }

  return { findings, cleanup: [...cleanupBySku.values()].filter(plan => plan.actions.length) };
}

function auditPlannedSchemas(snapshot) {
  const cardBySku = new Map((snapshot.productCards || []).map(card => [String(card.sku || '').toUpperCase(), card]));
  const schemaFiles = [
    'holiday_high_inventory_action_schema_2026-04-24.json',
    'profitable_decline_wave2_action_schema_2026-04-24.json',
    'stagnant_opportunity_action_schema_2026-04-24.json',
    'profit_create_action_schema_2026-04-24.json',
    'profit_create_action_schema_wave2_raw_2026-04-24.json',
    'stagnant_create_raw_2026-04-24.json',
  ];
  const findings = [];
  for (const file of schemaFiles) {
    const full = path.join('data', 'snapshots', file);
    const plans = readJson(full, []);
    if (!Array.isArray(plans)) continue;
    for (const plan of plans) {
      const card = cardBySku.get(String(plan.sku || '').toUpperCase()) || { sku: plan.sku, asin: plan.asin, productProfile: {} };
      for (const action of plan.actions || []) {
        if (action.actionType !== 'create' || !action.createInput?.keywords?.length) continue;
        for (const keyword of action.createInput.keywords) {
          const diagnosis = diagnoseKeyword(keyword, card);
          if (!diagnosis.reasons.length) continue;
          findings.push({
            source: 'planned_create_schema',
            file,
            sku: plan.sku,
            asin: plan.asin,
            createId: action.id,
            mode: action.createInput.mode,
            matchType: action.createInput.matchType,
            keyword,
            reasons: diagnosis.reasons,
            relevance: diagnosis.relevance,
            supportedByListing: diagnosis.supportedByListing,
            supportedBySeed: diagnosis.supportedBySeed,
            executableNow: false,
          });
        }
      }
    }
  }
  return findings;
}

const snapshot = readJson(snapshotFile, {});
const visible = auditVisibleSnapshot(snapshot);
const plannedFindings = auditPlannedSchemas(snapshot);
const cleanupSchema = visible.cleanup;

const report = {
  snapshotFile,
  currentDate,
  generatedAt: new Date().toISOString(),
  visibleFindings: visible.findings,
  plannedFindings,
  summary: {
    visibleFindings: visible.findings.length,
    visibleEnabledCleanupActions: cleanupSchema.reduce((sum, plan) => sum + plan.actions.length, 0),
    plannedFindings: plannedFindings.length,
    visibleByReason: visible.findings.reduce((acc, item) => {
      for (const reason of item.reasons) acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {}),
    plannedByReason: plannedFindings.reduce((acc, item) => {
      for (const reason of item.reasons) acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {}),
  },
};

fs.mkdirSync(path.dirname(outSchema), { recursive: true });
fs.writeFileSync(outSchema, JSON.stringify(cleanupSchema, null, 2), 'utf8');
fs.writeFileSync(outReport, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  outSchema,
  outReport,
  ...report.summary,
  cleanupSkus: cleanupSchema.map(plan => ({ sku: plan.sku, actions: plan.actions.length })),
}, null, 2));
