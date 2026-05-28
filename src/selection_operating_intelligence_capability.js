const fs = require('fs');
const path = require('path');
const {
  normalizeSelectionMarketReport,
} = require('./agent_review_evidence');
const {
  buildSelectionOperatingIntelligence,
  capabilitySummary,
  deriveTerms,
  evidenceRowsFromSelectionReports,
  termKey,
} = require('./selection_operating_intelligence');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'snapshots');
const CAPABILITY_ID = 'selection::market_evidence::operating-intelligence::read';
const CAPABILITY_SCRIPT = 'ops:selection:operating-intelligence';
const CAPABILITY_MODULE = path.join('src', 'selection_operating_intelligence.js');

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[,\n;]+/).map(text).filter(Boolean);
}

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function quoteArg(value) {
  const raw = text(value);
  if (!raw) return '""';
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function defaultOutputFile(options = {}) {
  const label = text(options.label || 'selection_operating_intelligence');
  return path.join(DEFAULT_OUT_DIR, `${label}_${todayYmd()}.json`);
}

function isNormalizedSelectionReport(report = {}) {
  return !!(
    report &&
    typeof report === 'object' &&
    !Array.isArray(report.rows) &&
    report.rows &&
    typeof report.rows === 'object' &&
    typeof report.rowCount === 'number' &&
    report.source
  );
}

function normalizeSelectionSource(key, report = {}) {
  if (isNormalizedSelectionReport(report)) return report;
  return normalizeSelectionMarketReport({ [key]: report })[key];
}

function sourceSummary(report = {}, fallbackSource = '') {
  return {
    source: text(report.source || fallbackSource),
    ok: report.ok !== false,
    rowCount: Number(report.rowCount || 0),
    exportedAt: text(report.exportedAt || ''),
  };
}

function sourceSummaries(selectionReports = {}) {
  return {
    keywordResearch: sourceSummary(selectionReports.keywordResearch, 'selection_keyword_research'),
    keywordConversion: sourceSummary(selectionReports.keywordConversion, 'selection_keyword_conversion_rate'),
    abaSearchTerms: sourceSummary(selectionReports.abaSearchTerms, 'selection_aba_search_terms'),
    keywordSeasonality: sourceSummary(selectionReports.keywordSeasonality, 'selection_keyword_seasonality'),
    productTimeMachine: sourceSummary(selectionReports.productTimeMachine, 'selection_product_time_machine'),
    extendedSelection: sourceSummary(selectionReports.extendedSelection, 'selection_extended_evidence'),
  };
}

function reportRoleSummaries(selectionReports = {}) {
  return [
    {
      key: 'keywordResearch',
      role: 'front-search competitor validation',
      evidenceUse: 'direct competitors, scene competitors, traffic-bridge ASINs, and candidate keywords',
    },
    {
      key: 'keywordConversion',
      role: 'keyword cost economics',
      evidenceUse: 'search volume, purchase volume, click-purchase ratio, and CPC/CPA/ACOS ranges',
    },
    {
      key: 'abaSearchTerms',
      role: 'market demand and concentration',
      evidenceUse: 'ABA rank, search volume, estimated orders, and top-ASIN concentration',
    },
    {
      key: 'keywordSeasonality',
      role: 'market window and timing',
      evidenceUse: 'Google trend, seasonality, buyer expansion, and competitor pressure',
    },
    {
      key: 'productTimeMachine',
      role: 'competitor traffic map',
      evidenceUse: 'winning ASINs, bought history, rank movement, and traffic structure',
    },
    {
      key: 'extendedSelection',
      role: 'product-level selection evidence',
      evidenceUse: 'ASIN info, association flow, ad placement, category analysis, rank rows, comment analysis, traffic detail, theme tags, and store feedback',
    },
  ].map(item => ({
    ...item,
    status: selectionReports[item.key] && selectionReports[item.key].rowCount > 0 ? 'present' : 'missing',
  }));
}

function loadSelectionReportsFromInput(options = {}) {
  const rawInput = options.sample ? sampleSelectionOperatingIntelligenceInput(options) : readJson(options.inputFile, {});
  const rawSelectionReports = rawInput.selectionReports && typeof rawInput.selectionReports === 'object'
    ? rawInput.selectionReports
    : rawInput;
  const sources = {
    keywordResearch: options.keywordResearchReportFile,
    keywordConversion: options.keywordConversionReportFile,
    abaSearchTerms: options.abaReportFile || options.abaSearchTermsReportFile,
    keywordSeasonality: options.keywordSeasonalityReportFile,
    productTimeMachine: options.productTimeMachineReportFile,
    extendedSelection: options.extendedSelectionReportFile,
  };
  const normalized = {};
  for (const key of Object.keys(sources)) {
    const fallback = rawSelectionReports[key]
      || rawSelectionReports[`${key}Report`]
      || rawSelectionReports[key.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)]
      || {};
    const candidate = sources[key] ? readJson(sources[key], fallback) : fallback;
    normalized[key] = normalizeSelectionSource(key, candidate);
  }
  const selectionReports = normalized;
  const productProfile = readJson(options.productProfileFile, rawInput.productProfile || options.productProfile || {});
  const card = readJson(options.cardFile, rawInput.card || options.card || {});
  const terms = deriveTerms({
    terms: options.terms || rawInput.terms || rawInput.searchTerms || rawInput.keywords,
    evidenceRows: options.evidenceRows || rawInput.evidenceRows || [],
    selectionReports,
  });
  return {
    rawInput,
    selectionReports,
    productProfile,
    card,
    terms,
    sourceFiles: {
      inputFile: text(options.inputFile),
      productProfileFile: text(options.productProfileFile),
      cardFile: text(options.cardFile),
      keywordResearchReportFile: text(options.keywordResearchReportFile),
      keywordConversionReportFile: text(options.keywordConversionReportFile),
      abaReportFile: text(options.abaReportFile || options.abaSearchTermsReportFile),
      keywordSeasonalityReportFile: text(options.keywordSeasonalityReportFile),
      productTimeMachineReportFile: text(options.productTimeMachineReportFile),
      extendedSelectionReportFile: text(options.extendedSelectionReportFile),
    },
  };
}

