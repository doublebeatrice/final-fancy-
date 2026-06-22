const fs = require('fs');
const path = require('path');
const {
  buildSelectionOperatingIntelligence,
  evidenceRowsFromSelectionReports,
  termKey,
} = require('./selection_operating_intelligence');

const INTERNAL_EVIDENCE_ROUTES = [
  {
    sourceSystem: 'selection',
    replaces: ['seller_sprite_keyword_export', 'seller_sprite_competitor_export', 'seller_sprite_cpc_export'],
    role: 'market_nodes_keyword_economics_competitor_pool',
    commands: [
      'npm run ops:selection:keyword-research',
      'npm run ops:selection:aba-search-terms',
      'npm run ops:selection:keyword-conversion',
      'npm run ops:selection:keyword-seasonality',
      'npm run ops:selection:product-time-machine',
      'npm run ops:selection:operating-intelligence',
    ],
  },
  {
    sourceSystem: 'sif',
    replaces: ['seller_sprite_reverse_keywords', 'external_keyword_history', 'external_ad_xray'],
    role: 'keyword_history_reverse_keywords_competitor_ad_structure',
    commands: [
      'npm run ops:sif:keyword-history',
      'npm run ops:sif:reverse-keywords',
      'npm run ops:sif:ad-xray',
      'npm run ops:sif:keyword-slots',
    ],
  },
  {
    sourceSystem: 'sellerinventory',
    replaces: ['manual_cost_inventory_listing_sheet'],
    role: 'product_identity_listing_inventory_profit',
    commands: [
      'node scripts/execute/fetch_product_analysis_query2.js',
      'node scripts/execute/run_listing_copy_edits.js --dry-run',
    ],
  },
  {
    sourceSystem: 'ad_backend',
    replaces: ['amazon_ads_export_when_live_backend_available'],
    role: 'current_ad_delivery_search_terms_targets_readback',
    commands: [
      'node scripts/execute/fetch_ad_sku_summary.js',
      'npm run ops:ad-structure',
      'npm run ops:ad:keyword-placement',
    ],
  },
  {
    sourceSystem: 'amazon_frontend',
    replaces: ['external_competitor_page_scrape'],
    role: 'visible_offer_competitor_listing_review_signal',
    commands: ['front-page read or browser-backed page read'],
  },
  {
    sourceSystem: 'gbrain',
    replaces: ['operator_memory_only'],
    role: 'historical_decisions_playbooks_effect_reviews',
    commands: ['rg over D:\\ad-ops-brain before operating judgement'],
  },
];

const EXTERNAL_FALLBACKS = ['seller_sprite', 'manual_excel', 'user_screenshot', 'external_pdf_csv'];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[,\n;]+/).map(text).filter(Boolean);
}

function unique(items = []) {
  return [...new Set(items.map(text).filter(Boolean))];
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').replace('%', ''));
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasData(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return false;
    return keys.some(key => {
      const child = value[key];
      if (child === null || child === undefined || child === '') return false;
      if (Array.isArray(child)) return child.length > 0;
      if (typeof child === 'object') return Object.keys(child).length > 0;
      return true;
    });
  }
  return text(value) !== '';
}

function rowsFrom(value = {}) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.results)) return value.results;
  return [];
}

function readJson(file, fallback = null) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function firstValue(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return '';
}

function defaultSources() {
  return INTERNAL_EVIDENCE_ROUTES.map(route => route.sourceSystem);
}

function termsFromInput(input = {}) {
  const subject = input.subject || {};
  const productProfile = input.productProfile || {};
  const terms = [
    ...list(input.terms || input.marketTerms || input.keywords),
    ...list(subject.keyword || subject.keywords),
    ...list(productProfile.keywordSeeds || productProfile.positioning),
  ];
  const selectionReports = input.selectionReports || {};
  for (const report of Object.values(selectionReports)) {
    for (const row of rowsFrom(report)) {
      terms.push(row.searchTerm || row.keyword || row.term || row.searchKeyword);
    }
    for (const key of Object.keys(safeObject(report.rows))) terms.push(key);
    for (const key of Object.keys(safeObject(report.queryRows))) terms.push(key);
  }
  for (const report of Object.values(input.sifReports || {})) {
    for (const row of rowsFrom(report)) {
      terms.push(row.keyword || row.searchTerm || row.term || row.word);
    }
  }
  return unique(terms.map(termKey));
}

