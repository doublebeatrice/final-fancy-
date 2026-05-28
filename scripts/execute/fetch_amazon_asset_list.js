const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { findAdPageId } = require('../../src/adjust_lib');
const {
  buildAmazonAssetListPayload,
  findAmazonAssetByAsin,
  findAmazonAssetById,
  getAmazonAssetRows,
  normalizeAmazonAssets,
} = require('../../src/sbv_asset_library');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

function parseArgs(args = []) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    out[key] = inlineValue !== undefined ? inlineValue : args[i + 1];
    if (inlineValue === undefined) i += 1;
  }
  return out;
}

function evalInTab(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('DevTools evaluation timed out'));
    }, 120000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) {
        reject(new Error(JSON.stringify(response.error)));
        return;
      }
      resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true },
    }));
  });
}

async function fetchAmazonAssetList(options = {}) {
  const built = buildAmazonAssetListPayload(options);
  if (!built.ok) {
    throw new Error(`Invalid asset list payload: ${built.errors.join(', ')}`);
  }

  const pageId = await findAdPageId();
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${pageId}`);
  await new Promise(resolve => ws.on('open', resolve));

  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch(${JSON.stringify(built.requestUrl)}, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
        body: ${JSON.stringify(JSON.stringify(built.requestBody))}
      });
      const text = await res.text();
      if (text.trimStart().startsWith('<')) {
        return JSON.stringify({ ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready', text: text.slice(0, 500) });
      }
      try { return JSON.stringify({ ok: res.ok, status: res.status, json: JSON.parse(text) }); }
      catch (error) { return JSON.stringify({ ok: false, status: res.status, error: error.message, text: text.slice(0, 1000) }); }
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  const result = JSON.parse(raw || '{}');
  const rows = getAmazonAssetRows(result.json || {});
  const normalizedAssets = normalizeAmazonAssets(rows);
  const matchedAsset = findAmazonAssetById(rows, options.assetId || options.videoAssetId || '');
  const matchedAssetByAsin = findAmazonAssetByAsin(rows, options.asin || options.name || '');
  const report = {
    exportedAt: new Date().toISOString(),
    source: built.requestUrl,
    ok: !!result.ok,
    status: result.status,
    requestBody: built.requestBody,
    rowCount: rows.length,
    normalizedAssets,
    matchedAsset: matchedAsset || matchedAssetByAsin,
    matchedAssetByAsin,
    raw: result.json || result,
  };

  const outputFile = options.out || options.output || path.join(
    OUT_DIR,
    `amazon_asset_video_${built.requestBody.accountId}_${built.requestBody.brandEntityId}_${new Date().toISOString().slice(0, 10)}.json`
  );
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { ...report, outputFile };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await fetchAmazonAssetList({
    accountId: args.accountId || process.env.ACCOUNT_ID,
    siteId: args.siteId || process.env.SITE_ID || 4,
    brandEntityId: args.brandEntityId || args.brand || process.env.BRAND_ENTITY_ID,
    brandRegistryName: args.brandRegistryName || args.brandName || process.env.BRAND_REGISTRY_NAME,
    name: args.name || args.assetName || args.search || process.env.ASSET_NAME,
    asin: args.asin || process.env.ASIN,
    page: args.page || 1,
    limit: args.limit || 20,
    field: args.field || 'createdAt',
    order: args.order || 'desc',
    assetId: args.assetId || args.videoAssetId || process.env.ASSET_ID,
    out: args.out || args.output,
  });
  console.log(JSON.stringify({
    outputFile: report.outputFile,
    ok: report.ok,
    status: report.status,
    rowCount: report.rowCount,
    matchedAsset: report.matchedAsset,
    sampleAssets: report.normalizedAssets.slice(0, 5),
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  fetchAmazonAssetList,
  parseArgs,
};
