const assert = require('assert');
const {
  associatedAsinsForAsset,
  buildAmazonAssetListPayload,
  findAmazonAssetByAsin,
  findAmazonAssetById,
  getAmazonAssetRows,
  normalizeAmazonAsset,
} = require('../src/sbv_asset_library');

{
  const built = buildAmazonAssetListPayload({
    accountId: 867,
    siteId: 4,
    assetType: 'VIDEO',
    brandEntityId: 'ENTITY1G8V2SKJU4J18',
    brandRegistryName: 'Ferrochef',
  });
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestUrl, '/amazonAsset/getAssetList');
  assert.deepStrictEqual(built.requestBody, {
    accountId: 867,
    siteId: 4,
    assetType: 'VIDEO',
    brandEntityId: 'ENTITY1G8V2SKJU4J18',
    brandRegistryName: 'Ferrochef',
    page: 1,
    limit: 20,
    field: 'createdAt',
    order: 'desc',
  });
}

{
  const built = buildAmazonAssetListPayload({
    accountId: 867,
    siteId: 4,
    assetType: 'VIDEO',
    name: 'B0GQMGB44G',
    brandEntityId: 'ENTITY1G8V2SKJU4J18',
    brandRegistryName: 'Ferrochef',
  });
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestBody.name, 'B0GQMGB44G');
}

{
  const built = buildAmazonAssetListPayload({
    accountId: 867,
    siteId: 4,
    assetType: 'IMAGE',
    brandEntityId: 'ENTITY1',
    brandRegistryName: 'Brand',
  });
  assert.strictEqual(built.ok, false);
  assert.ok(built.errors.includes('assetType must be VIDEO for SBV'));
}

{
  const json = {
    data: {
      records: [
        {
          assetId: 'amzn1.assetlibrary.asset1.video123',
          assetName: 'Ferrochef demo video',
          status: 'APPROVED',
          createdAt: '2026-05-26 09:00:00',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          previewUrl: 'https://example.com/video.mp4',
          brandEntityId: 'ENTITY1G8V2SKJU4J18',
          brandRegistryName: 'Ferrochef',
          associatedContexts: '{"ASIN":[{"id":"B0GQMGB44G"}]}',
        },
      ],
    },
  };
  const rows = getAmazonAssetRows(json);
  assert.strictEqual(rows.length, 1);
  const normalized = normalizeAmazonAsset(rows[0]);
  assert.strictEqual(normalized.assetId, 'amzn1.assetlibrary.asset1.video123');
  assert.strictEqual(normalized.name, 'Ferrochef demo video');
  assert.strictEqual(normalized.status, 'APPROVED');
  assert.strictEqual(normalized.thumbnailUrl, 'https://example.com/thumb.jpg');
  assert.deepStrictEqual(normalized.associatedAsins, ['B0GQMGB44G']);
  assert.deepStrictEqual(associatedAsinsForAsset(rows[0]), ['B0GQMGB44G']);
  assert.strictEqual(findAmazonAssetById(rows, 'amzn1.assetlibrary.asset1.video123').name, 'Ferrochef demo video');
  assert.strictEqual(findAmazonAssetByAsin(rows, 'B0GQMGB44G').assetId, 'amzn1.assetlibrary.asset1.video123');
  assert.strictEqual(findAmazonAssetById(rows, 'missing'), null);
  assert.strictEqual(findAmazonAssetByAsin(rows, 'B000000000'), null);
}

console.log('sbv asset library tests passed');