function sourceCoverage(input = {}) {
  const selectionReports = input.selectionReports || {};
  const sifReports = input.sifReports || {};
  const coverage = {
    selection: Object.values(selectionReports).some(hasData),
    sif: Object.values(sifReports).some(hasData),
    sellerinventory: hasData(input.sellerinventory) || hasData(input.inventory) || hasData(input.listing),
    ad_backend: hasData(input.adBackend),
    amazon_frontend: hasData(input.amazonFrontend),
    gbrain: hasData(input.gbrain),
  };
  coverage.presentSources = Object.keys(coverage).filter(key => coverage[key] === true);
  coverage.sourceCount = coverage.presentSources.length;
  return coverage;
}

function productIdentity(input = {}) {
  const subject = input.subject || {};
  const productProfile = input.productProfile || {};
  const listing = input.listing || input.sellerinventory?.listing || {};
  const seller = input.sellerinventory || {};
  return {
    sku: text(subject.sku || productProfile.sku || seller.sku),
    asin: text(subject.asin || productProfile.asin || seller.asin),
    title: text(listing.title || productProfile.title || seller.title || subject.title),
    productType: text(productProfile.productType || productProfile.productTypes?.[0] || subject.productType || ''),
    positioning: text(productProfile.positioning || subject.positioning || ''),
    targetAudience: unique(list(productProfile.targetAudience || subject.targetAudience)),
    useCase: unique(list(productProfile.useCase || productProfile.occasion || subject.useCase)),
    station: text(subject.station || subject.site || input.site || 'Amazon.com'),
  };
}

function normalizeSelectionRows(input = {}) {
  try {
    return evidenceRowsFromSelectionReports({
      terms: termsFromInput(input),
      selectionReports: input.selectionReports || {},
      productProfile: input.productProfile || {},
    });
  } catch (error) {
    return termsFromInput(input).map(term => ({ term }));
  }
}

function buildMarketNodes(input = {}, intelligence = {}) {
  const rows = normalizeSelectionRows(input);
  return rows.map(row => {
    const layers = [
      row.keywordResearch && 'keyword_research',
      row.abaSearchTerm && 'aba',
      row.keywordSeasonality && 'seasonality',
      row.productTimeMachine?.length && 'product_time_machine',
      row.keywordConversion && 'keyword_conversion',
    ].filter(Boolean);
    const conversion = row.keywordConversion || {};
    const aba = row.abaSearchTerm || {};
    return {
      term: text(row.term),
      evidenceLayers: layers,
      demandSignal: text(conversion.marketQuality || aba.demandTier || (layers.length >= 3 ? 'multi_source_signal' : 'needs_research')),
      costRisk: text(conversion.costRisk || aba.costRisk || ''),
      routeDecision: layers.length >= 3 ? 'validate_node' : 'collect_more_evidence',
    };
  }).filter(node => node.term).slice(0, 20);
}

