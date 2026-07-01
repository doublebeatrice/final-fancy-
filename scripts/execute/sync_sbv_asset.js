'use strict';

// Sync a company-library video asset (already in the internal OSS store, surfaced
// by /amazonAsset/getExternalAssetUrl) into the Amazon Asset Library so SBV create
// can bind it by ASIN. Reverse-engineered from the SB creative frontend bundle:
//
//   Path A (cheap, reversible): /amazonAsset/syncAsset {siteId,accountId,assetName}
//     — works when the asset is already registered internally and just needs to be
//       pushed to Amazon. assetName = the OSS fileName.
//   Path B (full upload): /sbProduct/getUploadAssetUrl -> PUT bytes -> /sbProduct/registerAsset
//     -> /amazonAsset/syncAsset. Used only if Path A does not land the asset.
//
// Landing is verified independently by re-reading /amazonAsset/getAssetList and
// checking the asset now appears bound to the target ASIN (not by trusting the
// sync API's own 200). Default is dry-run; pass --execute to actually sync.
//
// Usage:
//   node scripts/execute/sync_sbv_asset.js --sku YUT2840 [--execute] [--full-upload]
//   node scripts/execute/sync_sbv_asset.js --sku YUT2840 --account-id 737 --asin B0BDRJ2D98 --execute

const fs = require('fs');
const path = require('path');

const { openAdvWs, advRequest, resolveSkuAccount } = require('../../src/adv_backend');
const {
  buildAmazonAssetListPayload,
  getAmazonAssetRows,
  findAmazonAssetByAsin,
  normalizeAmazonAssets,
} = require('../../src/sbv_asset_library');

const ROOT = path.join(__dirname, '..', '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (inlineValue !== undefined) { out[key] = inlineValue; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; }
    else { out[key] = next; i += 1; }
  }
  return out;
}

function todayYmd() { return new Date().toISOString().slice(0, 10); }

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

// Mirror sbv_create_flow.fetchBrand: prefer ASIN-bound brand from getExternalAssetUrl,
// which also returns the OSS external assets (the pending-sync videos).
async function fetchBrandAndExternal(ws, { siteId, accountId, asin }) {
  const resp = await advRequest(ws, 'POST', '/amazonAsset/getExternalAssetUrl', {
    type: 'video',
    siteId,
    skuOrAsin: asin,
    accountId,
  });
  const data = resp?.json?.data || {};
  const brandInfo = data.brandInfo || {};
  const externalAssets = Array.isArray(data.assets) ? data.assets : [];
  return {
    brandEntityId: brandInfo.brandEntityId || '',
    brandRegistryName: brandInfo.brandRegistryName || '',
    externalAssets,
    response: resp,
  };
}

async function readAmazonAssetByAsin(ws, { accountId, siteId, brandEntityId, brandRegistryName, asin }) {
  const built = buildAmazonAssetListPayload({
    accountId, siteId, brandEntityId, brandRegistryName, name: asin, asin, limit: 50,
  });
  if (!built.ok) return { ok: false, errors: built.errors, matched: null, rowCount: 0 };
  const resp = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
  const rows = getAmazonAssetRows(resp.json || {});
  return {
    ok: true,
    rowCount: rows.length,
    matched: findAmazonAssetByAsin(rows, asin),
    normalized: normalizeAmazonAssets(rows),
    response: resp,
  };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Mirror SyncAssetDialog.normalizeRemoteUrl: re-encode each path segment so a
// Chinese filename in the OSS URL is valid when Amazon pulls it server-side.
function normalizeRemoteUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.pathname = u.pathname.split('/').map(seg => {
      if (!seg) return seg;
      try { return encodeURIComponent(decodeURIComponent(seg)); }
      catch (_) { return encodeURIComponent(seg); }
    }).join('/');
    return u.toString();
  } catch (_) {
    return encodeURI(raw);
  }
}