function sampleSelectionOperatingIntelligenceInput() {
  return {
    terms: ['american flag bucket hat'],
    selectionReports: {
      keywordResearch: {
        source: 'selection_keyword_research',
        rows: [{
          term: 'american flag bucket hat',
          directCompetitors: 2,
          sceneCompetitors: 1,
          trafficBridgeCompetitors: 1,
          excluded: 0,
        }],
        candidateKeywords: [{
          term: 'american flag bucket hat',
          source: 'operator_terms',
          nextCheck: ['selection_keyword_conversion_rate', 'selection_aba_search_terms'],
          evidence: ['front-search validated term'],
        }],
        directCompetitorAsins: [{
          asin: 'B0HAT00001',
          searchTerm: 'american flag bucket hat',
        }],
        sceneCompetitorAsins: [{
          asin: 'B0HAT00002',
          searchTerm: 'american flag bucket hat',
        }],
        trafficBridgeAsins: [{
          asin: 'B0HAT00003',
          searchTerm: 'american flag bucket hat',
        }],
      },
      keywordConversion: {
        source: 'selection_keyword_conversion_rate',
        rows: [{
          keyword: 'american flag bucket hat',
          marketQuality: 'usable_niche',
          costRisk: 'medium',
          searchVolume: 169,
          purchaseVolume: 5,
          clickPurchaseRatio: 0.0403,
          cpcMedian: 0.74,
          cpaMedian: 18.36,
          acosMedian: 0.9388,
        }],
      },
      abaSearchTerms: {
        source: 'selection_aba_search_terms',
        rows: [{
          searchTerm: 'american flag bucket hat',
          rank: 82000,
          searchVolume: 36000,
          estimatedOrders: 1200,
          demandTier: 'medium',
          competitionTier: 'medium',
          productCount: 860,
          totalClickShare: 0.42,
          brandMonopoly: 0.34,
          avgPrice: 32.5,
          avgRating: 3.5,
          avgReviewCount: 900,
          aPlusRate: 0.2,
          videoRate: 0.18,
          fbmShare: 0.43,
          keywordType: 'rising',
        }],
      },
      keywordSeasonality: {
        source: 'selection_keyword_seasonality',
        rows: [{
          searchTerm: 'american flag bucket hat',
          seasonalityType: 'strong_seasonal',
          peakQuarter: 'q2',
          quarterRatio: 2.4,
          googleTrend: { direction: 'rising' },
          demandTier: 'medium',
          competitionTier: 'medium',
          recommendedUse: 'seasonal',
        }],
      },
      productTimeMachine: {
        source: 'selection_product_time_machine',
        rows: [{
          searchKeyword: 'american flag bucket hat',
          asin: 'B0HAT00001',
          title: 'American Flag Bucket Hat',
          demandTier: 'high',
          trafficMix: 'ad_augmented',
          boughtInPastMonthLowerBound: 2000,
          price: 33,
          reviewCount: 1200,
          aoVal: 1.2,
          trafficTerms: { total: 220, natural: 90, sp: 60, brand: 10, video: 60 },
        }],
      },
      extendedSelection: {
        source: 'selection_extended_evidence',
        rowCount: 1,
        rows: {
          B0HAT00001: {
            asin: 'B0HAT00001',
            asinInfo: { asin: 'B0HAT00001', title: 'American Flag Bucket Hat' },
            associationFlow: [{ asin: 'B0HAT00002' }],
            adPlacement: [{ asin: 'B0HAT00003' }],
            trafficDetail: [{ searchTerm: 'american flag bucket hat' }],
            commentList: { records: [{ asin: 'B0HAT00001', rating: 4 }] },
            dailyRanks: [{ list: 'newReleases', asin: 'B0HAT00001' }],
            storeFeedbackNewAsins: [{ asin: 'B0HAT00001' }],
            sourceKeys: ['commentAnalysis', 'trafficDetail'],
          },
        },
        evidenceBoundary: 'selection_read_only_market_evidence',
      },
    },
  };
}

