const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildAmazonSearchUrl,
  buildKeywordResearchReport,
  buildNextValidationCommands,
  classifyAmazonSearchResults,
  deriveResearchSeedTerms,
  normalizeResearchInput,
} = require('../src/selection_keyword_research');
const { run: runKeywordResearch } = require('../scripts/execute/fetch_selection_keyword_research');

const input = normalizeResearchInput({
  sku: 'DEC1234',
  asin: 'B0OWNASIN01',
  title: 'Patriotic Table Decorations for 4th of July Party, Red White Blue Centerpiece',
  terms: '4th of july table decorations, patriotic party centerpiece',
  ownAsins: ['B0OWNASIN01', 'B0SAMESTORE1'],
  productProfile: {
    productType: 'decor',
    productTypes: ['decor', 'party supplies'],
    occasion: ['4th of july'],
    targetAudience: ['party host'],
    positioning: '4th of july patriotic table decorations',
  },
});

assert.deepStrictEqual(input.terms, [
  '4th of july table decorations',
  'patriotic party centerpiece',
]);
assert.deepStrictEqual(input.ownAsins, ['B0OWNASIN01', 'B0SAMESTORE1']);

const seeds = deriveResearchSeedTerms(input, { limit: 6 });
assert.ok(seeds.some(item => item.term === '4th of july table decorations' && item.source === 'operator_terms'));
assert.ok(seeds.some(item => item.term.includes('patriotic table decorations')));
assert.ok(seeds.every(item => item.term.length <= 80));

assert.strictEqual(
  buildAmazonSearchUrl('patriotic table decorations'),
  'https://www.amazon.com/s?k=patriotic+table+decorations'
);

const classified = classifyAmazonSearchResults({
  input,
  seedTerms: seeds,
  searchResults: [
    {
      asin: 'B0DIRECT001',
      searchTerm: '4th of july table decorations',
      title: '4th of July Table Decorations Patriotic Centerpiece for Party Table',
      price: 16.99,
      rating: 4.6,
      reviewCount: 820,
      position: 1,
      sponsored: true,
      categoryPath: 'Home & Kitchen > Event Decorations',
    },
    {
      asin: 'B0BRIDGE01',
      searchTerm: 'patriotic party centerpiece',
      title: 'Patriotic Table Runner Red White Blue Party Supplies for July 4th Dinner',
      price: 12.99,
      rating: 4.5,
      reviewCount: 3600,
      position: 2,
      sponsored: false,
      categoryPath: 'Kitchen & Dining > Table Runners',
    },
    {
      asin: 'B0NODEONLY1',
      searchTerm: '4th of july table decorations',
      title: '4th of July Dog Costume Stars and Stripes Pet Outfit',
      price: 21.99,
      rating: 4.4,
      reviewCount: 1900,
      position: 3,
      sponsored: false,
      categoryPath: 'Pet Supplies > Dog Apparel',
    },
    {
      asin: 'B0OWNASIN01',
      searchTerm: '4th of july table decorations',
      title: 'Our Patriotic Table Decorations',
      price: 15.99,
      rating: 4.8,
      reviewCount: 110,
      position: 4,
      sponsored: false,
    },
  ],
});

assert.deepStrictEqual(classified.summary, {
  totalSearchResults: 4,
  directCompetitors: 1,
  sceneCompetitors: 1,
  trafficBridgeCompetitors: 0,
  excluded: 2,
});
assert.strictEqual(classified.directCompetitors[0].asin, 'B0DIRECT001');
assert.strictEqual(classified.sceneCompetitors[0].asin, 'B0BRIDGE01');
assert.ok(classified.sceneCompetitors[0].evidenceNotes.some(note => note.includes('category differs but buyer intent is still relevant')));
assert.ok(classified.excludedAsins.some(item => item.asin === 'B0NODEONLY1' && item.excludeReason === 'node_only_without_product_intent'));
assert.ok(classified.excludedAsins.some(item => item.asin === 'B0OWNASIN01' && item.excludeReason === 'own_or_same_store_asin'));

const hatClassified = classifyAmazonSearchResults({
  input: normalizeResearchInput({
    sku: 'GUF3129',
    title: 'Patriotic Bucket Hat American Flag 4th of July Hat',
    terms: 'patriotic bucket hat',
    productProfile: {
      productType: 'apparel',
      productTypes: ['apparel', 'hat'],
      occasion: ['4th of july'],
      positioning: 'patriotic bucket hat',
    },
  }),
  seedTerms: [{ term: 'patriotic bucket hat', source: 'operator_terms' }],
  searchResults: [{
    asin: 'B0HAT00001',
    searchTerm: 'patriotic bucket hat',
    title: 'American Flag Bucket Hat for Women Men Patriotic Fisherman Cap',
    price: 14.99,
    rating: 4.5,
    reviewCount: 560,
    position: 1,
    categoryPath: 'Clothing, Shoes & Jewelry > Hats & Caps',
  }],
});
assert.strictEqual(hatClassified.directCompetitors.length, 1);
assert.strictEqual(hatClassified.directCompetitors[0].asin, 'B0HAT00001');

