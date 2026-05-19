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
    audit: get('--audit') || '',
    snapshot: get('--snapshot') || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    out: get('--out') || path.join(ROOT, 'data', 'snapshots', `action_schema_${new Date().toISOString().slice(0, 10)}_proactive_recovery_candidate.json`),
    expiredLimit: Number(get('--limit-expired') || 80),
    reviewLimit: Number(get('--limit-review') || 80),
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

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function findLatestAuditFile() {
  const taskDir = path.join(ROOT, 'data', 'tasks');
  if (!fs.existsSync(taskDir)) return '';
  return fs.readdirSync(taskDir)
    .filter(name => /^proactive_operating_audit_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => path.join(taskDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function productMap(snapshot = {}) {
  const map = new Map();
  for (const card of snapshot.productCards || []) {
    if (card.sku) map.set(String(card.sku).toUpperCase(), card);
  }
  return map;
}

function actionBase(reason) {
  return {
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex'],
    source: 'proactive_operating_audit',
    forceExecute: true,
    requiresAiDecision: false,
    confidence: 0.78,
    reason,
    hypothesis: reason,
    expectedEffect: {
      impressions: 'down_selective',
      clicks: 'down_selective',
      spend: 'down',
      orders: 'watch',
      acos: 'improve_or_hold',
    },
    reviewPlan: {
      checkAfterDays: [1, 3, 7],
      rollbackIf: 'same-SKU sales or efficient orders fall while waste does not improve',
    },
  };
}

function createActionBase(reason) {
  return {
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex'],
    source: 'proactive_operating_audit',
    forceExecute: true,
    requiresAiDecision: false,
    confidence: 0.78,
    reason,
    hypothesis: reason,
    expectedEffect: {
      impressions: 'up',
      clicks: 'up',
      spend: 'up_controlled',
      orders: 'watch',
      acos: 'watch',
    },
    reviewPlan: {
      checkAfterDays: [1, 3, 7],
      rollbackIf: 'spend rises without impressions/clicks/orders or listing readiness blocks conversion',
    },
  };
}

function cleanTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordSeedsFor(product = {}) {
  const profile = product.productProfile || {};
  const ctx = product.createContext || {};
  return [...new Set([
    ...(Array.isArray(ctx.keywordSeeds) ? ctx.keywordSeeds : []),
    profile.positioning,
    profile.productType,
    ...(Array.isArray(profile.productTypes) ? profile.productTypes : []),
    ...(Array.isArray(profile.targetAudience) ? profile.targetAudience : []),
    ...(Array.isArray(profile.occasion) ? profile.occasion : []),
    profile.listingTitle,
    product.listing?.title,
  ].map(cleanTerm).filter(term => term.length >= 4 && term.length <= 70))]
    .slice(0, 12);
}

const UNSAFE_NAKED_LAUNCH_KEYWORDS = new Set([
  'apparel',
  'baby',
  'baby shower',
  'decor',
  'gift',
  'gift basket',
  'gifts',
  'jewelry',
  'party supplies',
  'summer',
  'women',
]);

const GENERIC_LAUNCH_KEYWORD_TOKENS = new Set([
  'apparel',
  'baby',
  'basket',
  'decor',
  'gift',
  'gifts',
  'jewelry',
  'mom',
  'party',
  'shower',
  'supplies',
  'summer',
  'women',
]);

const SEARCH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'by',
  'for',
  'from',
  'in',
  'include',
  'includes',
  'kit',
  'of',
  'on',
  'or',
  'pack',
  'set',
  'the',
  'to',
  'with',
]);

const DISTINCTIVE_LAUNCH_TOKENS = new Set([
  'appreciation',
  'bridal',
  'bride',
  'bridesmaid',
  'christian',
  'cinco',
  'dad',
  'easter',
  'faith',
  'father',
  'fathers',
  'fiesta',
  'godmother',
  'godparent',
  'graduate',
  'graduation',
  'health',
  'inspirational',
  'lab',
  'madrina',
  'mental',
  'mexican',
  'mother',
  'mothers',
  'nurse',
  'senior',
  'teacher',
  'tech',
  'volunteer',
  'week',
  'wedding',
]);

const BUYER_INTENT_TOKENS = new Set([
  'basket',
  'bracelet',
  'card',
  'cards',
  'decor',
  'decoration',
  'decorations',
  'favor',
  'favors',
  'gift',
  'gifts',
  'keychain',
  'sign',
  'supplies',
  'tumbler',
]);

function qualifiedLaunchKeywordSeeds(seeds = []) {
  const qualified = [];
  const seen = new Set();
  for (const seed of seeds) {
    const term = cleanTerm(seed);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    if (UNSAFE_NAKED_LAUNCH_KEYWORDS.has(term)) continue;
    const tokens = term.split(' ').filter(Boolean);
    if (tokens.length < 2 || tokens.length > 5) continue;
    const meaningful = tokens.filter(token =>
      !SEARCH_STOPWORDS.has(token) &&
      !GENERIC_LAUNCH_KEYWORD_TOKENS.has(token)
    );
    const hasDistinctiveToken = tokens.some(token => DISTINCTIVE_LAUNCH_TOKENS.has(token));
    const hasBuyerIntentToken = tokens.some(token => BUYER_INTENT_TOKENS.has(token));
    if (!hasBuyerIntentToken) continue;
    if (meaningful.length < 2 && !hasDistinctiveToken) continue;
    qualified.push(term);
  }
  return qualified;
}

function createCampaignName(prefix, coreTerm, sku) {
  const term = cleanTerm(coreTerm).replace(/\s+/g, ' ').slice(0, 45);
  return `proactive ${prefix}_${term}_${String(sku || '').toLowerCase()}`.slice(0, 120);
}

function createSpAction(product = {}, mode, coreTerm, options = {}) {
  const ctx = product.createContext || {};
  const bid = round(options.defaultBid ?? ctx.recommendedDefaultBid ?? 0.3);
  const dailyBudget = round(options.dailyBudget ?? Math.min(3, num(ctx.recommendedDailyBudget) || 3));
  const campaignName = createCampaignName(mode === 'auto' ? 'auto' : 'kw', coreTerm, product.sku);
  const reason = options.reason || `New product launch coverage: create ${mode} for ${product.sku}.`;
  return {
    ...createActionBase(reason),
    entityType: 'skuCandidate',
    actionType: 'create',
    id: `create::${product.sku}::${mode}::${options.matchType || 'auto'}::${coreTerm}`,
    createInput: {
      advType: 'SP',
      mode,
      sku: product.sku,
      asin: product.asin,
      accountId: ctx.accountId,
      siteId: ctx.siteId || 4,
      dailyBudget,
      defaultBid: bid,
      coreTerm,
      matchType: options.matchType || '',
      keywords: options.keywords || [],
      campaignName,
      groupName: campaignName,
    },
    campaignName,
    groupName: campaignName,
    riskLevel: options.riskLevel || 'new_product_low_budget_create',
    evidence: options.evidence || [],
  };
}

function rowStats(row = {}, key = '7d') {
  const s = row[`stats${key}`] || {};
  return {
    spend: num(s.spend),
    orders: num(s.orders),
    clicks: num(s.clicks),
    impressions: num(s.impressions),
    sales: num(s.sales),
  };
}

function isEnabled(value) {
  const textValue = String(value ?? '').toLowerCase().trim();
  return textValue === '1' || textValue === 'enabled' || textValue === 'active';
}

function collectLaunchBidCandidates(product = {}) {
  const rows = [];
  for (const campaign of product.campaigns || []) {
    const base = {
      campaignId: String(campaign.campaignId || ''),
      adGroupId: String(campaign.adGroupId || ''),
      campaignName: campaign.name || campaign.campaignName || '',
      groupName: campaign.groupName || campaign.adGroupName || '',
      campaignState: campaign.campaignState ?? campaign.state,
      groupState: campaign.groupState,
    };
    for (const row of campaign.keywords || []) rows.push({ ...row, ...base, entityType: 'keyword' });
    for (const row of campaign.autoTargets || []) {
      rows.push({ ...row, ...base, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget' });
    }
  }
  return rows.filter(row =>
    row.id &&
    num(row.bid) > 0 &&
    !row.onCooldown &&
    isEnabled(row.state) &&
    isEnabled(row.campaignState) &&
    (row.groupState === undefined || row.groupState === '' || isEnabled(row.groupState))
  );
}

function buildNewProductLaunchActions(audit = {}, products = new Map(), limit = 40) {
  const plans = [];
  let actionCount = 0;
  for (const item of audit.newProductLaunch?.items || []) {
    if (actionCount >= limit) break;
    const sku = String(item.sku || '').toUpperCase();
    const product = products.get(sku) || {};
    const ctx = product.createContext || {};
    const coverage = ctx.coverage || {};
    const seeds = keywordSeedsFor(product);
    const actions = [];
    const evidence = [
      `issue=${item.issue}`,
      `ageDays=${item.ageDays}`,
      `invDays=${item.invDays}`,
      `units7d=${item.units7d}`,
      `spend7d=${item.spend7d}`,
      `coverage=${JSON.stringify(coverage)}`,
    ];

    if (item.issue === 'new_product_missing_basic_ad_structure' && product.sku && product.asin && ctx.accountId) {
      const autoCore = seeds[0] || `new product ${String(product.sku).toLowerCase()} auto`;
      if (!coverage.hasSpAuto && actionCount + actions.length < limit) {
        actions.push(createSpAction(product, 'auto', autoCore, {
          reason: 'New product has inventory but no SP auto coverage. Build low-budget auto now instead of waiting for natural orders.',
          evidence,
        }));
      }
      const qualifiedKeywordSeeds = qualifiedLaunchKeywordSeeds(seeds);
      if (!coverage.hasSpKeyword && qualifiedKeywordSeeds.length >= 3 && actionCount + actions.length < limit) {
        const coreTerm = qualifiedKeywordSeeds[0];
        actions.push(createSpAction(product, 'keywordTarget', coreTerm, {
          matchType: 'PHRASE',
          keywords: qualifiedKeywordSeeds.slice(0, 8),
          reason: 'New product has inventory but no SP keyword coverage. Build low-budget phrase coverage from product keyword seeds.',
          evidence: [
            ...evidence,
            `keywordSeeds=${qualifiedKeywordSeeds.slice(0, 8).join('|')}`,
            `rejectedKeywordSeeds=${seeds.filter(seed => !qualifiedKeywordSeeds.includes(cleanTerm(seed))).slice(0, 12).join('|')}`,
          ],
        }));
      } else if (!coverage.hasSpKeyword && actionCount + actions.length < limit) {
        actions.push(reviewAction(item, 'new_product_keyword_seed_review', 'New product lacks SP keyword coverage, but keyword seeds are too broad or too thin for automatic phrase creation; rebuild with buyer-facing specific search phrases only.'));
      }
      if (!coverage.hasSpManual && actionCount + actions.length < limit) {
        actions.push(reviewAction(item, 'new_product_manual_targeting', 'New product still lacks SP manual/product targeting; target ASIN set is not available in the snapshot, so build or fetch ASIN targets manually.'));
      }
    }

    if (item.issue === 'new_product_existing_structure_low_delivery' && product.sku) {
      const candidates = collectLaunchBidCandidates(product)
        .map(row => ({ row, s7: rowStats(row, '7d'), bid: num(row.bid) }))
        .filter(entry => (entry.s7.impressions < 200 || entry.s7.clicks < 5 || entry.s7.spend < 2) && !(entry.s7.spend >= 5 && entry.s7.orders === 0))
        .sort((a, b) => (b.s7.orders - a.s7.orders) || (a.s7.spend - b.s7.spend))
        .slice(0, 2);
      for (const entry of candidates) {
        if (actionCount + actions.length >= limit) break;
        const nextBid = round(Math.min(0.6, Math.max(entry.bid + 0.02, entry.bid * 1.15)));
        if (!(nextBid > entry.bid)) continue;
        const reason = `New product has basic structure but low delivery. Raise ${entry.row.entityType} bid ${entry.bid} -> ${nextBid} with controlled budget.`;
        actions.push({
          ...createActionBase(reason),
          entityType: entry.row.entityType,
          actionType: 'bid',
          id: String(entry.row.id),
          currentBid: entry.bid,
          suggestedBid: nextBid,
          text: entry.row.text || entry.row.targetType || '',
          label: entry.row.text || entry.row.targetType || '',
          campaignId: entry.row.campaignId,
          adGroupId: entry.row.adGroupId,
          campaignName: entry.row.campaignName,
          groupName: entry.row.groupName,
          riskLevel: 'new_product_low_delivery_bid_up',
          evidence: [
            ...evidence,
            `${entry.row.entityType} 7d impressions=${entry.s7.impressions} clicks=${entry.s7.clicks} spend=${entry.s7.spend} orders=${entry.s7.orders}`,
          ],
        });
      }
      if (!actions.length && actionCount < limit) {
        actions.push(reviewAction(item, 'new_product_low_delivery_repair', 'New product has structure but no safe non-cooldown delivery lever in the snapshot; inspect budget, paused rows, product ads, or rebuild terms.'));
      }
    }

    if (!actions.length) continue;
    plans.push({
      sku,
      asin: item.asin || product.asin || '',
      summary: 'Proactive new-product launch repair. Inventory-backed new products must not wait for natural orders.',
      actions,
    });
    actionCount += actions.length;
  }
  return plans;
}

function buildExpiredSeasonActions(audit = {}, products = new Map(), limit = 80) {
  const rows = (audit.expiredSeasonKeywordWaste?.items || [])
    .filter(item => item.sku && item.entityId && item.spend3 > 0)
    .sort((a, b) => (b.spend3 || 0) - (a.spend3 || 0))
    .slice(0, limit);
  const bySku = new Map();
  for (const item of rows) {
    const sku = String(item.sku || '').toUpperCase();
    const product = products.get(sku) || {};
    const entityType = item.source === 'SB' ? 'sbKeyword' : 'keyword';
    const reason = `Expired/tail season keyword waste: ${item.themeLabel || item.theme} "${item.keywordText}" spend3=${item.spend3}, orders3=${item.orders3}, ACOS3=${item.acos3 ?? 'none'}.`;
    const base = actionBase(reason);
    let action;
    if (num(item.orders3) === 0 && num(item.orders7) === 0) {
      action = {
        ...base,
        entityType,
        actionType: 'pause',
        id: String(item.entityId),
        text: item.keywordText || '',
        label: item.keywordText || '',
        campaignName: item.campaignName || '',
        groupName: item.groupName || '',
        riskLevel: 'expired_season_no_order_waste',
        evidence: [
          `theme=${item.theme}`,
          `spend3=${item.spend3}`,
          `orders3=${item.orders3}`,
          `spend7=${item.spend7}`,
          `orders7=${item.orders7}`,
        ],
      };
    } else {
      const currentBid = num(item.bid);
      const minBid = entityType === 'sbKeyword' ? 0.25 : 0.05;
      const suggestedBid = round(Math.max(minBid, currentBid * 0.8));
      if (!currentBid || suggestedBid >= currentBid) continue;
      action = {
        ...base,
        entityType,
        actionType: 'bid',
        id: String(item.entityId),
        currentBid,
        suggestedBid,
        text: item.keywordText || '',
        label: item.keywordText || '',
        campaignName: item.campaignName || '',
        groupName: item.groupName || '',
        riskLevel: 'expired_season_high_acos_trim',
        evidence: [
          `theme=${item.theme}`,
          `spend3=${item.spend3}`,
          `orders3=${item.orders3}`,
          `sales3=${item.sales3}`,
          `acos3=${item.acos3}`,
          `spend7=${item.spend7}`,
          `orders7=${item.orders7}`,
        ],
      };
    }
    if (!bySku.has(sku)) {
      bySku.set(sku, {
        sku,
        asin: product.asin || '',
        summary: 'Proactive audit expired-season cleanup. Tail/expired keywords must stop wasting spend unless recent efficient orders justify keeping them.',
        actions: [],
      });
    }
    bySku.get(sku).actions.push(action);
  }
  return [...bySku.values()];
}

function reviewAction(item, kind, reason) {
  return {
    entityType: 'skuCandidate',
    actionType: 'review',
    id: `review::${item.sku}::${kind}`,
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex'],
    source: 'proactive_operating_audit',
    requiresAiDecision: false,
    riskLevel: 'manual_repair_required',
    confidence: 0.75,
    reason,
    evidence: Object.entries(item)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .slice(0, 12)
      .map(([key, value]) => `${key}=${value}`),
  };
}

function buildReviewItems(audit = {}, products = new Map(), limit = 80) {
  const sourceItems = [
    ...(audit.newProductLaunch?.items || []).map(item => ({ item, kind: 'new_product_launch', reason: 'New or recently arrived product must not wait for natural orders; build or repair basic ad launch.' })),
    ...(audit.arrivalAdRecovery?.items || []).map(item => ({ item, kind: 'arrival_ad_recovery', reason: 'Arrived inventory has no effective ad delivery; reopen, scale, or build ads.' })),
    ...(audit.priceActions?.items || []).map(item => ({ item, kind: 'price_action', reason: 'Daily price gate: review raise/recovery for tight inventory or low-profit active sales.' })),
    ...(audit.listingRepair?.items || []).map(item => ({ item, kind: 'listing_repair', reason: 'Traffic or spend indicates listing, offer, review, price, or search-term fit repair before scaling.' })),
  ].filter(entry => entry.item?.sku).slice(0, limit);
  const bySku = new Map();
  for (const entry of sourceItems) {
    const sku = String(entry.item.sku || '').toUpperCase();
    const product = products.get(sku) || {};
    if (!bySku.has(sku)) {
      bySku.set(sku, {
        sku,
        asin: entry.item.asin || product.asin || '',
        summary: 'Proactive audit manual repair item. Unsupported surfaces must be explicit, not hidden.',
        actions: [],
      });
    }
    bySku.get(sku).actions.push(reviewAction(entry.item, entry.kind, entry.reason));
  }
  return [...bySku.values()];
}

function mergePlans(parts = []) {
  const bySku = new Map();
  for (const plan of parts.flat()) {
    if (!plan.sku) continue;
    const sku = String(plan.sku).toUpperCase();
    if (!bySku.has(sku)) bySku.set(sku, { ...plan, sku, actions: [] });
    const target = bySku.get(sku);
    if (!target.asin && plan.asin) target.asin = plan.asin;
    target.summary = [target.summary, plan.summary].filter(Boolean).join(' ');
    target.actions.push(...(plan.actions || []));
  }
  return [...bySku.values()].filter(item => item.actions.length);
}

function main() {
  const options = parseArgs(process.argv);
  const auditFile = options.audit ? path.resolve(options.audit) : findLatestAuditFile();
  if (!auditFile) throw new Error('missing proactive audit file; run scripts/run_proactive_audit.js first');
  const snapshotFile = path.resolve(options.snapshot);
  const audit = readJson(auditFile, null);
  const snapshot = readJson(snapshotFile, null);
  if (!audit) throw new Error(`cannot read audit JSON: ${auditFile}`);
  if (!snapshot) throw new Error(`cannot read snapshot JSON: ${snapshotFile}`);
  const products = productMap(snapshot);
  const plan = mergePlans([
    buildExpiredSeasonActions(audit, products, options.expiredLimit),
    buildNewProductLaunchActions(audit, products, Math.min(options.reviewLimit, 40)),
    buildReviewItems(audit, products, options.reviewLimit),
  ]);
  writeJson(options.out, plan);
  console.log(JSON.stringify({
    auditFile,
    snapshotFile,
    out: options.out,
    skus: plan.length,
    actions: plan.reduce((sum, item) => sum + item.actions.length, 0),
    executableActions: plan.reduce((sum, item) => sum + item.actions.filter(action => action.actionType !== 'review').length, 0),
    reviewActions: plan.reduce((sum, item) => sum + item.actions.filter(action => action.actionType === 'review').length, 0),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildExpiredSeasonActions,
  buildNewProductLaunchActions,
  buildReviewItems,
  qualifiedLaunchKeywordSeeds,
  mergePlans,
};
