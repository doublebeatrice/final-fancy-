const fs = require('fs');
const path = require('path');
const {
  buildAmazonSearchUrl,
  buildKeywordResearchReport,
  buildNextValidationCommands,
  classifyAmazonSearchResults,
  deriveResearchSeedTerms,
  normalizeResearchInput,
} = require('../../src/selection_keyword_research');
const {
  closeTab,
  evaluate,
  navigate,
  openTab,
} = require('../../discovery/lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');
const DEFAULT_SNAPSHOT_FILE = path.join(OUT_DIR, 'latest_snapshot.json');

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const eq = item.indexOf('=');
    if (eq >= 0) {
      options[item.slice(2, eq)] = item.slice(eq + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return { options, positional };
}

function readJson(file, fallback = {}) {
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

function defaultOutputFile() {
  return path.join(OUT_DIR, `selection_keyword_research_${todayYmd()}.json`);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || '').split(/[,，;\n\r]+/).map(text).filter(Boolean);
}

function snapshotCardForSku(sku = '', snapshotFile = DEFAULT_SNAPSHOT_FILE) {
  const normalizedSku = text(sku).toUpperCase();
  if (!normalizedSku) return null;
  const snapshot = readJson(path.resolve(snapshotFile), {});
  return (snapshot.productCards || []).find(card => text(card.sku).toUpperCase() === normalizedSku) || null;
}

function inputFromOptions(options = {}) {
  const card = options.card || snapshotCardForSku(options.sku, options.snapshotFile || options.snapshot || DEFAULT_SNAPSHOT_FILE) || {};
  const listing = card.listing || {};
  const profile = options.productProfile || card.productProfile || {};
  return normalizeResearchInput({
    sku: options.sku || card.sku,
    asin: options.asin || card.asin,
    title: options.title || listing.title || profile.listingTitle || card.title || profile.positioning,
    description: options.description || listing.description || card.note || '',
    terms: options.terms || options.searchTerms || options.keywords || card.createContext?.keywordSeeds || [],
    ownAsins: options.ownAsins || [options.asin || card.asin],
    productProfile: profile,
  });
}

function parsePrice(value) {
  const raw = String(value || '').replace(/[^0-9.]+/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function amazonProductPath(url = '') {
  const raw = text(url);
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://www.amazon.com');
    const nested = parsed.searchParams.get('url');
    if (nested) return new URL(nested, 'https://www.amazon.com').pathname;
    return parsed.pathname;
  } catch (_) {
    return '';
  }
}

function titleFromAmazonUrl(url = '') {
  const pathname = amazonProductPath(url);
  if (!pathname || !pathname.includes('/dp/')) return '';
  const beforeDp = pathname.split('/dp/')[0].split('/').filter(Boolean).pop() || '';
  const title = beforeDp
    .replace(/[-_]+/g, ' ')
    .replace(/\b(?:ref|sr|sspa)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title.length >= 6 ? title : '';
}

function isWeakAmazonTitle(title = '') {
  const value = text(title);
  if (!value) return true;
  if (/^sponsored\s*sponsored$/i.test(value)) return true;
  return value.split(/\s+/).length < 3;
}

function enrichFrontSearchRows(rows = []) {
  return (rows || []).map(row => {
    const slugTitle = titleFromAmazonUrl(row.url);
    if (slugTitle && isWeakAmazonTitle(row.title)) {
      return { ...row, title: slugTitle, titleSource: 'amazon_url_slug' };
    }
    return row;
  });
}

function amazonSearchEval(searchTerm, limit) {
  return `(function () {
    const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim();
    const num = value => {
      const raw = String(value || '').replace(/[^0-9.]+/g, '');
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const text = node => normalize(node && node.textContent || '');
    const cards = [...document.querySelectorAll('[data-component-type="s-search-result"][data-asin]')];
    return cards.slice(0, ${Number(limit || 24)}).map((card, index) => {
      const asin = normalize(card.getAttribute('data-asin')).toUpperCase();
      const titleNode = card.querySelector('h2 a span, h2 span, [data-cy="title-recipe"] span');
      const linkNode = card.querySelector('h2 a, a.a-link-normal.s-no-outline');
      const imageNode = card.querySelector('img.s-image');
      const priceNode = card.querySelector('.a-price .a-offscreen');
      const ratingNode = card.querySelector('.a-icon-alt');
      const reviewNode = card.querySelector('a[href*="customerReviews"] span, span[aria-label$="ratings"]');
      const body = text(card);
      return {
        asin,
        searchTerm: ${JSON.stringify(searchTerm)},
        title: text(titleNode),
        url: linkNode ? new URL(linkNode.getAttribute('href') || '', location.origin).toString() : '',
        imageUrl: imageNode ? imageNode.getAttribute('src') || '' : '',
        price: num(text(priceNode)),
        rating: num(text(ratingNode)),
        reviewCount: num(text(reviewNode).replace(/,/g, '')),
        position: index + 1,
        sponsored: /Sponsored/i.test(body),
        categoryPath: '',
      };
    }).filter(item => item.asin && item.title);
  })()`;
}

async function fetchAmazonSearchResults(seedTerms = [], options = {}) {
  const perTermLimit = Number(options.perTermLimit || options.limit || 24);
  const waitMs = Number(options.waitMs || 2500);
  const results = [];
  const keepTabOpen = options.keepTabOpen === true || options.keepTabOpen === '1';
  const background = options.background !== false && options.background !== '0';
  const workerTab = await openTab('about:blank', undefined, { background });
  try {
    for (const seed of seedTerms) {
      const term = seed.term || seed;
      await navigate(workerTab, buildAmazonSearchUrl(term));
      await new Promise(resolve => setTimeout(resolve, waitMs));
      const rows = await evaluate(workerTab, amazonSearchEval(term, perTermLimit), false);
      for (const row of rows || []) results.push({ ...row, price: parsePrice(row.price) });
    }
  } finally {
    if (!keepTabOpen) await closeTab(workerTab);
  }
  return results;
}

function buildReportFromSearchResults(options = {}, frontSearchResults = []) {
  const input = inputFromOptions(options);
  const seedTerms = deriveResearchSeedTerms(input, { limit: options.seedLimit || options['seed-limit'] || 8 });
  const enrichedFrontSearchResults = enrichFrontSearchRows(frontSearchResults);
  const classified = classifyAmazonSearchResults({
    input,
    seedTerms,
    searchResults: enrichedFrontSearchResults,
  });
  const report = buildKeywordResearchReport({
    input,
    seedTerms,
    searchResults: classified,
    generatedAt: options.generatedAt || new Date().toISOString(),
  });
  return {
    ...report,
    ok: true,
    rowCount: enrichedFrontSearchResults.length,
    amazonFrontSearch: {
      mode: options.frontSearchResults ? 'injected' : 'live_cdp',
      searchUrls: seedTerms.map(seed => buildAmazonSearchUrl(seed.term)),
      resultCount: enrichedFrontSearchResults.length,
    },
    nextValidationCommands: buildNextValidationCommands(report),
    rawFrontSearchResults: enrichedFrontSearchResults,
  };
}

function run(options = {}) {
  const frontSearchResults = options.frontSearchResults || [];
  const report = buildReportFromSearchResults(options, frontSearchResults);
  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile();
  writeJson(outputFile, report);
  return { outputFile, report };
}

async function runLive(options = {}) {
  const input = inputFromOptions(options);
  const seedTerms = deriveResearchSeedTerms(input, { limit: options.seedLimit || options['seed-limit'] || 8 });
  if (!seedTerms.length) {
    throw new Error('missing keyword research input; pass --sku, --terms, --title, or provide a latest snapshot card');
  }
  const frontSearchResults = options.frontSearchResults || await fetchAmazonSearchResults(seedTerms, {
    perTermLimit: options.perTermLimit || options['per-term-limit'] || options.limit,
    waitMs: options.waitMs || options['wait-ms'],
    keepTabOpen: options.keepTabOpen || options['keep-tab-open'],
    background: options.background,
  });
  return run({ ...options, frontSearchResults });
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const terms = [
    ...splitList(options.terms || options['search-terms'] || options.keywords),
    ...positional,
  ];
  const { outputFile, report } = await runLive({
    sku: options.sku,
    asin: options.asin,
    title: options.title,
    description: options.description,
    terms,
    ownAsins: splitList(options.ownAsins || options['own-asins']),
    snapshotFile: options.snapshot || options['snapshot-file'],
    seedLimit: options.seedLimit || options['seed-limit'],
    perTermLimit: options.perTermLimit || options['per-term-limit'] || options.limit,
    keepTabOpen: options.keepTabOpen || options['keep-tab-open'],
    background: options.background === '0' ? false : options.background,
    out: options.out,
  });
  console.log(JSON.stringify({
    ok: report.ok,
    outputFile,
    source: report.source,
    rowCount: report.rowCount,
    searchTermsUsed: report.searchTermsUsed,
    summary: report.operatorSummary.summary,
    opsReadiness: report.opsReadiness,
    nextValidationCommands: report.nextValidationCommands,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildReportFromSearchResults,
  enrichFrontSearchRows,
  fetchAmazonSearchResults,
  inputFromOptions,
  parseArgs,
  run,
  runLive,
};