function buildNextValidationCommands(terms = [], sourceSummaries = {}, subject = {}) {
  const termArg = terms.length ? terms.join(', ') : '<term1, term2>';
  const skuArg = text(subject.sku) || '<SKU>';
  const commands = [];
  if (!(sourceSummaries.keywordResearch?.rowCount > 0)) {
    commands.push(`npm run ops:selection:keyword-research -- --sku ${quoteArg(skuArg)} --terms ${quoteArg(termArg)}`);
  }
  if (!(sourceSummaries.keywordConversion?.rowCount > 0)) {
    commands.push(`npm run ops:selection:keyword-conversion -- --keywords ${quoteArg(termArg)}`);
  }
  if (!(sourceSummaries.abaSearchTerms?.rowCount > 0)) {
    commands.push(`npm run ops:selection:aba-search-terms -- --search-terms ${quoteArg(termArg)}`);
  }
  if (!(sourceSummaries.keywordSeasonality?.rowCount > 0)) {
    commands.push(`npm run ops:selection:keyword-seasonality -- --search-terms ${quoteArg(termArg)}`);
  }
  if (!(sourceSummaries.productTimeMachine?.rowCount > 0)) {
    commands.push(`npm run ops:selection:product-time-machine -- --search-keywords ${quoteArg(termArg)}`);
  }
  return commands;
}

function summarizeOpportunityModels(models = []) {
  return models.map(model => ({
    key: model.key,
    label: model.label,
    term: model.term,
    score: model.score,
    meaning: model.meaning,
    actionBoundary: model.actionBoundary,
    evidence: model.evidence || [],
  }));
}

function buildCapabilityAnalysis(intelligence = {}, options = {}, sourceSummaries = {}) {
  const terms = deriveTerms({
    terms: options.terms || options.searchTerms || options.keywords,
    evidenceRows: options.evidenceRows || [],
    selectionReports: options.selectionReports || {},
  });
  const subject = {
    sku: text(options.sku || options.subject?.sku),
    asin: text(options.asin || options.subject?.asin).toUpperCase(),
  };
  return {
    purpose: 'Convert selection evidence into decision-ready market signals without crossing the write boundary.',
    stableInputContract: [
      'terms, searchTerms, keywords, or evidenceRows',
      'keywordResearch, keywordConversion, abaSearchTerms, keywordSeasonality, productTimeMachine, and optional extendedSelection reports',
      'optional productProfile, card, sku, or asin context',
    ],
    stableOutputContract: [
      'decisionQuality',
      'recommendedOperatingUse',
      'sourceCoverage',
      'opportunityModels',
      'productTimeMachine',
      'riskSignals',
      'missingEvidence',
      'readyForAutoAction=false',
    ],
    sourceLayerAnalysis: reportRoleSummaries(sourceSummaries),
    decisionAnalysis: {
      decisionQuality: intelligence.decisionQuality,
      readyForDecisionSupport: intelligence.readyForDecisionSupport,
      recommendedOperatingUse: intelligence.recommendedOperatingUse,
      readyForAutoAction: intelligence.readyForAutoAction,
      boundary: intelligence.actionBoundary,
      missingEvidence: intelligence.missingEvidence,
      riskSignals: intelligence.riskSignals,
    },
    opportunityModelAnalysis: summarizeOpportunityModels(intelligence.opportunityModels || []),
    sourceCoverageInterpretation: {
      requestedTerms: terms.length,
      matchedKeywordResearch: sourceSummaries.keywordResearch?.rowCount || 0,
      matchedKeywordConversion: sourceSummaries.keywordConversion?.rowCount || 0,
      matchedAbaSearchTerms: sourceSummaries.abaSearchTerms?.rowCount || 0,
      matchedKeywordSeasonality: sourceSummaries.keywordSeasonality?.rowCount || 0,
      matchedProductTimeMachine: sourceSummaries.productTimeMachine?.rowCount || 0,
      matchedExtendedSelection: sourceSummaries.extendedSelection?.rowCount || 0,
    },
    nextValidationCommands: buildNextValidationCommands(terms, sourceSummaries, subject),
    functionBehavior: [
      'Builds a unified evidence row per term from the normalized selection sources.',
      'Scores market signals into opportunity models and risk signals.',
      'Keeps readyForAutoAction false even when the market profile is strong.',
      'Returns missingEvidence instead of pretending weak coverage is complete.',
      'Treats extendedSelection as supporting product-level evidence, not a write permission.',
    ],
    subject,
  };
}

