const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_SNAPSHOT = path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
const DEFAULT_LISTING_CACHE = path.join(ROOT, 'data', 'listing_cache.json');
const DEFAULT_PRODUCT_PROFILES = path.join(ROOT, 'data', 'product_profiles.json');

const CNA_AD_PATTERN = /\bcna\b|nurses?\b|nursing|healthcare|caregiver|medical assistant|hospital|rn gifts?|nurse assistant/i;
const SKU_PATTERN = /\b[A-Z]{2,5}\d{3,5}\b/g;

const LEVEL_ORDER = {
  '历史成交必看': 0,
  '强候选': 1,
  '可蹭候选': 2,
  '弱候选待审': 3,
  '排除': 4,
};

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: DEFAULT_DATE,
    stockMin: 10,
    candidateLimit: 180,
    maxImagesPerSku: 4,
    downloadImages: true,
    snapshot: DEFAULT_SNAPSHOT,
    listingCache: DEFAULT_LISTING_CACHE,
    productProfiles: DEFAULT_PRODUCT_PROFILES,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') out.date = String(argv[++i] || out.date);
    else if (arg === '--stock-min') out.stockMin = Number(argv[++i] || out.stockMin);
    else if (arg === '--candidate-limit') out.candidateLimit = Number(argv[++i] || out.candidateLimit);
    else if (arg === '--max-images-per-sku') out.maxImagesPerSku = Number(argv[++i] || out.maxImagesPerSku);
    else if (arg === '--snapshot') out.snapshot = path.resolve(argv[++i] || out.snapshot);
    else if (arg === '--listing-cache') out.listingCache = path.resolve(argv[++i] || out.listingCache);
    else if (arg === '--product-profiles') out.productProfiles = path.resolve(argv[++i] || out.productProfiles);
    else if (arg === '--no-download') out.downloadImages = false;
  }
  return out;
}

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function num(value) {
  const n = Number(String(value ?? '').replace(/[$,%\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function uniq(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function htmlEscape(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvCell(value) {
  const raw = Array.isArray(value) ? value.join('; ') : text(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function listingDomainForSalesChannel(salesChannel = '') {
  const channel = text(salesChannel);
  if (!channel || channel === 'Amazon.com') return 'amazon.com';
  if (channel === 'Amazon.co.uk') return 'amazon.co.uk';
  return '';
}

function listingMapKey(domain, asin) {
  return `${lower(domain || 'amazon.com')}|${text(asin).toUpperCase()}`;
}

function inventoryBreakdown(card = {}) {
  const stockFul = num(card.stockFul);
  const stockRes = num(card.stockRes);
  const stockInb = num(card.stockInb) + num(card.stockInbAir);
  const localAvailable = num(card.localAvailableForPlan);
  const total = stockFul + stockRes + stockInb + localAvailable;
  return {
    total,
    stockFul,
    stockRes,
    stockInb,
    localAvailable,
    label: `total=${total}; FBA=${stockFul}; reserved=${stockRes}; inbound=${stockInb}; local=${localAvailable}`,
  };
}

function loadProductProfiles(file) {
  const raw = readJson(file, {});
  const source = raw.profiles || raw.items || raw;
  const values = Array.isArray(source) ? source : Object.values(source || {});
  const map = new Map();
  for (const profile of values) {
    const sku = text(profile?.sku).toUpperCase();
    if (sku) map.set(sku, profile);
  }
  return map;
}

function listingFromCache(cache = {}, domain, asin) {
  const entry = cache.entries?.[listingMapKey(domain, asin)];
  return entry?.payload || null;
}

function listingForCard(card = {}, listingCache = {}) {
  const domain = listingDomainForSalesChannel(card.salesChannel);
  const cached = listingFromCache(listingCache, domain, card.asin);
  return card.listing || cached || {};
}

function imageUrlsFromListing(listing = {}) {
  return uniq([
    listing.mainImageUrl,
    ...(Array.isArray(listing.imageUrls) ? listing.imageUrls : []),
  ]).filter(url => /^https?:\/\//i.test(url));
}

function shortMetricEvidence(ev = {}) {
  const parts = [];
  if (ev.orders > 0) parts.push(`orders=${ev.orders}`);
  if (ev.clicks > 0) parts.push(`clicks=${ev.clicks}`);
  if (ev.impressions > 0) parts.push(`impr=${ev.impressions}`);
  if (ev.sales > 0) parts.push(`sales=${ev.sales.toFixed(2)}`);
  return parts.join(', ') || 'term hit';
}

function addEvidence(evidenceBySku, sku, item = {}) {
  const normalizedSku = text(sku).toUpperCase();
  if (!normalizedSku) return;
  if (!evidenceBySku.has(normalizedSku)) {
    evidenceBySku.set(normalizedSku, {
      sku: normalizedSku,
      orders: 0,
      sales: 0,
      clicks: 0,
      impressions: 0,
      events: 0,
      sources: new Set(),
      samples: [],
      dedupe: new Set(),
    });
  }
  const bucket = evidenceBySku.get(normalizedSku);
  const sampleText = text(item.text || item.keywordText || item.name || item.source || '');
  const key = `${item.source || item.kind || 'history'}|${sampleText.slice(0, 180)}|${item.orders || 0}|${item.clicks || 0}|${item.impressions || 0}`;
  if (bucket.dedupe.has(key)) return;
  bucket.dedupe.add(key);
  const orders = num(item.orders);
  const sales = num(item.sales);
  const clicks = num(item.clicks);
  const impressions = num(item.impressions);
  bucket.orders += orders;
  bucket.sales += sales;
  bucket.clicks += clicks;
  bucket.impressions += impressions;
  bucket.events += 1;
  if (item.source || item.kind) bucket.sources.add(text(item.source || item.kind));
  if (bucket.samples.length < 5) {
    bucket.samples.push({
      source: text(item.source || item.kind || 'history'),
      text: sampleText,
      orders,
      sales,
      clicks,
      impressions,
    });
  }
}

function collectCurrentAdEvidence(snapshot = {}) {
  const evidenceBySku = new Map();
  const productByGroup = new Map();

  for (const row of snapshot.productAdRows || []) {
    const key = `${text(row.campaignId)}::${text(row.adGroupId)}`;
    if (!productByGroup.has(key)) productByGroup.set(key, new Set());
    const sku = text(row.sku).toUpperCase();
    if (sku) productByGroup.get(key).add(sku);
  }

  for (const [kind, rows] of [
    ['kwRows', snapshot.kwRows || []],
    ['autoRows', snapshot.autoRows || []],
    ['targetRows', snapshot.targetRows || []],
  ]) {
    for (const row of rows) {
      const combined = [
        row.campaignName,
        row.groupName,
        row.keywordText,
        row.type,
        row.remark,
      ].join(' ');
      if (!CNA_AD_PATTERN.test(combined)) continue;
      const skus = productByGroup.get(`${text(row.campaignId)}::${text(row.adGroupId)}`) || new Set();
      for (const sku of skus) {
        addEvidence(evidenceBySku, sku, {
          kind,
          source: 'latest_snapshot',
          text: [row.campaignName, row.groupName, row.keywordText || row.type].filter(Boolean).join(' | '),
          orders: row.Orders || row.orders7 || row.orders3,
          sales: row.Sales || row.sales7 || row.sales3,
          clicks: row.Clicks || row.clicks7 || row.clicks3,
          impressions: row.Impressions || row.impressions7 || row.impressions3,
        });
      }
    }
  }

  for (const row of snapshot.productAdRows || []) {
    const combined = [row.campaignName, row.groupName, row.moduleName].join(' ');
    if (!CNA_AD_PATTERN.test(combined)) continue;
    addEvidence(evidenceBySku, row.sku, {
      kind: 'productAdRows',
      source: 'latest_snapshot',
      text: [row.campaignName, row.groupName, row.moduleName].filter(Boolean).join(' | '),
      orders: row.Orders,
      sales: row.Sales,
      clicks: row.Clicks,
      impressions: row.Impressions,
    });
  }

  return evidenceBySku;
}

function mergeEvidence(target, source) {
  for (const [sku, bucket] of source.entries()) {
    for (const sample of bucket.samples.length ? bucket.samples : [{ source: 'history' }]) {
      addEvidence(target, sku, {
        source: sample.source || [...bucket.sources][0] || 'history',
        text: sample.text || '',
        orders: sample.orders || 0,
        sales: sample.sales || 0,
        clicks: sample.clicks || 0,
        impressions: sample.impressions || 0,
      });
    }
  }
  return target;
}

function compactObjectText(value, depth = 0, limit = 40000) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return text(value);
  if (depth > 4) return '';
  if (Array.isArray(value)) {
    const parts = [];
    for (const item of value.slice(0, 80)) {
      parts.push(compactObjectText(item, depth + 1, limit));
      if (parts.join(' ').length > limit) break;
    }
    return parts.join(' ').slice(0, limit);
  }
  if (typeof value === 'object') {
    const parts = [];
    for (const [key, item] of Object.entries(value)) {
      if (/rawResponse|apiResponse|bodyPreview/i.test(key)) continue;
      parts.push(`${key}:${compactObjectText(item, depth + 1, limit)}`);
      if (parts.join(' ').length > limit) break;
    }
    return parts.join(' ').slice(0, limit);
  }
  return '';
}

function knownSkusFromText(value, knownSkuSet) {
  const hits = text(value).match(SKU_PATTERN) || [];
  return uniq(hits.map(sku => sku.toUpperCase())).filter(sku => knownSkuSet.has(sku));
}

function collectHistoricalFileEvidence(files = [], knownSkuSet = new Set()) {
  const evidenceBySku = new Map();

  function maybeRecord(obj, source, depth) {
    if (!obj || typeof obj !== 'object' || depth <= 0) return;
    const content = compactObjectText(obj);
    if (!CNA_AD_PATTERN.test(content)) return;
    const explicitSkus = [
      obj.sku,
      obj.SKU,
      obj.sellerSku,
      obj.targetSku,
      obj.entitySku,
      obj?.payload?.sku,
      obj?.action?.sku,
      obj?.requestBody?.skuArray,
    ].flat().map(text);
    const skus = uniq([
      ...explicitSkus,
      ...knownSkusFromText(content, knownSkuSet),
    ].map(sku => sku.toUpperCase())).filter(sku => knownSkuSet.has(sku));
    for (const sku of skus) {
      addEvidence(evidenceBySku, sku, {
        source: path.basename(source),
        text: content.replace(/\s+/g, ' ').slice(0, 260),
        orders: obj.Orders || obj.orders || obj.orders7 || obj.orders3 || obj['30_orders'],
        sales: obj.Sales || obj.sales || obj.sales7 || obj.sales3 || obj['30_sales'],
        clicks: obj.Clicks || obj.clicks || obj.clicks7 || obj.clicks3,
        impressions: obj.Impressions || obj.impressions || obj.impressions7 || obj.impressions3,
      });
    }
  }

  function visit(value, source, depth = 0) {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, source, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    maybeRecord(value, source, depth);
    for (const item of Object.values(value)) {
      if (item && typeof item === 'object') visit(item, source, depth + 1);
    }
  }

  for (const file of files) {
    const raw = readJson(file, null);
    if (!raw) continue;
    visit(raw, file, 0);
  }

  return evidenceBySku;
}

function historicalFiles() {
  const files = [];
  const adjustmentDir = path.join(ROOT, 'data', 'adjustments');
  if (fs.existsSync(adjustmentDir)) {
    for (const name of fs.readdirSync(adjustmentDir)) {
      if (/^adjustments_2026-05-\d{2}\.json$/.test(name)) files.push(path.join(adjustmentDir, name));
    }
  }
  for (const file of [
    path.join(ROOT, 'data', 'learning', 'followup_review_2026-05-15.json'),
    path.join(ROOT, 'data', 'learning', 'overbudget_scope_2026-05-15.json'),
    path.join(ROOT, 'data', 'snapshots', 'action_schema_2026-05-22_season_title_ads.json'),
    path.join(ROOT, 'data', 'snapshots', 'action_schema_2026-05-23_daily_recovery_combined.json'),
  ]) {
    if (fs.existsSync(file)) files.push(file);
  }
  return files;
}

function textSourcesForCandidate(card = {}, listing = {}, profile = {}) {
  return [
    listing.title,
    listing.pageTitle,
    card.title,
    card.listingTitle,
    card.solrTerm,
    card.productLabels,
    profile.productType,
    ...(Array.isArray(profile.productTypes) ? profile.productTypes : []),
    ...(Array.isArray(profile.targetAudience) ? profile.targetAudience : []),
    ...(Array.isArray(profile.occasion) ? profile.occasion : []),
    ...(Array.isArray(profile.seasonality) ? profile.seasonality : []),
    profile.visualTheme,
    profile.positioning,
    profile.categoryPath,
  ].flat().map(text).filter(Boolean);
}

function visualHints(textValue) {
  const src = lower(textValue);
  const hits = [];
  const has = pattern => pattern.test(src);

  if (has(/\bcna\b|nursing assistant|nurse|nursing|healthcare|caregiver|medical assistant|hospital|rn\b|badge reel|lanyard|id holder|scrub/)) {
    hits.push({ score: 50, label: 'direct nursing/medical cue', direction: '直接护理/医护人群' });
  }
  if (has(/key\s*chain|keychain|badge|lanyard|id holder|badge reel/)) {
    hits.push({ score: 36, label: 'small work accessory', direction: '工牌/钥匙扣/随身小礼' });
  }
  if (has(/notebook|journal|notepad|sticky note|memo|planner|pen\b|pens\b|marker|clipboard/)) {
    hits.push({ score: 34, label: 'shift/office writing item', direction: '值班办公/笔记用品' });
  }
  if (has(/\btote\b|bag|pouch|makeup bag|cosmetic bag|wallet|card holder|passport holder|coin purse/)) {
    hits.push({ score: 30, label: 'practical bag/pouch', direction: '实用收纳/女性护理礼物' });
  }
  if (has(/mug|cup|tumbler|water bottle|glass cup|coffee/)) {
    hits.push({ score: 28, label: 'drinkware gift', direction: '杯子/值班饮品礼物' });
  }
  if (has(/bracelet|necklace|earring|jewelry|brooch|pin\b|charm|pocket mirror|mirror/)) {
    hits.push({ score: 26, label: 'wearable/personal gift', direction: '女性饰品/随身礼物' });
  }
  if (has(/appreciation|thank you|thanks|employee|staff|coworker|volunteer|office|team|bulk gift|gift set|party favor|favor/)) {
    hits.push({ score: 24, label: 'appreciation/bulk gift', direction: '团队感谢/批量发放' });
  }
  if (has(/graduation|graduate|pinning|new job|retirement|congratulation/)) {
    hits.push({ score: 22, label: 'career milestone', direction: '毕业/入职/退休节点' });
  }
  if (has(/inspirational|encouragement|prayer|bible|christian|mental health|self care|affirmation|blessing/)) {
    hits.push({ score: 20, label: 'encouragement/self-care', direction: '情绪鼓励/自我照顾礼' });
  }
  if (has(/teacher|school counselor|administrative|secretary|boss|social worker|customer service|housekeeping|custodian/)) {
    hits.push({ score: 16, label: 'role-appreciation adjacent', direction: '岗位感谢礼迁移' });
  }
  if (has(/wedding|bridal|bachelorette|baby shower|cruise|patriotic|4th of july|easter|valentine|halloween|christmas|tablecloth|balloon|duck|hat|sash/)) {
    hits.push({ score: -18, label: 'off-theme event cue', direction: '非护理主题，需人工确认' });
  }
  return hits;
}

function classifyCandidate(card, listing, profile, evidence, imageUrls, stockMin) {
  const inventory = inventoryBreakdown(card);
  const sources = textSourcesForCandidate(card, listing, profile);
  const sourceText = sources.join(' | ');
  const hints = visualHints(sourceText);
  const positiveScore = hints.reduce((sum, hit) => sum + hit.score, 0);
  const historyScore = evidence?.orders > 0
    ? 100
    : evidence?.clicks > 0
      ? 55
      : evidence?.impressions > 0
        ? 35
        : evidence?.events > 0
          ? 25
          : 0;
  const stockScore = inventory.total >= stockMin ? 15 : 0;
  const imageScore = imageUrls.length ? 10 : 0;
  const score = historyScore + stockScore + imageScore + positiveScore;
  const directions = uniq(hints.filter(hit => hit.score > 0).map(hit => hit.direction));
  const hintLabels = uniq(hints.map(hit => hit.label));
  let level = '排除';

  if (evidence?.orders > 0) level = '历史成交必看';
  else if (score >= 85 || (historyScore >= 55 && positiveScore >= 20)) level = '强候选';
  else if (score >= 52) level = '可蹭候选';
  else if (historyScore > 0 || score >= 32) level = '弱候选待审';

  return {
    score,
    level,
    directions,
    hintLabels,
    discoveryText: sources.slice(0, 6),
    inventory,
  };
}

function normalizeEvidence(bucket) {
  if (!bucket) return null;
  return {
    sku: bucket.sku,
    orders: Number(bucket.orders.toFixed(2)),
    sales: Number(bucket.sales.toFixed(2)),
    clicks: Number(bucket.clicks.toFixed(2)),
    impressions: Number(bucket.impressions.toFixed(2)),
    events: bucket.events,
    sources: [...bucket.sources],
    samples: bucket.samples,
    summary: shortMetricEvidence(bucket),
  };
}

function amazonUrl(asin) {
  return `https://www.amazon.com/dp/${encodeURIComponent(text(asin))}`;
}

function imageFileName(sku, index, url) {
  const ext = (new URL(url).pathname.match(/\.(jpg|jpeg|png|webp)$/i)?.[1] || 'jpg').toLowerCase();
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 10);
  return `${sku}_${String(index + 1).padStart(2, '0')}_${hash}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

async function downloadImages(rows, imageDir, maxImagesPerSku) {
  fs.mkdirSync(imageDir, { recursive: true });
  for (const row of rows) {
    row.localImages = [];
    const urls = row.imageUrls.slice(0, maxImagesPerSku);
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      const file = path.join(imageDir, imageFileName(row.sku, i, url));
      const rel = path.relative(path.dirname(row.paths.html), file).replace(/\\/g, '/');
      if (!fs.existsSync(file)) {
        try {
          const response = await fetch(url, {
            headers: {
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.length > 0) fs.writeFileSync(file, buffer);
        } catch (error) {
          row.imageDownloadErrors = row.imageDownloadErrors || [];
          row.imageDownloadErrors.push(`${url}: ${error.message}`);
        }
      }
      if (fs.existsSync(file)) row.localImages.push(rel);
    }
  }
}

function renderHtml(rows, excludedRows, summary, paths) {
  const levelButtons = ['历史成交必看', '强候选', '可蹭候选', '弱候选待审'];
  const rowHtml = rows.map(row => {
    const imageSources = row.localImages?.length ? row.localImages : row.imageUrls.slice(0, 4);
    const images = imageSources.length
      ? imageSources.map(src => `<img src="${htmlEscape(src)}" alt="${htmlEscape(row.sku)}">`).join('')
      : '<div class="no-image">NO IMAGE</div>';
    const samples = row.historyEvidence?.samples?.map(sample => (
      `<li><b>${htmlEscape(sample.source)}</b>: ${htmlEscape(sample.text)} <span>${htmlEscape(shortMetricEvidence(sample))}</span></li>`
    )).join('') || '<li>no CNA/Nurse ad history</li>';
    return `
      <article class="card" data-level="${htmlEscape(row.level)}">
        <div class="media">${images}</div>
        <div class="body">
          <div class="topline"><span class="level">${htmlEscape(row.level)}</span><span class="score">score ${row.score}</span></div>
          <h2>${htmlEscape(row.sku)} <small>${htmlEscape(row.asin)}</small></h2>
          <p class="stock">${htmlEscape(row.inventory.label)}</p>
          <p><b>产品形态线索</b>: ${htmlEscape(row.productForm || '待看图确认')}</p>
          <p><b>可蹭方向</b>: ${htmlEscape(row.directions.join(' / ') || '待看图确认')}</p>
          <p><b>历史CNA/Nurse证据</b>: ${htmlEscape(row.historyEvidence?.summary || 'none')}</p>
          <details><summary>证据样例 / 发现线索</summary><ul>${samples}</ul><p>${htmlEscape(row.discoveryText.join(' | '))}</p></details>
          <p><a href="${htmlEscape(row.amazonUrl)}" target="_blank">Amazon</a></p>
        </div>
      </article>`;
  }).join('\n');

  const excludedHtml = excludedRows.slice(0, 120).map(row => (
    `<tr><td>${htmlEscape(row.sku)}</td><td>${htmlEscape(row.asin)}</td><td>${htmlEscape(row.inventory.total)}</td><td>${htmlEscape(row.productForm || '')}</td><td>${htmlEscape(row.historyEvidence?.summary || '')}</td></tr>`
  )).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CNA Candidate SKU Image Board ${htmlEscape(summary.date)}</title>
  <style>
    body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 0; background: #f6f7f8; color: #1f2933; }
    header { position: sticky; top: 0; z-index: 2; background: #ffffff; border-bottom: 1px solid #d8dee4; padding: 14px 18px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    .meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; color: #52616b; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 1px solid #b8c2cc; background: #fff; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    button.active { background: #124e78; color: #fff; border-color: #124e78; }
    main { padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; }
    .card { background: #fff; border: 1px solid #d8dee4; border-radius: 8px; overflow: hidden; display: grid; grid-template-columns: 180px 1fr; min-height: 250px; }
    .media { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 112px; gap: 4px; padding: 8px; background: #f0f2f4; align-content: start; }
    img { width: 100%; height: 112px; object-fit: contain; background: #fff; border: 1px solid #e5e8eb; border-radius: 4px; }
    .no-image { grid-column: 1 / -1; display: grid; place-items: center; height: 230px; color: #73808c; background: #fff; border: 1px dashed #b8c2cc; }
    .body { padding: 10px 12px; font-size: 13px; line-height: 1.45; }
    .topline { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .level { display: inline-block; background: #e8f3ff; color: #124e78; border-radius: 999px; padding: 3px 8px; font-weight: 700; }
    .score { color: #73808c; }
    h2 { margin: 8px 0; font-size: 18px; }
    small { color: #73808c; font-size: 12px; font-weight: 400; display: block; margin-top: 2px; }
    p { margin: 6px 0; }
    .stock { color: #41505c; }
    details { margin-top: 8px; }
    ul { padding-left: 18px; margin: 6px 0; }
    li span { color: #73808c; }
    table { width: 100%; border-collapse: collapse; background: #fff; margin-top: 20px; font-size: 13px; }
    th, td { border: 1px solid #d8dee4; padding: 6px 8px; text-align: left; }
    th { background: #eef2f5; }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .card { grid-template-columns: 1fr; }
      .media { grid-template-columns: repeat(4, 1fr); grid-auto-rows: 90px; }
      img { height: 90px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>CNA 候选 SKU 图片审图板 ${htmlEscape(summary.date)}</h1>
    <div class="meta">
      <span>库存阈值: ${summary.stockMin}+</span>
      <span>Amazon库存池: ${summary.amazonStockPool}</span>
      <span>主审图候选: ${summary.included}</span>
      <span>排除/低优先: ${summary.excluded}</span>
      <span>历史广告命中SKU: ${summary.historySkus}</span>
      <span>图片缺失: ${summary.missingImages}</span>
    </div>
    <div class="filters">
      <button class="active" data-filter="all">全部</button>
      ${levelButtons.map(level => `<button data-filter="${htmlEscape(level)}">${htmlEscape(level)}</button>`).join('')}
    </div>
  </header>
  <main>
    <section class="grid">${rowHtml}</section>
    <h2>排除/低优先样例</h2>
    <table><thead><tr><th>SKU</th><th>ASIN</th><th>库存</th><th>产品形态线索</th><th>历史证据</th></tr></thead><tbody>${excludedHtml}</tbody></table>
  </main>
  <script>
    document.querySelectorAll('button[data-filter]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('button[data-filter]').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        const filter = button.dataset.filter;
        document.querySelectorAll('.card').forEach(card => {
          card.style.display = filter === 'all' || card.dataset.level === filter ? '' : 'none';
        });
      });
    });
  </script>
</body>
</html>`;
}

function writeCsv(file, rows) {
  const headers = [
    'level',
    'sku',
    'asin',
    'inventoryTotal',
    'inventoryBreakdown',
    'productForm',
    'historyEvidence',
    'directions',
    'score',
    'amazonUrl',
    'imageUrls',
  ];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push([
      row.level,
      row.sku,
      row.asin,
      row.inventory.total,
      row.inventory.label,
      row.productForm,
      row.historyEvidence?.summary || '',
      row.directions.join('; '),
      row.score,
      row.amazonUrl,
      row.imageUrls.join(' '),
    ].map(csvCell).join(','));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function sortedRows(rows) {
  return rows.sort((a, b) => (
    (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9)
    || b.historyOrders - a.historyOrders
    || b.score - a.score
    || b.inventory.total - a.inventory.total
    || a.sku.localeCompare(b.sku)
  ));
}

async function main() {
  const options = parseArgs();
  const snapshot = readJson(options.snapshot, {});
  const listingCache = readJson(options.listingCache, { entries: {} });
  const profiles = loadProductProfiles(options.productProfiles);
  const cards = (snapshot.productCards || [])
    .filter(card => text(card.sku) && text(card.asin) && listingDomainForSalesChannel(card.salesChannel) === 'amazon.com');
  const knownSkuSet = new Set(cards.map(card => text(card.sku).toUpperCase()));
  const cardBySku = new Map(cards.map(card => [text(card.sku).toUpperCase(), card]));

  const currentEvidence = collectCurrentAdEvidence(snapshot);
  const fileEvidence = collectHistoricalFileEvidence(historicalFiles(), knownSkuSet);
  const evidenceBySku = mergeEvidence(currentEvidence, fileEvidence);

  const candidateSkus = new Set();
  const stockPool = [];
  for (const card of cards) {
    const sku = text(card.sku).toUpperCase();
    const inventory = inventoryBreakdown(card);
    if (inventory.total >= options.stockMin) {
      stockPool.push(sku);
      candidateSkus.add(sku);
    }
  }
  for (const sku of evidenceBySku.keys()) candidateSkus.add(sku);

  const rows = [];
  for (const sku of candidateSkus) {
    const card = cardBySku.get(sku);
    if (!card) continue;
    const listing = listingForCard(card, listingCache);
    const profile = profiles.get(sku) || {};
    const imageUrls = imageUrlsFromListing(listing);
    const evidence = normalizeEvidence(evidenceBySku.get(sku));
    const classification = classifyCandidate(card, listing, profile, evidence, imageUrls, options.stockMin);
    const productForm = uniq([
      profile.productType,
      ...(Array.isArray(profile.productTypes) ? profile.productTypes : []),
      profile.visualTheme,
      classification.hintLabels.filter(label => !label.includes('off-theme')).join(', '),
    ]).slice(0, 5).join(' / ');
    rows.push({
      date: options.date,
      sku,
      asin: text(card.asin).toUpperCase(),
      amazonUrl: amazonUrl(card.asin),
      level: classification.level,
      score: classification.score,
      inventory: classification.inventory,
      imageUrls,
      localImages: [],
      productForm,
      directions: classification.directions,
      historyEvidence: evidence,
      historyOrders: evidence?.orders || 0,
      discoveryText: classification.discoveryText,
      paths: {},
    });
  }

  const included = sortedRows(rows.filter(row => row.level !== '排除')).slice(0, options.candidateLimit);
  const includedSet = new Set(included.map(row => row.sku));
  const excluded = sortedRows(rows.filter(row => row.level === '排除' || !includedSet.has(row.sku)));

  const base = path.join(ROOT, 'data', 'tasks');
  const html = path.join(base, `cna_candidate_image_board_${options.date}.html`);
  const json = path.join(base, `cna_candidate_image_board_${options.date}.json`);
  const csv = path.join(base, `cna_candidate_image_board_${options.date}.csv`);
  const queue = path.join(base, `cna_candidate_listing_queue_${options.date}.json`);
  const missingQueue = path.join(base, `cna_candidate_missing_image_queue_${options.date}.json`);
  const imageDir = path.join(base, `cna_candidate_images_${options.date}`);

  for (const row of [...included, ...excluded]) {
    row.paths = { html, json, csv, queue, missingQueue, imageDir };
  }

  if (options.downloadImages) {
    await downloadImages(included, imageDir, options.maxImagesPerSku);
  }

  const summary = {
    date: options.date,
    stockMin: options.stockMin,
    amazonSkuCount: cards.length,
    amazonStockPool: stockPool.length,
    historySkus: evidenceBySku.size,
    included: included.length,
    excluded: excluded.length,
    missingImages: included.filter(row => !row.imageUrls.length && !row.localImages.length).length,
    generatedAt: new Date().toISOString(),
    snapshot: path.relative(ROOT, options.snapshot),
    listingCache: path.relative(ROOT, options.listingCache),
    note: 'Image/product-form first; CNA/Nurse ad history is a weighting and forced-inclusion signal; stale listing copy is not treated as fit proof.',
  };

  writeJson(json, { summary, rows: included, excludedRows: excluded });
  writeCsv(csv, included);
  writeJson(queue, {
    businessDate: options.date,
    reason: 'CNA candidate image-board listing image fetch queue; generated from inventory>=10 plus CNA/Nurse ad-history forced inclusions.',
    skus: included.map(row => row.sku),
    items: included.map(row => ({
      sku: row.sku,
      asin: row.asin,
      selectedEvent: 'CNA Week / National Nursing Assistants Week',
      selectedStatus: row.level,
      adActions: 0,
    })),
  });
  const missingImageRows = included.filter(row => !row.imageUrls.length && !row.localImages.length);
  writeJson(missingQueue, {
    businessDate: options.date,
    reason: 'CNA candidate image-board missing image retry queue.',
    skus: missingImageRows.map(row => row.sku),
    items: missingImageRows.map(row => ({
      sku: row.sku,
      asin: row.asin,
      selectedEvent: 'CNA Week / National Nursing Assistants Week',
      selectedStatus: row.level,
      adActions: 0,
    })),
  });
  fs.writeFileSync(html, renderHtml(included, excluded, summary, { html, json, csv, queue, imageDir }), 'utf8');

  console.log(JSON.stringify({
    summary,
    paths: { html, json, csv, queue, missingQueue, imageDir },
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
