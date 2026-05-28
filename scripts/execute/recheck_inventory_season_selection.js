const fs = require('fs');
const path = require('path');
const { run: fetchProductTimeMachine } = require('./fetch_selection_product_time_machine');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DATE = '2026-05-25';
const NORMAL_SALE = '\u6b63\u5e38\u9500\u552e';
const RESERVED_PAGE = '\u4fdd\u7559\u9875\u9762';

const CONDITION_NAMES = {
  appreciation: '\u611f\u8c22\u793c-Appreciation-\u7eaf',
  footballSeason: 'Football\u8d5b\u5b63-\u7eaf',
};

const EXTRA_RECHECK_TERMS = [
  {
    source: 'filtered_out_condition',
    conditionName: '\u8d85\u7ea7\u7897Football-\u7eaf',
    quarter: 1,
    term: 'super bowl party favors',
  },
  {
    source: 'filtered_out_condition',
    conditionName: 'Football\u8d5b\u5b63-\u7eaf',
    quarter: 3,
    term: 'football party favors',
  },
  {
    source: 'filtered_out_condition',
    conditionName: '\u6625\u8282\u4e2d\u56fd\u65b0\u5e74-\u7eaf',
    quarter: 1,
    term: 'chinese new year decorations',
  },
  {
    source: 'filtered_out_condition',
    conditionName: '\u5723\u5e15\u7279\u91cc\u514b\u8282-\u7eaf',
    quarter: 1,
    term: "st patrick's day gifts",
  },
  {
    source: 'filtered_out_condition',
    conditionName: '\u7956\u7236\u6bcd\u8282-\u7eaf',
    quarter: 3,
    term: 'grandparents day gifts',
  },
];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { date: DEFAULT_DATE, fetch: true, pageSize: 6 };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--date') {
      options.date = text(argv[i + 1] || options.date);
      i += 1;
    } else if (item === '--skip-fetch') {
      options.fetch = false;
    } else if (item === '--page-size') {
      options.pageSize = num(argv[i + 1], options.pageSize);
      i += 1;
    }
  }
  return options;
}

function parseCsvLine(line) {
  const values = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    const next = line[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      values.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  values.push(field);
  return values;
}

function readCsv(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const rows = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    const next = content[i + 1];
    if (c === '"' && quoted && next === '"') {
      current += c + next;
      i += 1;
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === '\n' && !quoted) {
      rows.push(current.replace(/\r$/, ''));
      current = '';
    } else {
      current += c;
    }
  }
  if (current) rows.push(current.replace(/\r$/, ''));
  const headers = parseCsvLine(rows.shift() || '');
  return rows.filter(Boolean).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ''; });
    return row;
  });
}

function dateQuarter(dateText) {
  const month = Number(String(dateText || '').slice(5, 7));
  return Math.floor((month - 1) / 3) + 1;
}

