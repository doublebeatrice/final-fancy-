const assert = require('assert');
const {
  buildAdCampaignPayload,
  buildAdGroupPayload,
  buildAdSearchTermPayload,
  buildAdXrayReport,
  buildRecommendationCampaignPayload,
  extractAdCampaignResult,
  extractAdGroupResult,
  extractAdSearchTermResult,
  extractRecommendationResult,
  parseArgs,
  readAsinInput,
} = require('../scripts/execute/fetch_sif_ad_xray');

{
  const { options, positional } = parseArgs([
    '--asin', 'b0c1nf986w',
    '--page-size=10',
    '--granularity', 'week',
    'B0TESTASIN',
  ]);
  assert.strictEqual(options.asin, 'b0c1nf986w');
  assert.strictEqual(options['page-size'], '10');
  assert.strictEqual(options.granularity, 'week');
  assert.deepStrictEqual(positional, ['B0TESTASIN']);
  assert.strictEqual(readAsinInput(options, positional), 'B0C1NF986W');
}

assert.deepStrictEqual(
  buildAdCampaignPayload({ asin: 'b0c1nf986w', pageSize: 10 }),
  {
    granularity: 'week',
    asin: 'B0C1NF986W',
    pageNum: 1,
    pageSize: 10,
    conditions: {
      from: null,
      to: null,
      asin: null,
      campaignId: '',
      encryptCampaignId: '',
    },
    sortBy: 'campaign',
    desc: true,
    isAsinSearch: false,
  }
);

assert.deepStrictEqual(
  buildAdGroupPayload({ asin: 'b0c1nf986w', pageSize: 10 }),
  {
    lastMonths: 6,
    adShowId: '',
    campaignShowId: '',
    granularity: 'week',
    asin: 'B0C1NF986W',
    desc: true,
    groupByCampaign: false,
    pageNum: 1,
    pageSize: 10,
    conditions: {
      from: null,
      to: null,
      asin: '',
      campaignId: '',
      encryptCampaignId: '',
      encryptAdId: '',
    },
  }
);

assert.deepStrictEqual(
  buildAdSearchTermPayload({ asin: 'b0c1nf986w', pageSize: 10 }),
  {
    asin: 'B0C1NF986W',
    timePieceType: 'latelyDay',
    latelyDay: 7,
    month: '',
    week: '',
    sortBy: 'spScoreRatio',
    desc: true,
    pageNum: 1,
    pageSize: 10,
    searchKeyword: '',
  }
);

assert.strictEqual(buildRecommendationCampaignPayload({ asin: 'b0c1nf986w' }).sortBy, 'ratio');

{
  const campaigns = extractAdCampaignResult({
    status: 200,
    json: {
      code: 1,
      data: {
        total: 25,
        adNum: 25,
        spNum: 21,
        sbNum: 2,
        sbvNum: 2,
        campaigns: [
          {
            adType: 1,
            fakeCampaignId: 'QSC1',
            encryptCampaignId: 'A05491492QC7H90SGQSC1',
            campaignCreatedAt: '2026-05-28',
            lastAdCreatedAt: '2026-05-28',
            asinNum: 1,
            adNum: 1,
            strategy: 'single ad group',
            flows: [{}, {}],
          },
        ],
      },
    },
  });
  assert.strictEqual(campaigns.ok, true);
  assert.strictEqual(campaigns.total, 25);
  assert.strictEqual(campaigns.spCount, 21);
  assert.strictEqual(campaigns.rows[0].campaignIdSuffix, 'QSC1');
  assert.strictEqual(campaigns.rows[0].flowCount, 2);
}

{
  const groups = extractAdGroupResult({
    status: 200,
    json: {
      code: 1,
      data: {
        total: 15,
        campaignTotal: 10,
        spNum: 12,
        adInfo: [
          {
            fakeCampaignId: 'QSC1',
            fakeAdId: '0YGR',
            asin: 'B0C1NF986W',
            title: 'Rainbow Plastic Tablecloth',
            price: '8.99',
            history: [{}, {}, {}],
          },
        ],
      },
    },
  });
  assert.strictEqual(groups.ok, true);
  assert.strictEqual(groups.total, 15);
  assert.strictEqual(groups.rows[0].adIdSuffix, '0YGR');
  assert.strictEqual(groups.rows[0].historyPoints, 3);
}

{
  const terms = extractAdSearchTermResult({
    status: 200,
    json: {
      code: 1,
      data: {
        granularity: 'week',
        total: 15,
        adIdTotalNum: 8,
        campaignIdTotalNum: 5,
        variantTotalNum: 1,
        keywords: [
          {
            keyword: 'rainbow decorations',
            translateKeyword: '彩虹装饰品',
            adIdNum: 1,
            campaignIdNum: 1,
            variantNum: 1,
            estSearchesNum: 2186,
            searchesRank: 159886,
            spScoreRatio: 0.3579751178,
            kwSpScoreRatio: 0.0827653706,
            clickPurchaseRatio: 0.11623616,
            asins: ['B0C1NF986W'],
          },
        ],
      },
    },
  });
  assert.strictEqual(terms.ok, true);
  assert.strictEqual(terms.total, 15);
  assert.strictEqual(terms.rows[0].keyword, 'rainbow decorations');
  assert.strictEqual(terms.rows[0].estimatedSearches, 2186);
}

{
  const recs = extractRecommendationResult(
    { status: 200, json: { code: 1, data: { recCnt: 6, campaignCnt: 5, keywordCnt: 34 } } },
    {
      status: 200,
      json: {
        code: 1,
        data: {
          list: [
            {
              recTitle: 'Trending now',
              ratio: 0.61860632,
              manualRatio: 0,
              autoRatio: 0,
              campaignCnt: 5,
              keywordCnt: 34,
              lastCampaignCnt: 3,
              lastKeywordCnt: 15,
            },
          ],
        },
      },
    },
    {
      status: 200,
      json: {
        code: 1,
        data: {
          total: 5,
          list: [
            {
              maskCampaignId: 'FN9A',
              ratio: 0.58277671,
              recCnt: 4,
              recDetail: { 'Trending now': {} },
            },
          ],
        },
      },
    },
  );
  assert.strictEqual(recs.ok, true);
  assert.strictEqual(recs.overview.recommendationCount, 6);
  assert.strictEqual(recs.rows[0].title, 'Trending now');
  assert.deepStrictEqual(recs.campaigns[0].recommendationTitles, ['Trending now']);
}

{
  const report = buildAdXrayReport({
    asin: 'B0C1NF986W',
    country: 'US',
    request: {},
    tokenState: { hasToken: true, tokenLength: 32 },
    adCampaigns: { ok: true, total: 1, adCount: 1, spCount: 1, sbCount: 0, sbvCount: 0, rows: [{ campaignIdSuffix: 'QSC1' }] },
    adGroups: { ok: true, total: 1, rows: [{ adIdSuffix: '0YGR' }] },
    adSearchTerms: { ok: true, total: 1, rows: [{ keyword: 'rainbow decorations' }] },
    recommendations: { ok: true, overview: { recommendationCount: 1, campaignCount: 1, keywordCount: 1 }, rows: [{ title: 'Trending now' }], campaigns: [] },
    generatedAt: '2026-06-02T00:00:00.000Z',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.source, 'sif_direct');
  assert.strictEqual(report.mode, 'ad_xray');
  assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
  assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
}

console.log('sif_ad_xray.test.js passed');
