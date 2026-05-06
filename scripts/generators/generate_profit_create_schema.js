const fs = require('fs');
const path = require('path');
const { scoreTermRelevance } = require('../../src/product_profile');
const {
  assessAdOperatingContext,
  currentAdReadinessEvidence,
  assessInventoryResponsibility,
  formatInventoryJudgement,
  formatCurrentAdReadiness,
  formatSalesHistoryJudgement,
  inventoryEvidence,
  listingSeasonEvidence,
  salesHistoryEvidence,
} = require('../../src/inventory_economics');

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
  return [...new Set((items || []).map(cleanTerm).filter(Boolean))];
}

function candidateMeta(actionType, reasonSignals = []) {
  return {
    decisionStage: 'candidate',
    candidateSource: 'rule_generator',
    candidateActionType: actionType,
    requiresAiDecision: true,
    approvedBy: null,
    candidateReason: reasonSignals.join(', '),
    actionSource: ['generator_candidate', 'rule_generator'],
  };
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function imageNameTokens(url = '') {
  const text = String(url || '').toLowerCase();
  return text
    .replace(/^https?:\/\//, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token && token.length >= 3);
}

function listingVisualSignals(card = {}) {
  const listing = card.listing || {};
  const profile = card.productProfile || {};
  const imageUrls = uniq(Array.isArray(listing.imageUrls) ? listing.imageUrls : []);
  const mainImageUrl = normalizeText(listing.mainImageUrl || profile.mainImageUrl || imageUrls[0] || '');
  const tokens = uniq([mainImageUrl, ...imageUrls].flatMap(imageNameTokens));
  const profileImageCount = num(profile.imageCount);
  return {
    hasImages: imageUrls.length > 0 || !!mainImageUrl || profile.hasImages === true,
    imageCount: imageUrls.length || profileImageCount || (mainImageUrl ? 1 : 0),
    mainImageUrl,
    imageUrls,
    urlTokens: uniq([...tokens, ...(Array.isArray(profile.visualTheme) ? profile.visualTheme : [])]),
    visualReady: (imageUrls.length > 0 || !!mainImageUrl || profile.hasImages === true) && listing.isAvailable !== false,
  };
}

function textFor(card) {
  const profile = card.productProfile || {};
  const parts = [
    card.sku,
    card.asin,
    card.note,
    card.solrTerm,
    profile.productType,
    profile.positioning,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.seasonality || []),
  ];
  for (const seed of card.createContext?.keywordSeeds || []) parts.push(seed);
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function seedTextFor(card = {}) {
  return uniq(card.createContext?.keywordSeeds || []).join(' ');
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

function parseCurrentDate(value) {
  const date = value ? new Date(value) : new Date(process.env.AD_OPS_CURRENT_DATE || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function monthDayKey(date) {
  return (date.getMonth() + 1) * 100 + date.getDate();
}

function isInAnyWindow(date, windows) {
  const key = monthDayKey(date);
  return windows.some(([start, end]) => (
    start <= end
      ? key >= start && key <= end
      : key >= start || key <= end
  ));
}

function seasonalTermStatus(term, currentDate = parseCurrentDate()) {
  const text = cleanTerm(term);
  const rules = [
    {
      label: 'valentines_day',
      re: /valentine|galentine/,
      windows: [[101, 220]],
    },
    {
      label: 'christmas',
      re: /christmas|xmas|secret santa|stocking stuffer|merry christmas/,
      windows: [[901, 1231]],
    },
    {
      label: 'halloween',
      re: /halloween|trick or treat/,
      windows: [[801, 1031]],
    },
    {
      label: 'thanksgiving',
      re: /thanksgiving|friendsgiving/,
      windows: [[901, 1130]],
    },
    {
      label: 'back_to_school',
      re: /back to school|first day of school|welcome back teacher/,
      windows: [[701, 915]],
    },
  ];
  for (const rule of rules) {
    if (rule.re.test(text) && !isInAnyWindow(currentDate, rule.windows)) {
      return { allowed: false, label: rule.label };
    }
  }
  return { allowed: true, label: null };
}

function resolveThemes(card = {}) {
  const visual = listingVisualSignals(card);
  const profile = card.productProfile || {};
  const internalThemes = q2Themes(textFor(card));
  const seedThemes = q2Themes(seedTextFor(card));
  const imageUrlThemes = q2Themes(visual.urlTokens.join(' '));
  const listingTextThemes = q2Themes([
    profile.positioning,
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    card.listing?.title,
    ...(card.listing?.bulletHighlights || []),
    ...(card.listing?.bullets || []).slice(0, 3),
    card.listing?.description,
    card.listing?.aPlusText,
  ].filter(Boolean).join(' '));
  return {
    visual,
    primaryThemes: uniq([...seedThemes, ...internalThemes, ...imageUrlThemes]),
    secondaryThemes: uniq(listingTextThemes),
    seedThemes,
    profileConfidence: num(profile.confidence),
    profileSource: profile.source || '',
  };
}

function buildTerms(card, themeInfo, options = {}) {
  const profile = card.productProfile || {};
  const currentDate = parseCurrentDate(options.currentDate);
  const seedTerms = uniq(card.createContext?.keywordSeeds || []);
  const seeds = seedTerms.filter(term => isTermSafeForProduct(term, profile, currentDate, card));
  const productAnchors = productAnchorTerms(card).filter(term => isTermSafeForProduct(term, profile, currentDate, card));
  const extras = [];
  const themes = themeInfo.primaryThemes;
  for (const anchor of productAnchors.filter(canExtendAnchorWithOccasion).slice(0, 4)) {
    if (themes.includes('teacher_appreciation')) extras.push(`${anchor} teacher appreciation`, `${anchor} thank you gift`);
    if (themes.includes('nurse_week')) extras.push(`${anchor} nurse appreciation`, `${anchor} healthcare worker gift`);
    if (themes.includes('christian_inspirational')) extras.push(`${anchor} inspirational gift`, `${anchor} christian gift`);
    if (themes.includes('graduation')) extras.push(`${anchor} graduation gift`, `${anchor} class of 2026`);
    if (themes.includes('summer')) extras.push(`${anchor} summer`, `${anchor} beach party`);
    if (themes.includes('wedding_bridal')) extras.push(`${anchor} bridal shower`, `${anchor} wedding favor`);
    if (themes.includes('mexican_fiesta')) extras.push(`${anchor} fiesta`, `${anchor} cinco de mayo`);
    if (themes.includes('baby_shower')) extras.push(`${anchor} baby shower`, `${anchor} gender reveal`);
    if (themes.includes('memorial')) extras.push(`${anchor} memorial`, `${anchor} remembrance`);
    if (themes.includes('mothers_fathers_day')) extras.push(`${anchor} mothers day`, `${anchor} fathers day`);
  }
  return uniq([...seeds, ...productAnchors, ...extras])
    .filter(term => isTermSafeForProduct(term, profile, currentDate, card))
    .slice(0, 14);
}

function canExtendAnchorWithOccasion(anchor) {
  return !/gift|appreciation|thank you|week|day|class of|graduation|summer|bridal|wedding|fiesta|cinco|memorial|remembrance/i.test(anchor);
}

function listingAnchorTerms(card = {}) {
  const text = cleanTerm([
    card.listing?.title,
    ...(card.listing?.bullets || []).slice(0, 3),
    card.listing?.description,
    card.listing?.categoryPath,
    ...(card.listing?.breadcrumbs || []),
  ].filter(Boolean).join(' '));
  const terms = [];
  if (/teacher/.test(text) && /keychain|keychains|keyring/.test(text)) terms.push('teacher keychains');
  if (/compass/.test(text) && /teacher/.test(text) && /keychain|keychains|keyring/.test(text)) terms.push('compass teacher keychain');
  if (/nurse/.test(text) && /keychain|keychains|keyring/.test(text)) terms.push('nurse keychains');
  if (/teacher/.test(text) && /appreciation/.test(text)) terms.push('teacher appreciation gifts');
  if (/nurse/.test(text) && /appreciation|week/.test(text)) terms.push('nurse appreciation gifts');
  return terms;
}

function nakedSeasonalGeneric(term) {
  const text = cleanTerm(term);
  return /^(teacher appreciation gifts|teacher appreciation week gifts|thank you teacher gifts|nurse week gifts|nurse appreciation gifts|healthcare worker gifts|graduation gifts|class of 2026 gifts|senior graduation gifts|mothers day gifts|fathers day gifts|dad gifts|mom gifts|bridal shower favors|wedding party favors|baby shower favors|memorial gifts|christian gifts for women|inspirational gifts|faith based gifts|summer party supplies|pool party supplies|beach party favors|fiesta party supplies|mexican party favors|cinco de mayo decorations)$/.test(text);
}

function normalizedSeedSet(card = {}) {
  return new Set(uniq(card.createContext?.keywordSeeds || []));
}

function hasExactSeedSupport(term, card = {}) {
  return normalizedSeedSet(card).has(cleanTerm(term));
}

function hasSpecificSeedSupport(term, card = {}) {
  const text = cleanTerm(term);
  if (hasExactSeedSupport(text, card)) return true;
  if (nakedSeasonalGeneric(text)) return false;
  return [...normalizedSeedSet(card)].some(seed => seed === text || text.includes(seed));
}

function hasMixedAudience(term) {
  const text = cleanTerm(term);
  const groups = [
    ['teacher', /teacher|educator|school staff/],
    ['nurse', /nurse|healthcare|medical|doctor|rn\b/],
    ['mom', /mom|mother|mothers day/],
    ['dad', /dad|father|fathers day/],
    ['bride', /bride|bridal|bridesmaid/],
    ['baby', /baby|newborn|gender reveal/],
  ];
  return groups.filter(([, re]) => re.test(text)).length >= 2;
}

function productAnchorTerms(card = {}) {
  const profile = card.productProfile || {};
  const seedTerms = card.createContext?.keywordSeeds || [];
  const seedBackedProfile =
    !seedTerms.length ||
    num(profile.confidence) >= 0.75 ||
    profile.hasImages === true ||
    !!profile.listingTitle;
  const profilePositioning = !seedBackedProfile || hasMixedAudience(profile.positioning) ? '' : profile.positioning;
  const raw = [
    ...seedTerms,
    ...listingAnchorTerms(card),
    profilePositioning,
    seedBackedProfile && profile.productType !== 'gift basket' ? profile.productType : '',
    ...(seedBackedProfile ? (profile.productTypes || []) : []),
  ];
  return uniq(raw)
    .filter(term => term && term !== 'unknown')
    .filter(term => !hasMixedAudience(term))
    .filter(term => !/^(q[1-4]|gift|gifts|party|favor|favors|supplies|decorations|women|men)$/i.test(term))
    .slice(0, 10);
}

function isTermSafeForProduct(term, profile = {}, currentDate = parseCurrentDate(), card = null) {
  const text = cleanTerm(term);
  if (!text) return false;
  if (!seasonalTermStatus(text, currentDate).allowed) return false;
  if (hasMixedAudience(text)) return false;
  const listingText = card ? cleanTerm([
    card.listing?.title,
    ...(card.listing?.bullets || []).slice(0, 5),
    card.listing?.description,
    card.listing?.categoryPath,
    ...(card.listing?.breadcrumbs || []),
  ].filter(Boolean).join(' ')) : '';
  const supportedByListing = !!listingText && text
    .split(/\s+/)
    .filter(token => token.length >= 4 && !['gift', 'gifts', 'bulk', 'pack', 'with', 'for'].includes(token))
    .some(token => listingText.includes(token));
  const supportedBySeed = card ? hasSpecificSeedSupport(text, card) : false;
  if (nakedSeasonalGeneric(text) && !supportedByListing && !hasExactSeedSupport(text, card || {})) return false;
  const relevance = scoreTermRelevance(text, profile);
  if (relevance.level === 'conflict' && !supportedByListing && !supportedBySeed) return false;
  if ((relevance.conflicts || []).length && !supportedByListing && !supportedBySeed) {
    return false;
  }
  if (supportedBySeed && relevance.score != null && relevance.score < 0.35) return true;
  if (relevance.score == null) return true;
  return relevance.score >= 0.35 || (relevance.matched || []).length >= 2;
}

function existingCampaignNames(card) {
  return new Set((card.campaigns || []).map(c => String(c.name || '').toLowerCase()));
}

function roundBid(value) {
  return Number(Math.max(0.05, value).toFixed(2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function historicalCpc(card = {}) {
  const stats = [card.adStats?.['7d'], card.adStats?.['30d']].filter(Boolean);
  const candidates = stats
    .map(row => {
      const spend = num(row.spend);
      const clicks = num(row.clicks);
      return clicks > 0 ? spend / clicks : 0;
    })
    .filter(value => value > 0);
  return candidates.length ? Math.max(...candidates) : 0;
}

function priceBidAnchor(card = {}) {
  const price = num(card.price);
  if (price >= 50) return 0.65;
  if (price >= 35) return 0.5;
  if (price >= 25) return 0.38;
  if (price >= 15) return 0.3;
  if (price >= 8) return 0.24;
  return 0.2;
}

function themeBidFloor(themeInfo = {}) {
  const themes = new Set([...(themeInfo.primaryThemes || []), ...(themeInfo.secondaryThemes || [])]);
  if (themes.has('wedding_bridal')) return 0.45;
  if (themes.has('teacher_appreciation') || themes.has('nurse_week')) return 0.38;
  if (themes.has('graduation') || themes.has('mothers_fathers_day')) return 0.36;
  if (themes.has('christian_inspirational') || themes.has('memorial')) return 0.34;
  return 0.25;
}

function estimateInitialBid(card, themeInfo, mode, stagnantOpportunity = false) {
  const ctx = card.createContext || {};
  const recommended = num(ctx.recommendedDefaultBid);
  const cpc = historicalCpc(card);
  const base = Math.max(
    recommended || 0,
    cpc ? cpc * 1.15 : 0,
    priceBidAnchor(card),
    themeBidFloor(themeInfo)
  );
  const multiplier = mode === 'PHRASE' ? 1 : (mode === 'BROAD' ? 0.9 : 0.85);
  const min = stagnantOpportunity ? 0.28 : 0.25;
  const max = stagnantOpportunity ? 0.75 : 0.95;
  return roundBid(clamp(base * multiplier, min, max));
}

function createAction(card, mode, coreTerm, matchType, bid, keywords, reason, evidence, options = {}) {
  const ctx = card.createContext || {};
  return {
    ...candidateMeta('create', ['profit_create_candidate', mode, matchType || 'auto'].filter(Boolean)),
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
      dailyBudget: options.dailyBudget || Math.min(3, num(ctx.recommendedDailyBudget) || 3),
      defaultBid: bid,
      coreTerm,
      matchType,
      keywords,
    },
    reason,
    evidence,
    confidence: options.confidence || 0.82,
    riskLevel: options.riskLevel || 'low_budget_create',
    inventoryJudgement: options.inventoryJudgement || '',
    listingSeasonJudgement: options.listingSeasonJudgement || '',
    salesHistoryJudgement: options.salesHistoryJudgement || '',
    currentAdReadinessJudgement: options.currentAdReadinessJudgement || '',
  };
}

function makeReviewAction(card, reason, evidence, riskLevel = 'manual_review') {
  return {
    ...candidateMeta('review', ['profit_create_review', riskLevel]),
    id: `review::${card.sku}::listing_image_gate`,
    entityType: 'skuCandidate',
    actionType: 'review',
    reason,
    evidence,
    confidence: 0.72,
    riskLevel,
    inventoryJudgement: card.inventoryJudgement || '',
    listingSeasonJudgement: card.listingSeasonJudgement || '',
    salesHistoryJudgement: card.salesHistoryJudgement || '',
    currentAdReadinessJudgement: card.currentAdReadinessJudgement || '',
  };
}

function loadSkipCreatedSkus() {
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
  return skipCreatedSkus;
}

function generatePlans(snapshot = {}, options = {}) {
  const limit = Number(options.limit || process.env.CREATE_ACTION_LIMIT || 40);
  const currentDate = parseCurrentDate(options.currentDate);
  const cards = snapshot.productCards || [];
  const imageReviewBudget = options.imageReviewBudget != null
    ? Number(options.imageReviewBudget)
    : Math.max(0, Math.floor(cards.length * 0.01));
  const skipCreatedSkus = options.skipCreatedSkus || loadSkipCreatedSkus();
  const candidates = [];
  let imageReviewUsed = 0;

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
    const themeInfo = resolveThemes(card);
    const terms = buildTerms(card, themeInfo, { currentDate });
    const coverage = ctx.coverage || {};
    const hasFullSp = coverage.hasSpKeyword && coverage.hasSpAuto && coverage.hasSpManual;
    const lowCoverage = clicks30 < 30 || impressions30 < 3000 || adSpend30 < 10 || !hasFullSp;
    const stuckRisk = invDays >= 90 && sold30 < 30;
    const q2Relevant = themeInfo.primaryThemes.length > 0 || (themeInfo.secondaryThemes.length > 0 && themeInfo.visual.visualReady);
    const seasonalPushNeedsImageReview =
      !themeInfo.visual.visualReady &&
      themeInfo.primaryThemes.length === 0 &&
      themeInfo.secondaryThemes.length > 0;
    const operating = assessAdOperatingContext(card, { currentDate });
    const inventory = operating.inventory;
    card.inventoryJudgement = operating.judgement;
    card.listingSeasonJudgement = operating.judgement;
    card.salesHistoryJudgement = formatSalesHistoryJudgement(operating.history);
    card.currentAdReadinessJudgement = formatCurrentAdReadiness(operating.readiness);
    const inventoryOk = invDays >= 30 && !inventory.restrictScaleUp;
    const marginOk = profit >= 0.12;
    const stagnantOpportunity = profit < 0.12 && invDays >= 60 && (q2Relevant || stuckRisk || inventory.highInventoryPressure);

    if (['do_not_push', 'listing_update_required'].includes(operating.listing.pushLevel) ||
        ['do_not_push', 'hold_wait_season', 'clearance_or_rework'].includes(operating.history.pushLevel) ||
        operating.readiness.disallowNewAds) {
      candidates.push({
        card,
        themeInfo,
        terms: [],
        score: inventory.highInventoryPressure ? 60 : 20,
        lowCoverage: false,
        stuckRisk,
        clicks30,
        impressions30,
        adSpend30,
        profit,
        invDays,
        sold30,
        stagnantOpportunity: false,
        reviewOnly: true,
        listingBlocked: true,
        readinessBlocked: operating.readiness.disallowNewAds,
      });
      continue;
    }
    if (!inventoryOk || (!marginOk && !stagnantOpportunity)) continue;
    if (seasonalPushNeedsImageReview && imageReviewUsed < imageReviewBudget) {
      imageReviewUsed += 1;
      candidates.push({
        card,
        themeInfo,
        terms: [],
        score: profit * 120 + Math.min(invDays, 240) * 0.12 + 30 + (stagnantOpportunity ? 12 : 0),
        lowCoverage: false,
        stuckRisk: false,
        clicks30,
        impressions30,
        adSpend30,
        profit,
        invDays,
        sold30,
        stagnantOpportunity,
        reviewOnly: true,
      });
      continue;
    }
    if (!q2Relevant && !stuckRisk && !lowCoverage) continue;
    if (terms.length < 3) continue;

    const score =
      profit * 120 +
      Math.min(invDays, 240) * 0.12 +
      Math.min(sold30, 120) * 0.35 +
      (q2Relevant ? 25 : 0) +
      (stuckRisk ? 24 : 0) +
      (lowCoverage ? 18 : 0) +
      (themeInfo.visual.visualReady ? 8 : 0) +
      (!coverage.hasSpKeyword ? 18 : 0) +
      (!coverage.hasSpAuto ? 10 : 0) +
      (!coverage.hasSpManual ? 8 : 0) +
      (stagnantOpportunity ? 28 : 0);

    candidates.push({ card, themeInfo, terms, score, lowCoverage, stuckRisk, clicks30, impressions30, adSpend30, profit, invDays, sold30, stagnantOpportunity });
  }

  candidates.sort((a, b) => b.score - a.score);

  const plans = [];
  let actionCount = 0;
  for (const item of candidates) {
    if (actionCount >= limit) break;
    const { card, themeInfo, terms, lowCoverage, stuckRisk, clicks30, impressions30, adSpend30, profit, invDays, sold30, stagnantOpportunity, reviewOnly, listingBlocked } = item;
    const names = existingCampaignNames(card);
    const summary = `利润导向建广告：利润率 ${(profit * 100).toFixed(1)}%，库存 ${invDays} 天，30 天销量 ${sold30}，listing 图片 ${themeInfo.visual.hasImages ? `已抓取(${themeInfo.visual.imageCount})` : '缺失'}。`;
    const evidence = [
      `profit=${(profit * 100).toFixed(1)}%`,
      `invDays=${invDays}`,
      `sold30=${sold30}`,
      `clicks30=${clicks30}`,
      `impressions30=${impressions30}`,
      `spend30=${adSpend30.toFixed(2)}`,
      `listingHasImages=${themeInfo.visual.hasImages}`,
      `listingImageCount=${themeInfo.visual.imageCount}`,
      `listingMainImage=${themeInfo.visual.mainImageUrl || 'none'}`,
      `themes=${themeInfo.primaryThemes.join(',') || 'coverage_or_stuck_stock'}`,
      `secondaryThemes=${themeInfo.secondaryThemes.join(',') || 'none'}`,
      `stagnantOpportunity=${!!stagnantOpportunity}`,
      ...inventoryEvidence(assessAdOperatingContext(card, { currentDate }).inventory),
      ...listingSeasonEvidence(assessAdOperatingContext(card, { currentDate }).listing),
      ...salesHistoryEvidence(assessAdOperatingContext(card, { currentDate }).history),
      ...currentAdReadinessEvidence(assessAdOperatingContext(card, { currentDate }).readiness),
      `salesHistoryJudgement=${formatSalesHistoryJudgement(assessAdOperatingContext(card, { currentDate }).history)}`,
      `currentAdReadinessJudgement=${formatCurrentAdReadiness(assessAdOperatingContext(card, { currentDate }).readiness)}`,
      `operatingJudgement=${assessAdOperatingContext(card, { currentDate }).judgement}`,
    ];
    if (reviewOnly) {
      plans.push({
        sku: card.sku,
        asin: card.asin,
        summary: `利润导向建广告：该 SKU 有主题推动线索，但 listing 图片缺失，先人工确认图片是否还匹配当前卖点。`,
        actions: [
          makeReviewAction(
            card,
            '当前更看重图片而不是旧文案；该 SKU 具备主题推动线索，但 listing 图片未抓到，先人工确认主图/副图是否仍匹配当前卖点，再决定是否新建广告。',
            evidence,
            item.readinessBlocked ? 'overseason_page_hold' : (listingBlocked ? 'listing_update_required' : 'image_review_required')
          ),
        ],
      });
      continue;
    }
    const actions = [];
    const reason = stagnantOpportunity
      ? '滞销库存有节点/季节/场景机会，先用低预算 SP 补覆盖，目标是拿展示点击验证机会，不按盈利品放量。'
      : themeInfo.visual.hasImages
      ? `SKU 有利润和库存承接，当前覆盖偏弱或存在库存压力；已读取产品画像和 listing 图片信号，先用低预算 SP 结构补覆盖。`
      : `SKU 有利润和库存承接，当前覆盖偏弱或存在库存压力；图片信号不足，先用低预算 SP 结构补覆盖，避免激进放量。`;
    const createOptions = stagnantOpportunity
      ? { dailyBudget: 1, confidence: 0.76, riskLevel: 'stagnant_opportunity_create', inventoryJudgement: assessAdOperatingContext(card, { currentDate }).judgement, listingSeasonJudgement: assessAdOperatingContext(card, { currentDate }).judgement, salesHistoryJudgement: formatSalesHistoryJudgement(assessAdOperatingContext(card, { currentDate }).history), currentAdReadinessJudgement: formatCurrentAdReadiness(assessAdOperatingContext(card, { currentDate }).readiness) }
      : { inventoryJudgement: assessAdOperatingContext(card, { currentDate }).judgement, listingSeasonJudgement: assessAdOperatingContext(card, { currentDate }).judgement, salesHistoryJudgement: formatSalesHistoryJudgement(assessAdOperatingContext(card, { currentDate }).history), currentAdReadinessJudgement: formatCurrentAdReadiness(assessAdOperatingContext(card, { currentDate }).readiness) };
    const phraseBid = estimateInitialBid(card, themeInfo, 'PHRASE', stagnantOpportunity);
    const broadBid = estimateInitialBid(card, themeInfo, 'BROAD', stagnantOpportunity);
    const autoBid = estimateInitialBid(card, themeInfo, 'AUTO', stagnantOpportunity);
    evidence.push(`estimatedPhraseBid=${phraseBid}`);
    evidence.push(`estimatedBroadBid=${broadBid}`);
    evidence.push(`estimatedAutoBid=${autoBid}`);

    const phraseCore = `q2 profit ${card.sku.toLowerCase()} phrase`;
    if (actionCount < limit && !names.has(`kw_${phraseCore}_${String(card.sku).toLowerCase()}`)) {
      actions.push(createAction(card, 'keywordTarget', phraseCore, 'PHRASE', phraseBid, terms.slice(0, 12), reason, evidence, createOptions));
      actionCount += 1;
    }

    const broadCore = `q2 profit ${card.sku.toLowerCase()} broad`;
    if (actionCount < limit && lowCoverage && !names.has(`kw_${broadCore}_${String(card.sku).toLowerCase()}`)) {
      actions.push(createAction(card, 'keywordTarget', broadCore, 'BROAD', broadBid, terms.slice(0, 10), reason, evidence, createOptions));
      actionCount += 1;
    }

    const autoCore = `q2 profit ${card.sku.toLowerCase()} auto`;
    if (actionCount < limit && (!card.createContext?.coverage?.hasSpAuto || (lowCoverage && stuckRisk)) && !names.has(`auto_${autoCore}_${String(card.sku).toLowerCase()}`)) {
      actions.push(createAction(card, 'auto', autoCore, '', autoBid, [], reason, evidence, createOptions));
      actionCount += 1;
    }

    if (actions.length) plans.push({ sku: card.sku, asin: card.asin, summary, actions });
  }

  return plans;
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', 'profit_create_candidate_schema_2026-04-23.json');
  const limit = Number(process.argv[4] || process.env.CREATE_ACTION_LIMIT || 40);

  if (!snapshotFile) {
    throw new Error('Usage: node scripts/generators/generate_profit_create_schema.js <snapshot.json> [output.json] [limit]');
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const plans = generatePlans(snapshot, { limit });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    candidateSkus: snapshot.productCards?.length || 0,
    plannedSkus: plans.length,
    plannedActions: plans.reduce((sum, item) => sum + item.actions.length, 0),
    topSkus: plans.slice(0, 15).map(p => ({ sku: p.sku, actions: p.actions.length, summary: p.summary })),
  }, null, 2));
}

module.exports = {
  generatePlans,
  listingVisualSignals,
  resolveThemes,
  buildTerms,
  isTermSafeForProduct,
  seasonalTermStatus,
  makeReviewAction,
};

if (require.main === module) {
  main();
}