// Mirror SyncAssetDialog.parseFileName: split at the last dot.
function parseFileName(fileName) {
  const s = String(fileName || '');
  const dot = s.lastIndexOf('.');
  if (dot < 0) return { name: s, extension: '' };
  return { name: s.substring(0, dot), extension: s.substring(dot) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const execute = !!args.execute;
  const date = args.date || todayYmd();
  const sku = String(args.sku || '').trim().toUpperCase();
  let siteId = Number(args.siteId || 4);
  let accountId = Number(args.accountId);
  let asin = String(args.asin || '').trim().toUpperCase();

  const out = {
    exportedAt: new Date().toISOString(),
    dryRun: !execute,
    sku, accountId: accountId || null, asin: asin || null, siteId,
    resolved: null, brand: null, externalAsset: null,
    before: null, syncAttempts: [], after: null,
    landed: false, reason: '',
  };
  const outFile = path.join(ROOT, 'data', 'actions', `sbv_asset_sync_${sku || 'unknown'}_${date}.json`);

  if (!sku && (!accountId || !asin)) {
    out.reason = 'need --sku, or both --account-id and --asin';
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = 2;
    return;
  }

  const ws = await openAdvWs();
  try {
    if (sku && (!accountId || !asin)) {
      const r = await resolveSkuAccount(ws, sku, siteId);
      out.resolved = r.ok
        ? { accountId: r.accountId, asin: r.asin, siteId: r.siteId, existingCampaigns: r.rowCount }
        : { error: r.error };
      if (r.ok) {
        accountId = accountId || r.accountId;
        asin = asin || r.asin;
        if (r.siteId) siteId = r.siteId;
        out.accountId = accountId; out.asin = asin; out.siteId = siteId;
      } else {
        out.reason = 'sku_resolve_failed';
        return;
      }
    }

    const brand = await fetchBrandAndExternal(ws, { siteId, accountId, asin });
    out.brand = { brandEntityId: brand.brandEntityId, brandRegistryName: brand.brandRegistryName };
    out.externalAsset = (brand.externalAssets[0] || null) && {
      fileName: brand.externalAssets[0].fileName || '',
      assetType: brand.externalAssets[0].assetType || '',
      url: (brand.externalAssets[0].url || '').slice(0, 120),
      count: brand.externalAssets.length,
    };
    if (!brand.brandEntityId || !brand.brandRegistryName) {
      out.reason = 'brand_missing';
      return;
    }

    // Independent state BEFORE: is the asset already in the Amazon library by ASIN?
    const before = await readAmazonAssetByAsin(ws, { accountId, siteId, ...brand, asin });
    out.before = { rowCount: before.rowCount, matched: before.matched ? { assetId: before.matched.assetId, name: before.matched.name, asins: before.matched.associatedAsins } : null };
    if (before.matched?.assetId) {
      out.landed = true;
      out.reason = 'already_in_amazon_library';
      return;
    }

    const externalFileName = brand.externalAssets[0]?.fileName || '';
    if (!externalFileName) {
      out.reason = 'no_external_asset_to_sync';
      return;
    }

    if (!execute) {
      out.reason = 'dry-run: would uploadAsset (server-side pull) fileName=' + externalFileName;
      out.landed = false;
      return;
    }


    // Path B: server-side pull via /amazonAsset/uploadAsset. This is what the
    // SyncAssetDialog "同步" button does — Amazon ingests the OSS URL directly
    // (no byte re-upload). assetSubTypeList is the fixed literal "LIFESTYLE_IMAGE"
    // even for video; videoType is query-only and not part of this payload.
    const ext = brand.externalAssets[0] || {};
    const ossUrl = ext.url || '';
    const parsed = parseFileName(ext.fileName || '');
    const fileList = [{
      url: normalizeRemoteUrl(ossUrl),
      name: parsed.name + parsed.extension,
    }];
    const uploadPayload = {
      siteId,
      accountId,
      fileList,
      assetType: 'VIDEO',
      assetSubTypeList: 'LIFESTYLE_IMAGE',
      brandEntityId: brand.brandEntityId,
      brandRegistryName: brand.brandRegistryName,
      source: '',
    };
    const uploadResp = await advRequest(ws, 'POST', '/amazonAsset/uploadAsset', uploadPayload);
    out.syncAttempts.push({ path: 'B:uploadAsset', code: uploadResp?.json?.code ?? null, msg: uploadResp?.json?.msg || '', status: uploadResp.status });

    // Amazon ingests/transcodes/moderates asynchronously — readback with backoff.
    let afterB = null;
    for (const delayMs of [5000, 20000, 40000]) {
      await sleep(delayMs);
      afterB = await readAmazonAssetByAsin(ws, { accountId, siteId, ...brand, asin });
      if (afterB.matched?.assetId) break;
    }
    out.after = { rowCount: afterB.rowCount, matched: afterB.matched ? { assetId: afterB.matched.assetId, name: afterB.matched.name, asins: afterB.matched.associatedAsins } : null };
    if (afterB.matched?.assetId) {
      out.landed = true;
      out.reason = 'synced_via_path_B_uploadAsset';
    } else if (Number(uploadResp?.json?.code) === 200) {
      out.reason = 'uploadAsset_accepted_pending_amazon_ingest; asset not yet visible in library (async moderation/transcode). Re-run readback later.';
    } else {
      out.reason = 'uploadAsset_failed: ' + (uploadResp?.json?.msg || ('code ' + uploadResp?.json?.code));
    }
  } finally {
    try { ws.close(); } catch (_) {}
    out.outFile = writeJson(outFile, out);
    console.log(JSON.stringify(out, null, 2));
  }
}

main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