function competitorPool(input = {}) {
  const rows = normalizeSelectionRows(input);
  const direct = [];
  const learning = [];
  const trafficBridge = [];
  const excluded = [];
  for (const row of rows) {
    for (const item of rowsFrom(row.productTimeMachine || [])) {
      const asin = text(item.asin);
      if (!asin) continue;
      const record = {
        asin,
        keyword: text(item.searchKeyword || row.term),
        title: text(item.title),
        price: num(item.price),
        reviewCount: num(item.reviewCount, 0),
        reason: 'selection_product_time_machine',
      };
      if (text(item.directness || item.competitorType).includes('exclude')) excluded.push(record);
      else if (num(item.boughtInPastMonthLowerBound, 0) > 0 || text(item.demandTier) === 'high') direct.push(record);
      else trafficBridge.push(record);
    }
    const research = row.keywordResearch || {};
    for (const asin of list(research.directCompetitorAsins || research.directAsins)) {
      direct.push({ asin, keyword: text(row.term), reason: 'selection_keyword_research_direct' });
    }
    for (const asin of list(research.sceneCompetitorAsins || research.trafficBridgeAsins)) {
      trafficBridge.push({ asin, keyword: text(row.term), reason: 'selection_keyword_research_bridge' });
    }
  }
  for (const row of rowsFrom(input.sifReports?.adXray || input.sifReports?.reverseKeywords || {})) {
    const asin = text(row.asin || row.targetAsin);
    if (asin) learning.push({ asin, keyword: text(row.keyword || row.searchTerm), reason: 'sif_read_only_signal' });
  }
  const dedupe = items => {
    const seen = new Set();
    return items.filter(item => {
      const key = `${item.asin}|${item.keyword}|${item.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  };
  return {
    direct: dedupe(direct),
    trafficBridge: dedupe(trafficBridge),
    learning: dedupe(learning),
    excluded: dedupe(excluded),
  };
}

function keywordRoutes(input = {}) {
  const rows = normalizeSelectionRows(input);
  const profile = productIdentity(input);
  return rows.map(row => {
    const term = text(row.term);
    const conversion = row.keywordConversion || {};
    const related = !profile.productType || term.includes(termKey(profile.productType).split(' ')[0]) || term.includes(termKey(profile.positioning).split(' ')[0]);
    const searchVolume = num(firstValue(conversion, ['searchVolume', 'monthlySearchVolume']), null);
    const costRisk = text(conversion.costRisk || '');
    return {
      term,
      relevance: related ? 'high_or_needs_human_confirm' : 'needs_human_confirm',
      pageRoute: related ? ['title/bullets candidate', 'A+ or image script support'] : ['do not place before manual fit check'],
      adRoute: related && (searchVolume || costRisk)
        ? ['Exact test', 'Phrase validation', 'no write before advertising full structure']
        : ['research only'],
      negativeRoute: related ? [] : ['candidate exclusion if product form conflicts'],
      evidence: [
        row.keywordResearch && 'selection_keyword_research',
        row.keywordConversion && 'selection_keyword_conversion',
        row.abaSearchTerm && 'selection_aba',
        row.keywordSeasonality && 'selection_seasonality',
        row.productTimeMachine?.length && 'selection_product_time_machine',
      ].filter(Boolean),
    };
  }).filter(route => route.term).slice(0, 50);
}

function listingFit(input = {}) {
  const listing = input.listing || input.sellerinventory?.listing || {};
  const hasTitle = !!text(listing.title);
  const bullets = list(listing.bullets || listing.bullet || listing.bulletPoints);
  const imageCount = num(listing.imageCount || listing.images?.length || listing.imageUrls?.length, 0);
  return {
    status: hasTitle && bullets.length && imageCount ? 'visible_assets_present' : 'needs_listing_assets',
    titlePresent: hasTitle,
    bulletCount: bullets.length,
    imageCount,
    checks: [
      'listing_visual_packaging_must_express_same_product_facts',
      'policy_claims_need_current_backend_or_official_check',
    ],
  };
}

function inventoryCashGate(input = {}) {
  const inventory = input.inventory || input.sellerinventory?.inventory || input.sellerinventory || {};
  const fbaInv = num(inventory.fbaInv || inventory.fba_inventory || inventory.fba_inv || inventory.inventory, null);
  const sales30 = num(inventory.sales30 || inventory.sales_30 || inventory.unitsSold30 || inventory.unitsSold_30d, null);
  const profitRate = num(inventory.profitRate || inventory.profit_rate || inventory.netProfitRate, null);
  let status = 'missing_inventory_or_profit';
  if (fbaInv !== null && sales30 !== null && profitRate !== null) {
    status = fbaInv <= 0 ? 'inventory_red' : profitRate <= 0 ? 'profit_red' : fbaInv / Math.max(sales30, 1) * 30 < 21 ? 'inventory_yellow' : 'inventory_cash_review_passable';
  }
  return {
    status,
    fbaInv,
    sales30,
    profitRate,
    canScaleTraffic: status === 'inventory_cash_review_passable',
  };
}

function adReadiness(input = {}) {
  const ad = input.adBackend || {};
  const impressions = num(ad.impressions || ad.impressions7 || ad.impressions30, null);
  const clicks = num(ad.clicks || ad.clicks7 || ad.clicks30, null);
  const orders = num(ad.orders || ad.orders7 || ad.orders30, null);
  return {
    status: ad && Object.keys(ad).length ? 'ad_backend_snapshot_present' : 'needs_live_ad_backend_read',
    impressions,
    clicks,
    orders,
    note: 'advertising writes require GBrain 广告调整完整结构, dry-run, execution, and landed readback',
  };
}

function decisionGate(input = {}, coverage = {}, marketNodes = [], inventoryGate = {}) {
  const missing = [];
  if (!coverage.selection) missing.push('selection_market_evidence');
  if (!coverage.sif) missing.push('sif_keyword_evidence');
  if (!coverage.sellerinventory) missing.push('sellerinventory_listing_inventory_profit');
  if (!coverage.ad_backend) missing.push('live_ad_backend_when_ad_action_is_needed');
  const conclusion = missing.includes('selection_market_evidence')
    ? 'Hold'
    : inventoryGate.status === 'inventory_cash_review_passable' && marketNodes.some(node => node.routeDecision === 'validate_node')
      ? 'Validate'
      : 'Validate';
  return {
    conclusion,
    reason: conclusion === 'Hold'
      ? 'internal market evidence is missing'
      : 'internal evidence supports a controlled validation path, not automatic ad execution',
    missingEvidence: missing,
  };
}

function buildProductLineOpsProfile(input = {}) {
  const coverage = sourceCoverage(input);
  const evidenceRows = normalizeSelectionRows(input);
  const operatingIntelligence = buildSelectionOperatingIntelligence({
    evidenceRows,
    productProfile: input.productProfile || {},
  });
  const identity = productIdentity(input);
  const marketNodes = buildMarketNodes(input, operatingIntelligence);
  const inventoryGate = inventoryCashGate(input);
  const decision = decisionGate(input, coverage, marketNodes, inventoryGate);
  return {
    capabilityId: 'product_line_ops::profile::read',
    stage: 'product_line_profile',
    generatedAt: text(input.generatedAt || new Date().toISOString()),
    businessDate: text(input.today || input.businessDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    readyForDecisionSupport: decision.conclusion !== 'Hold',
    readyForAutoAction: false,
    productIdentity: identity,
    sourceBoundary: {
      defaultSources: defaultSources(),
      externalFallbacks: EXTERNAL_FALLBACKS,
      rule: 'selection/SIF/sellerinventory/ad backend/GBrain are default; seller_sprite is fallback input only',
    },
    sourceCoverage: coverage,
    marketNodes,
    competitorPool: competitorPool(input),
    keywordRoutes: keywordRoutes(input),
    listingFit: listingFit(input),
    inventoryCashGate: inventoryGate,
    adReadiness: adReadiness(input),
    operatingIntelligence: {
      readyForDecisionSupport: operatingIntelligence.readyForDecisionSupport,
      readyForAutoAction: operatingIntelligence.readyForAutoAction,
      decisionQuality: operatingIntelligence.decisionQuality,
      recommendedOperatingUse: operatingIntelligence.recommendedOperatingUse,
      sourceCoverage: operatingIntelligence.sourceCoverage,
      riskSignals: operatingIntelligence.riskSignals,
    },
    decisionGate: decision,
    missingEvidence: decision.missingEvidence,
    adActionBoundary: {
      requiredStandard: 'GBrain [[playbooks/广告调整完整结构]] before bid, budget, status, keyword, ASIN, or campaign writes',
      liveReadbackRequired: true,
      acceptanceWindow: '3/7 day checkpoint after landed action',
    },
  };
}

function sampleProductLineOpsInput() {
  return {
    today: '2026-06-17',
    subject: {
      sku: 'AI5041',
      asin: 'B0AI5041XX',
      site: 'Amazon.com',
    },
    terms: ['mushroom kitchen mats'],
    productProfile: {
      sku: 'AI5041',
      asin: 'B0AI5041XX',
      productType: 'kitchen mat set',
      positioning: 'mushroom kitchen mats cottagecore kitchen runner set',
      targetAudience: ['home decor buyer'],
      useCase: ['kitchen decor', 'anti fatigue standing'],
    },
    listing: {
      title: 'Mushroom Kitchen Mats Set of 2',
      bullets: ['Cottagecore kitchen rug set for sink and stove areas'],
      imageCount: 6,
    },
    inventory: {
      fbaInv: 120,
      sales30: 20,
      profitRate: 0.24,
    },
    adBackend: {
      impressions7: 140,
      clicks7: 8,
      orders7: 0,
    },
    sifReports: {
      reverseKeywords: {
        rows: [
          { keyword: 'mushroom kitchen mats', organicRank: 18, spRank: 4 },
          { keyword: 'cottagecore kitchen mat', organicRank: 25, spRank: 8 },
        ],
      },
    },
    selectionReports: {
      keywordResearch: {
        rows: {
          'mushroom kitchen mats': {
            directCompetitors: 2,
            sceneCompetitors: 1,
            directCompetitorAsins: ['B0DIRECT001'],
            trafficBridgeAsins: ['B0BRIDGE001'],
          },
        },
      },
      keywordConversion: {
        rows: {
          'mushroom kitchen mats': {
            keyword: 'mushroom kitchen mats',
            searchVolume: 1200,
            purchaseVolume: 32,
            marketQuality: 'usable_niche',
            costRisk: 'medium',
          },
        },
      },
      abaSearchTerms: {
        rows: {
          'mushroom kitchen mats': {
            searchTerm: 'mushroom kitchen mats',
            searchVolume: 1800,
            demandTier: 'medium',
          },
        },
      },
      keywordSeasonality: {
        rows: {
          'mushroom kitchen mats': {
            searchTerm: 'mushroom kitchen mats',
            seasonalityType: 'evergreen',
          },
        },
      },
      productTimeMachine: {
        rows: {
          'mushroom kitchen mats': [{
            asin: 'B0DIRECT001',
            searchKeyword: 'mushroom kitchen mats',
            title: 'Mushroom Kitchen Rugs Set',
            demandTier: 'high',
            boughtInPastMonthLowerBound: 800,
            price: 24.99,
            reviewCount: 480,
          }],
        },
      },
    },
  };
}

function runProductLineOpsProfile(options = {}) {
  const input = options.sample ? sampleProductLineOpsInput() : {
    today: options.today,
    subject: {
      sku: options.sku,
      asin: options.asin,
      keyword: options.terms || options.keywords,
      site: options.site,
    },
    terms: options.terms || options.keywords,
    productProfile: readJson(options.productProfileFile, {}),
    listing: readJson(options.listingReport, {}),
    inventory: readJson(options.inventoryReport, {}),
    adBackend: readJson(options.adBackendReport, {}),
    gbrain: readJson(options.gbrainReport, {}),
    amazonFrontend: readJson(options.amazonFrontendReport, {}),
    sifReports: {
      reverseKeywords: readJson(options.sifReverseKeywordsReport, {}),
      keywordHistory: readJson(options.sifKeywordHistoryReport, {}),
      adXray: readJson(options.sifAdXrayReport, {}),
      keywordSlots: readJson(options.sifKeywordSlotsReport, {}),
    },
    selectionReports: {
      keywordResearch: readJson(options.keywordResearchReport, {}),
      keywordConversion: readJson(options.keywordConversionReport, {}),
      abaSearchTerms: readJson(options.abaReport, {}),
      keywordSeasonality: readJson(options.seasonalityReport, {}),
      productTimeMachine: readJson(options.productTimeMachineReport, {}),
      operatingIntelligence: readJson(options.operatingIntelligenceReport, {}),
    },
  };
  const profile = buildProductLineOpsProfile(input);
  if (options.outFile) {
    fs.mkdirSync(path.dirname(options.outFile), { recursive: true });
    fs.writeFileSync(options.outFile, JSON.stringify(profile, null, 2), 'utf8');
  }
  return { profile };
}

module.exports = {
  buildProductLineOpsProfile,
  INTERNAL_EVIDENCE_ROUTES,
  readJson,
  runProductLineOpsProfile,
  sampleProductLineOpsInput,
};
