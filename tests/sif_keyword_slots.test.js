const assert = require('assert');
const {
  buildCompetitionPatternPayload,
  buildKeywordSlotReport,
  buildPositionCountPayload,
  buildSnapshotPayload,
  extractCompetitionPatternResult,
  extractPositionCountResult,
  extractSnapshotResult,
  flattenSnapshotSlots,
  parseArgs,
  readKeywordInput,
} = require('../scripts/execute/fetch_sif_keyword_slots');

{
  const { options, positional } = parseArgs([
    '--keyword', 'rainbow tablecloth',
    '--keywords=balloon pump,party favors',
    '--page-size', '10',
    'table runner',
  ]);
  assert.strictEqual(options.keyword, 'rainbow tablecloth');
  assert.strictEqual(options.keywords, 'balloon pump,party favors');
  assert.strictEqual(options['page-size'], '10');
  assert.deepStrictEqual(positional, ['table runner']);
  assert.deepStrictEqual(
    readKeywordInput(options, positional),
    ['rainbow tablecloth', 'balloon pump', 'party favors', 'table runner']
  );
}

assert.deepStrictEqual(
  buildPositionCountPayload({ keywords: ['rainbow tablecloth'], pageSize: 10 }),
  {
    isExpand: true,
    keywords: ['rainbow tablecloth'],
    pageNum: 1,
    pageSize: 10,
    desc: true,
    trendType: 'week',
    sortBy: 'estSearchesNum',
  }
);

assert.deepStrictEqual(
  buildCompetitionPatternPayload({ keyword: 'rainbow tablecloth', pageSize: 10 }),
  {
    timePieceType: 'latelyDay',
    timePieceValue: '7',
    pageNum: 1,
    pageSize: 10,
    sortBy: 'nfScoreRatio',
    desc: true,
    keyword: 'rainbow tablecloth',
    searchValue: '',
  }
);

assert.deepStrictEqual(
  buildSnapshotPayload({ keyword: 'balloon pump' }),
  {
    keyword: 'balloon pump',
    adType: 'sp',
  }
);

{
  const positionCounts = extractPositionCountResult({
    status: 200,
    json: {
      code: 1,
      data: {
        total: 4,
        keywords: [
          {
            keyword: 'rainbow tablecloth',
            translateKeyword: '彩虹桌布',
            estSearchesNum: 2712,
            searchesRank: 127706,
            saleNum: 38793,
            nfAsinNum: 211,
            spAsinNum: 58,
            brandAsinNum: 59,
            videoAsinNum: 20,
            ppcAsinNum: 130,
            recommendedAsinNum: 65,
            conversionShared: 0.2138,
            clickShared: 0.2365,
          },
        ],
      },
    },
  });
  assert.strictEqual(positionCounts.ok, true);
  assert.strictEqual(positionCounts.total, 4);
  assert.strictEqual(positionCounts.rows[0].naturalAsinCount, 211);
  assert.strictEqual(positionCounts.rows[0].spAsinCount, 58);
}

{
  const pattern = extractCompetitionPatternResult({
    status: 200,
    json: {
      code: 1,
      data: {
        total: 327,
        asins: [
          {
            asin: 'B09V3F82SJ',
            title: 'Rainbow Plastic Tablecloth',
            price: 5.29,
            ratingNum: 1060,
            score: 4.6,
            star: 4.5,
            boughtInPastMonth: '50+',
            nfScoreRatio: 0.11945912,
            spScoreRatio: 0,
            brandAdScoreRatio: 0,
            hasVaiants: false,
          },
        ],
      },
    },
  });
  assert.strictEqual(pattern.ok, true);
  assert.strictEqual(pattern.total, 327);
  assert.strictEqual(pattern.rows[0].asin, 'B09V3F82SJ');
  assert.strictEqual(pattern.rows[0].naturalScoreRatio, 0.11945912);
}

{
  const slots = flattenSnapshotSlots([
    {
      hourAsins: [
        [
          {
            adType: 'sp',
            asin: 'B0DXL6YF37',
            title: 'Balloon Pump',
            price: 5.99,
            ratingNum: 164,
            score: 4.2,
            fakeCampaignId: 'OWGP',
            campaignId: 'A02010791MF2IP1OTOWGP',
            rankStr: 'p1,1/12',
            rank: 1,
            pageNo: 1,
            pageRank: 1,
            position: '1-1-12',
            timeFormat: '2026-06-02 15:00:00',
            keyword: 'balloon pump',
          },
        ],
      ],
    },
  ]);
  assert.strictEqual(slots.length, 1);
  assert.strictEqual(slots[0].asin, 'B0DXL6YF37');
  assert.strictEqual(slots[0].campaignIdSuffix, 'OWGP');
}

{
  const snapshot = extractSnapshotResult(
    {
      status: 200,
      json: {
        code: 1,
        data: {
          flag: 1,
          searchTime: '2026-06-02 15:00:00',
          table: [
            {
              hourAsins: [
                [
                  {
                    adType: 'sp',
                    asin: 'B0DXL6YF37',
                    rankStr: 'p1,1/12',
                    rank: 1,
                    position: '1-1-12',
                    timeFormat: '2026-06-02 15:00:00',
                  },
                ],
              ],
            },
          ],
        },
      },
    },
    { status: 200, json: { code: 1, data: { total: 1, record: ['balloon pump'] } } },
  );
  assert.strictEqual(snapshot.ok, true);
  assert.strictEqual(snapshot.monitored, true);
  assert.strictEqual(snapshot.slotRows, 1);
  assert.strictEqual(snapshot.suggestion.total, 1);
}

{
  const report = buildKeywordSlotReport({
    country: 'US',
    keywords: ['rainbow tablecloth'],
    request: {},
    tokenState: { hasToken: true, tokenLength: 32 },
    positionCounts: {
      ok: true,
      rows: [{ keyword: 'rainbow tablecloth', naturalAsinCount: 211 }],
    },
    keywordReports: {
      'rainbow tablecloth': {
        competition: { ok: true, rows: [{ asin: 'B09V3F82SJ' }] },
        snapshot: { ok: true, monitored: false, searchTime: '', slotRows: 0, message: '未监控该词', slots: [] },
      },
    },
    generatedAt: '2026-06-02T00:00:00.000Z',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.source, 'sif_direct');
  assert.strictEqual(report.mode, 'keyword_slots');
  assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
  assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
}

console.log('sif_keyword_slots.test.js passed');