function buildSelectionOperatingIntelligenceCapability(options = {}) {
  const loaded = loadSelectionReportsFromInput(options);
  const evidenceRows = evidenceRowsFromSelectionReports({
    terms: loaded.terms,
    selectionReports: loaded.selectionReports,
  });
  const intelligence = buildSelectionOperatingIntelligence({
    ...options,
    ...loaded,
    evidenceRows,
    selectionReports: loaded.selectionReports,
  });
  const sourceSummaries = sourceSummariesForCapability(loaded.selectionReports);
  return {
    ok: true,
    source: 'selection_operating_intelligence_capability',
    capabilityId: CAPABILITY_ID,
    generatedAt: text(options.generatedAt || new Date().toISOString()),
    evidenceBoundary: 'selection_read_only_market_evidence',
    readyForDecisionSupport: intelligence.readyForDecisionSupport,
    readyForAutoAction: false,
    capability: {
      capabilityId: CAPABILITY_ID,
      script: CAPABILITY_SCRIPT,
      module: CAPABILITY_MODULE,
      command: `npm run ${CAPABILITY_SCRIPT} -- --sample`,
      accessMode: 'local_read_only',
      readyForAutoAction: false,
      stable: true,
    },
    input: {
      terms: loaded.terms,
      subject: {
        sku: text(options.sku || options.subject?.sku),
        asin: text(options.asin || options.subject?.asin).toUpperCase(),
      },
      sourceFiles: loaded.sourceFiles,
      sample: options.sample === true,
    },
    sourceReports: sourceSummaries,
    operatingIntelligence: intelligence,
    analysis: buildCapabilityAnalysis(intelligence, {
      ...options,
      terms: loaded.terms,
      selectionReports: loaded.selectionReports,
      subject: {
        sku: text(options.sku || options.subject?.sku),
        asin: text(options.asin || options.subject?.asin).toUpperCase(),
      },
    }, sourceSummaries),
    capabilitySummary: capabilitySummary(intelligence, {
      ...options,
      terms: loaded.terms,
      selectionReports: loaded.selectionReports,
      evidenceRows,
    }),
  };
}

function sourceSummariesForCapability(selectionReports = {}) {
  return sourceSummaries(selectionReports);
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    help: args.includes('--help') || args.includes('-h'),
    inputFile: get('--input') || get('--file') || '',
    outFile: get('--out') || '',
    label: get('--label') || '',
    terms: get('--terms') || '',
    searchTerms: get('--search-terms') || '',
    keywords: get('--keywords') || '',
    sku: get('--sku') || '',
    asin: get('--asin') || '',
    sample: args.includes('--sample'),
    productProfileFile: get('--product-profile-file') || '',
    cardFile: get('--card-file') || '',
    keywordResearchReportFile: get('--keyword-research-report') || '',
    keywordConversionReportFile: get('--keyword-conversion-report') || '',
    abaReportFile: get('--aba-report') || '',
    abaSearchTermsReportFile: get('--aba-search-terms-report') || '',
    keywordSeasonalityReportFile: get('--seasonality-report') || '',
    productTimeMachineReportFile: get('--product-time-machine-report') || '',
    extendedSelectionReportFile: get('--extended-selection-report') || '',
  };
}

function runSelectionOperatingIntelligenceCapability(options = {}) {
  const report = buildSelectionOperatingIntelligenceCapability(options);
  const outFile = options.outFile || defaultOutputFile(options);
  writeJson(outFile, report);
  return { outFile, report };
}

module.exports = {
  CAPABILITY_ID,
  CAPABILITY_MODULE,
  CAPABILITY_SCRIPT,
  buildCapabilityAnalysis,
  buildSelectionOperatingIntelligenceCapability,
  buildNextValidationCommands,
  defaultOutputFile,
  isNormalizedSelectionReport,
  loadSelectionReportsFromInput,
  parseArgs,
  reportRoleSummaries,
  runSelectionOperatingIntelligenceCapability,
  sampleSelectionOperatingIntelligenceInput,
  sourceSummariesForCapability,
  sourceSummary,
  summarizeOpportunityModels,
};