const correctedByTerms = classifyAmazonSearchResults({
  input: normalizeResearchInput({
    sku: 'GUF3129',
    title: 'nurse gift basket',
    terms: 'patriotic bucket hat',
    productProfile: {
      productType: 'gift basket',
      productTypes: ['gift basket', 'apparel'],
      targetAudience: ['nurse'],
      positioning: 'nurse gift basket',
    },
  }),
  seedTerms: [{ term: 'patriotic bucket hat', source: 'operator_terms' }],
  searchResults: [{
    asin: 'B0HAT00002',
    searchTerm: 'patriotic bucket hat',
    title: 'American Flag Bucket Hat for Women Men Patriotic Fisherman Cap',
    price: 14.99,
    position: 1,
  }],
});
assert.strictEqual(correctedByTerms.directCompetitors.length, 1);
assert.ok(correctedByTerms.directCompetitors[0].evidenceNotes.some(note => note.includes('product_intent_tokens')));

const report = buildKeywordResearchReport({
  input,
  seedTerms: seeds,
  searchResults: classified,
  generatedAt: '2026-05-21T02:00:00.000Z',
});

assert.strictEqual(report.source, 'selection_keyword_research');
assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
assert.ok(report.candidateKeywords.some(item => item.term === '4th of july table decorations'));
assert.ok(report.candidateKeywords.every(item => item.evidence.length > 0));
assert.ok(report.operatorSummary.dataFirstBoundary.includes('hypothesis'));

const commands = buildNextValidationCommands(report);
assert.ok(commands.some(command => command.command.includes('ops:selection:aba-search-terms')));
assert.ok(commands.some(command => command.command.includes('ops:selection:keyword-seasonality')));
assert.ok(commands.some(command => command.command.includes('ops:selection:keyword-conversion')));
assert.ok(commands.every(command => command.riskLevel === 'read_only'));

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyword-research-cli-'));
  const outFile = path.join(tmpDir, 'selection_keyword_research_2026-05-21.json');
  const { outputFile, report: cliReport } = runKeywordResearch({
    sku: 'DEC1234',
    asin: 'B0OWNASIN01',
    title: 'Patriotic Table Decorations for 4th of July Party',
    terms: ['4th of july table decorations'],
    ownAsins: ['B0OWNASIN01'],
    frontSearchResults: [{
      asin: 'B0DIRECT001',
      searchTerm: '4th of july table decorations',
      title: '4th of July Table Decorations Patriotic Centerpiece',
      price: 16.99,
      rating: 4.6,
      reviewCount: 820,
      position: 1,
      categoryPath: 'Home & Kitchen > Event Decorations',
    }],
    out: outFile,
    generatedAt: '2026-05-21T02:00:00.000Z',
  });
  assert.strictEqual(outputFile, outFile);
  assert.ok(fs.existsSync(outFile));
  assert.strictEqual(cliReport.ok, true);
  assert.strictEqual(cliReport.rowCount, 1);
  assert.strictEqual(cliReport.directCompetitorAsins[0].asin, 'B0DIRECT001');

  const slugOutFile = path.join(tmpDir, 'selection_keyword_research_slug_2026-05-21.json');
  const { report: slugReport } = runKeywordResearch({
    sku: 'GUF3129',
    title: 'Patriotic Bucket Hat American Flag 4th of July Hat',
    terms: ['patriotic bucket hat'],
    productProfile: { productType: 'apparel', productTypes: ['apparel', 'hat'], positioning: 'patriotic bucket hat' },
    frontSearchResults: [{
      asin: 'B0HATURL01',
      searchTerm: 'patriotic bucket hat',
      title: 'SponsoredSponsored',
      url: 'https://www.amazon.com/American-Bucket-Packable-Fisherman-Patriotic/dp/B0HATURL01/ref=sr_1_1',
      price: 18.99,
      position: 1,
    }],
    out: slugOutFile,
    generatedAt: '2026-05-21T02:00:00.000Z',
  });
  assert.strictEqual(slugReport.directCompetitorAsins.length, 1);
  assert.match(slugReport.directCompetitorAsins[0].title, /American Bucket Packable Fisherman Patriotic/);
}

console.log('selection_keyword_research.test.js passed');