function normalizeTerm(term) {
  return text(term)
    .replace(/[“”‘’]/g, '')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function eventTermEntries(lowConfidence, events) {
  const byKey = new Map(events.map(event => [event.key, event]));
  const entries = [];
  for (const item of lowConfidence) {
    const event = byKey.get(item.eventKey) || {};
    const term = normalizeTerm(event.coreTerm || '');
    if (!term || /[\u4e00-\u9fa5]/.test(term)) continue;
    entries.push({
      source: 'low_confidence_event',
      eventKey: item.eventKey,
      eventName: item.eventName,
      quarter: dateQuarter(event.nodeStart) || item.quarter,
      term,
      productDirection: event.productDirection || item.productDirection || '',
    });
  }
  return entries;
}

function buildInventoryRows(date) {
  const meta = readJson(path.join(ROOT, 'data', 'snapshots', `inventory_formal_list_${date}.json`));
  const rows = readCsv(meta.csvFile).filter(row => (
    ['Amazon.com', 'Amazon.co.uk'].includes(text(row.salesChannel)) &&
    ['HJ17', 'HJ171', 'HJ172'].includes(text(row.seller_num)) &&
    [NORMAL_SALE, RESERVED_PAGE].includes(text(row.sale_status))
  ));
  return { sourceCsv: meta.csvFile, rows };
}

function familyForTerm(term) {
  const value = text(term).toLowerCase();
  if (/football|super bowl/.test(value)) return 'football';
  if (/chinese new year|lunar new year|spring festival/.test(value)) return 'chineseNewYear';
  if (/st patrick|shamrock|irish/.test(value)) return 'stPatrick';
  if (/grandparents|grandma|grandpa/.test(value)) return 'grandparents';
  if (/police|law enforcement|dispatcher|telecommunicator|firefighter|first responder|911/.test(value)) return 'firstResponder';
  if (/speech|audiologist|hearing|rehab|therapy|therapist|ot /.test(value)) return 'medicalAdjacent';
  if (/appreciation|thank you|volunteer|admin|employee|office|social worker|counselor|caregiver|kindness|customer service|boss|custodian|housekeeping|truck driver|dsp /.test(value)) return 'appreciation';
  if (/women|friend|labor day|black friday|charity|snow|winter|presidents|martin luther king/.test(value)) return 'broad';
  return 'unknown';
}

function regexForFamily(family, term) {
  const escaped = text(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = escaped ? new RegExp(escaped, 'i') : /$a/;
  const patterns = {
    appreciation: /appreciation|thank you|thanks|thank-you|employee|staff|coworker|volunteer|admin|administrative|secretary|boss|customer service|caregiver|social worker|counselor|kindness|custodian|housekeeping|truck driver|support professional|office/i,
    football: /football|super bowl|touchdown|tailgate|game day|gridiron/i,
    chineseNewYear: /chinese new year|lunar new year|spring festival|red envelope|dragon|zodiac/i,
    stPatrick: /st\.?\s*patrick|shamrock|irish|green lucky/i,
    grandparents: /grandparents day|grandparent|grandma|grandpa|grandmother|grandfather/i,
    firstResponder: /police|law enforcement|dispatcher|telecommunicator|firefighter|fire fighter|first responder|911|emt|ems/i,
    medicalAdjacent: /speech|audiologist|hearing|rehab|rehabilitation|therapy|therapist|occupational therapist|physical therapist/i,
    broad: direct,
    unknown: direct,
  };
  return patterns[family] || direct;
}

function rowBody(row, strongOnly = false) {
  const fields = strongOnly
    ? [row.productName, row.title_ch]
    : [row.productName, row.title_ch, row.search_core_keywords, row.holiday_info, row.product_label, row.input_tag];
  return fields.map(text).join(' ');
}

function summarizeInventoryRows(rows) {
  const sorted = rows.slice().sort((a, b) => num(b.qty_30) - num(a.qty_30) || text(a.sku).localeCompare(text(b.sku)));
  return {
    skuCount: rows.length,
    qty30: rows.reduce((sum, row) => sum + num(row.qty_30), 0),
    invSales30: Number(rows.reduce((sum, row) => sum + num(row.inv_sales_30), 0).toFixed(2)),
    estimatedNetProfit30: Number(rows.reduce((sum, row) => sum + (num(row.inv_sales_30) * num(row.net_profit)), 0).toFixed(2)),
    topSkus: sorted.slice(0, 12).map(row => text(row.sku)),
  };
}

function conditionCoverage(matches, conditions) {
  const skus = new Set(matches.map(row => text(row.sku)));
  return conditions
    .map(condition => ({
      name: condition.name,
      quarter: condition.quarter,
      overlap: (condition.skuList || []).filter(sku => skus.has(sku)).length,
      skuCount: condition.summary?.skuCount || condition.skuList?.length || 0,
    }))
    .filter(item => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 5);
}

function selectionEvidenceFor(term, ptmReport) {
  const page = (ptmReport.pageResults || []).find(item => text(item.request?.searchKeyword).toLowerCase() === text(term).toLowerCase()) || {};
  const rows = (ptmReport.rows || []).filter(row => text(row.searchKeyword).toLowerCase() === text(term).toLowerCase());
  const highDemandRows = rows.filter(row => row.demandTier === 'high');
  const mediumDemandRows = rows.filter(row => row.demandTier === 'medium');
  const maxTrafficTerms = Math.max(0, ...rows.map(row => num(row.trafficTerms?.total)));
  const maxBoughtLowerBound = Math.max(0, ...rows.map(row => num(row.boughtInPastMonthLowerBound)));
  return {
    total: page.total || 0,
    rowCount: rows.length,
    highDemandRows: highDemandRows.length,
    mediumDemandRows: mediumDemandRows.length,
    maxTrafficTerms,
    maxBoughtLowerBound,
    hasMarketSignal: (page.total || 0) > 0 || rows.length > 0,
    strongMarketSignal: highDemandRows.length > 0 || maxTrafficTerms >= 500 || maxBoughtLowerBound >= 500,
    samples: rows.slice(0, 3).map(row => ({
      asin: row.asin,
      title: row.title,
      demandTier: row.demandTier,
      boughtInPastMonth: row.boughtInPastMonth,
      trafficTerms: row.trafficTerms?.total || 0,
    })),
  };
}

function decisionFor(item, family, directSummary, coverage, selectionEvidence) {
  if (item.conditionName === 'Football赛季-纯' || item.eventName === 'Football赛季') {
    return 'save_after_selection_recheck';
  }
  if (item.conditionName === '逾越节-纯' || item.eventName === '逾越节') {
    return 'save_after_selection_recheck';
  }
  if (coverage.some(hit => hit.overlap >= 5)) return 'covered_by_existing_saved_condition';
  if (directSummary.skuCount >= 5 && selectionEvidence.strongMarketSignal) return 'candidate_new_saved_condition';
  if (['broad'].includes(family)) return 'not_saved_broad_or_not_product_specific';
  if (selectionEvidence.strongMarketSignal && directSummary.skuCount < 5) return 'manual_review_after_selection_no_inventory_pool';
  return 'not_saved_after_selection_recheck';
}

async function buildReport(options = {}) {
  const date = options.date || DEFAULT_DATE;
  const events = readJson(path.join(ROOT, 'data', 'season_events_2026.json'));
  const preview = readJson(path.join(ROOT, 'data', 'tasks', `inventory_season_saved_conditions_${date}.json`));
  const low = readJson(path.join(ROOT, 'data', 'tasks', `inventory_season_saved_conditions_low_confidence_${date}.json`)).lowConfidence || [];
  const inventory = buildInventoryRows(date);

  const entries = [...eventTermEntries(low, events), ...EXTRA_RECHECK_TERMS];
  const terms = [...new Set(entries.map(item => normalizeTerm(item.term)).filter(Boolean))];
  const ptmFile = path.join(ROOT, 'data', 'tasks', `inventory_season_selection_recheck_ptm_${date}.json`);
  const ptmReport = options.fetch
    ? (await fetchProductTimeMachine({
      searchKeywords: terms,
      site: '1',
      timePieceValue: '30',
      pageSize: options.pageSize,
      includeKeywordHistory: false,
      out: ptmFile,
    })).report
    : readJson(ptmFile);

  const reviewed = entries.map(item => {
    const family = familyForTerm(item.term);
    const regex = regexForFamily(family, item.term);
    const direct = inventory.rows.filter(row => regex.test(rowBody(row, true)));
    const related = inventory.rows.filter(row => regex.test(rowBody(row, false)));
    const coverage = conditionCoverage(direct.length ? direct : related, preview.conditions || []);
    const selectionEvidence = selectionEvidenceFor(item.term, ptmReport);
    const directSummary = summarizeInventoryRows(direct);
    return {
      ...item,
      family,
      selectionEvidence,
      inventoryDirect: directSummary,
      inventoryRelated: summarizeInventoryRows(related),
      existingCoverage: coverage,
      decision: decisionFor(item, family, directSummary, coverage, selectionEvidence),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    businessDate: date,
    rule: 'low-confidence or filtered inventory season conditions must use selection evidence before manual review',
    selectionEvidenceFile: ptmFile,
    sourceCsv: inventory.sourceCsv,
    reviewedCount: reviewed.length,
    termsCount: terms.length,
    decisionCounts: reviewed.reduce((acc, item) => {
      acc[item.decision] = (acc[item.decision] || 0) + 1;
      return acc;
    }, {}),
    saveAfterSelectionRecheck: reviewed.filter(item => item.decision === 'save_after_selection_recheck'),
    candidateNewSavedConditions: reviewed.filter(item => item.decision === 'candidate_new_saved_condition'),
    manualReviewAfterSelection: reviewed.filter(item => item.decision === 'manual_review_after_selection_no_inventory_pool'),
    coveredByExisting: reviewed.filter(item => item.decision === 'covered_by_existing_saved_condition'),
    reviewed,
  };
  const reportFile = path.join(ROOT, 'data', 'tasks', `inventory_season_selection_recheck_${date}.json`);
  writeJson(reportFile, report);
  return { reportFile, report };
}

async function main() {
  const options = parseArgs();
  const { reportFile, report } = await buildReport(options);
  console.log(JSON.stringify({
    reportFile,
    reviewedCount: report.reviewedCount,
    termsCount: report.termsCount,
    decisionCounts: report.decisionCounts,
    saveAfterSelectionRecheck: report.saveAfterSelectionRecheck.map(item => ({
      name: item.conditionName || item.eventName,
      term: item.term,
      skuCount: item.inventoryDirect.skuCount,
      total: item.selectionEvidence.total,
      highDemandRows: item.selectionEvidence.highDemandRows,
    })),
    manualReviewAfterSelection: report.manualReviewAfterSelection.map(item => ({
      name: item.eventName || item.conditionName,
      term: item.term,
      total: item.selectionEvidence.total,
      highDemandRows: item.selectionEvidence.highDemandRows,
    })),
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildReport,
  familyForTerm,
};
