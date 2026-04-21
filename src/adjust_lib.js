const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PANEL_ID = '4091B6ED260DB71319767EFD24A46F55'; // legacy, auto_adjust.js now finds panel dynamically
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'adjustment_history.json');
const today = new Date().toISOString().slice(0, 10);
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const LOG_FILE = path.join(SNAPSHOTS_DIR, 'auto_run_' + today + '.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

const month = new Date().getMonth() + 1;
const isQ4 = month >= 10;

const AD_RATE_CAP_NEW   = 0.11;
const AD_RATE_CAP_OLD   = 0.08;
const NEW_PRODUCT_DAYS  = 90;
const CLICK_THRESH_HARD = 30;
const CLICK_THRESH_SOFT = 15;
const MIN_CLICKS_UP     = 10;
const MIN_ORDERS_UP     = 2;
const ACOS_DOWN_HARD    = 2.0;
const ACOS_DOWN_MED     = 1.6;
const ACOS_DOWN_MILD    = 1.3;
const ACOS_UP_STRONG    = 0.5;
const ACOS_UP_MILD      = 0.7;

function findPanelId() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const panel = tabs.find(tab => tab.url && tab.url.includes('panel.html') && tab.url.includes('chrome-extension'));
          if (!panel?.id) {
            reject(new Error('Cannot find extension panel page. Open the extension panel first.'));
            return;
          }
          resolve(panel.id);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function createPanelWs() {
  const panelId = await findPanelId();
  return new WebSocket(`ws://127.0.0.1:9222/devtools/page/${panelId}`);
}

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch(e) { return []; }
}

function saveHistory(h) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2));
}

function hasCooldown(history, entityId, direction) {
  const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  return history.some(h => h.entityId === entityId && h.date >= cutoff && h.direction === direction);
}

function hasRecentOutcome(history, predicate, outcomes, days = 7) {
  const allow = new Set(Array.isArray(outcomes) ? outcomes : [outcomes]);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return history.some(h => h && h.date >= cutoff && allow.has(h.outcome) && predicate(h));
}

function isNewProduct(card) {
  if (card.listingAgeDays != null) return card.listingAgeDays <= NEW_PRODUCT_DAYS;
  const note = (card.note || '').toLowerCase();
  return note.includes('新品') || note.includes('new launch');
}

function getSeasonalPhase(card) {
  if (!card.isSeasonal) return null;
  const days = card.seasonalDaysLeft;
  if (days == null) return 'peak';
  if (days > 14) return 'warmup';
  if (days >= 4) return 'peak';
  return 'tail';
}

function calcTargetTacos(card) {
  const base = isQ4
    ? (card.busyNetProfit > 0 ? card.busyNetProfit : card.netProfit)
    : (card.netProfit > 0 ? card.netProfit : 0);
  return base > 0 ? base : (card.seaProfitRate * 0.5 || 0.15);
}

function hasSignal(stats) {
  return !!stats && (stats.spend > 0 || stats.orders > 0 || stats.clicks > 0 || stats.impressions > 0);
}

function weightedStats(entity) {
  const windows = [
    { stats: entity.stats3d, weight: 4, label: '3d' },
    { stats: entity.stats7d, weight: 3, label: '7d' },
    { stats: entity.stats30d, weight: 1, label: '30d' },
  ].filter(w => hasSignal(w.stats));

  const active = windows.length ? windows : [{ stats: entity.stats30d || { spend: 0, orders: 0, clicks: 0 }, weight: 1, label: '30d' }];
  return active.reduce((acc, w) => {
    acc.spend += (w.stats.spend || 0) * w.weight;
    acc.orders += (w.stats.orders || 0) * w.weight;
    acc.clicks += (w.stats.clicks || 0) * w.weight;
    acc.windows.push(w.label);
    return acc;
  }, { spend: 0, orders: 0, clicks: 0, windows: [] });
}

function normalizeEntityState(value) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return 'UNKNOWN';
  if (text === '1' || text === 'ENABLED' || text === 'ENABLE' || text === 'ACTIVE') return 'ENABLED';
  if (text === '2' || text === 'PAUSED' || text === 'DISABLED' || text === 'ARCHIVED' || text === 'ENDED') return 'PAUSED';
  return text;
}

function analyzeCard(card, history) {
  if (card.invDays === 0 && card.unitsSold_30d === 0 && card.adStats['30d'].orders === 0) return [];

  const targetTacos = calcTargetTacos(card);
  if (targetTacos <= 0) return [];

  const phase      = getSeasonalPhase(card);
  const isNew      = isNewProduct(card);
  const adCap      = isNew ? AD_RATE_CAP_NEW : AD_RATE_CAP_OLD;
  const lowStock   = card.invDays > 0 && card.invDays <= 2;
  const veryLowStock = card.invDays > 0 && card.invDays <= 1;
  const limitedStock = card.invDays > 0 && card.invDays <= 3;
  const price      = card.price || 1;

  const rev30      = card.unitsSold_30d * price;
  const adRate     = rev30 > 0 ? card.adStats['30d'].spend / rev30 : 0;
  const adRateOver = adRate > adCap;

  const actions = [];

  const process = (entity, entityType) => {
    if (!entity.id || entity.bid <= 0) return;

    const s30 = entity.stats30d || { spend: 0, orders: 0, clicks: 0 };
    const weighted = weightedStats(entity);

    const wSpend  = weighted.spend;
    const wOrders = weighted.orders;
    // 有价格用 sales 口径；无价格 fallback 到广告系统自带 ACOS（纯广告口径）
    const wTacos = price > 0
      ? (wOrders > 0 ? wSpend / (wOrders * price) : (wSpend > 0 ? 99 : 0))
      : (wOrders > 0 ? (s30.acos || (wSpend / wOrders)) : (wSpend > 0 ? 99 : 0));
    const clicks30 = s30.clicks || 0;
    const entityState = normalizeEntityState(entity.state);
    const listingUnavailable = card.listing && card.listing.isAvailable === false;
    const lowRatingRisk = Number(card.listing?.reviewRating || 0) > 0 && Number(card.listing?.reviewRating || 0) < 3.8;
    const protectVisibility =
      (s30.orders || 0) >= 8 ||
      Number(card.unitsSold_30d || 0) >= 80 ||
      Number(card.adStats?.['30d']?.orders || 0) >= 12;
    const zeroOrderPauseClicks = (isNew || phase === 'warmup') ? 55 : 45;

    let newBid = null, reason = '', direction = '';

    if (entityState !== 'PAUSED') {
      let pauseReason = '';
      if (listingUnavailable) {
        pauseReason = 'Listing unavailable，暂停广告避免无效消耗';
      } else if (veryLowStock && s30.spend > 1) {
        pauseReason = `库存仅 ${card.invDays} 天且广告仍在消耗，先暂停保库存`;
      } else if (limitedStock && !protectVisibility && wOrders === 0 && s30.spend > 2) {
        pauseReason = `库存仅 ${card.invDays} 天且近期无转化，先暂停避免缺货前空烧`;
      } else if (wOrders === 0 && clicks30 >= zeroOrderPauseClicks && s30.spend > 3) {
        pauseReason = `30天 ${clicks30} 点击 0 订单，暂停止损`;
      } else if (!protectVisibility && wOrders <= 1 && wTacos > targetTacos * 2.5 && clicks30 >= 20) {
        pauseReason = `TACoS ${(wTacos * 100).toFixed(0)}% 严重超目标，暂停复盘`;
      } else if (phase === 'tail' && wOrders === 0 && s30.spend > 1) {
        pauseReason = '节气尾声且近期无转化，暂停避免尾季浪费';
      } else if (lowRatingRisk && clicks30 >= 15 && wOrders === 0) {
        pauseReason = `评分 ${Number(card.listing.reviewRating).toFixed(1)} 偏低且无转化，暂停等待 listing 修复`;
      }

      if (pauseReason) {
        actions.push({
          entityType,
          id: entity.id,
          actionType: 'pause',
          currentBid: entity.bid,
          reason: pauseReason,
          snapshot: {
            state: entityState,
            wTacos: parseFloat((wTacos * 100).toFixed(1)),
            targetTacos: parseFloat((targetTacos * 100).toFixed(1)),
            clicks30,
            orders30: s30.orders,
            spend30: parseFloat(s30.spend.toFixed(2)),
            invDays: card.invDays,
          },
        });
        return;
      }
    }

    if (entityState === 'PAUSED') {
      let enableReason = '';
      if (!listingUnavailable && !veryLowStock) {
        if (protectVisibility && !limitedStock && ((s30.orders || 0) > 0 || clicks30 >= 8 || (s30.spend || 0) > 3)) {
          enableReason = '产品仍有稳定销量，需要恢复广告维持展示份额';
        } else if ((phase === 'warmup' || phase === 'peak') && (s30.orders > 0 || clicks30 >= 8)) {
          enableReason = `节气 ${phase} 进入放量窗口，恢复投放争取曝光`;
        } else if (wOrders >= 2 && wTacos > 0 && wTacos <= targetTacos) {
          enableReason = `历史转化稳定且 TACoS ${(wTacos * 100).toFixed(0)}% 达标，可重新开启`;
        } else if (s30.orders >= 1 && clicks30 >= 10 && !adRateOver) {
          enableReason = '近30天已验证有转化，恢复投放继续拿量';
        } else if (!limitedStock && s30.orders >= 3 && wTacos <= targetTacos * 1.2) {
          enableReason = '近30天转化重新回暖，恢复投放观察能否重新起量';
        }
      }

      if (enableReason) {
        actions.push({
          entityType,
          id: entity.id,
          actionType: 'enable',
          currentBid: entity.bid,
          reason: enableReason,
          snapshot: {
            state: entityState,
            wTacos: parseFloat((wTacos * 100).toFixed(1)),
            targetTacos: parseFloat((targetTacos * 100).toFixed(1)),
            clicks30,
            orders30: s30.orders,
            spend30: parseFloat(s30.spend.toFixed(2)),
            invDays: card.invDays,
          },
        });
      }
      return;
    }

    if (wOrders === 0) {
      if (clicks30 >= CLICK_THRESH_HARD && s30.spend > 1) {
        if (!hasCooldown(history, entity.id, 'down')) {
          newBid = Math.max(0.05, entity.bid * 0.70);
          reason = '零转化' + clicks30 + '次点击$' + s30.spend.toFixed(2) + '降30%';
          direction = 'down';
        }
      } else if (clicks30 >= CLICK_THRESH_SOFT && s30.spend > 0.5) {
        if (!hasCooldown(history, entity.id, 'down')) {
          newBid = Math.max(0.05, entity.bid * 0.85);
          reason = '零转化' + clicks30 + '次点击$' + s30.spend.toFixed(2) + '降15%';
          direction = 'down';
        }
      }
    }

    if (newBid === null && wOrders > 0 && wTacos > 0) {
      const blockUp = phase === 'tail' || lowStock || adRateOver;

      if (wTacos > targetTacos * ACOS_DOWN_HARD) {
        if (!hasCooldown(history, entity.id, 'down')) {
          newBid = Math.max(0.05, entity.bid * 0.70);
          reason = 'TACoS' + (wTacos*100).toFixed(0) + '%超目标x2降30%';
          direction = 'down';
        }
      } else if (wTacos > targetTacos * ACOS_DOWN_MED) {
        if (!hasCooldown(history, entity.id, 'down')) {
          newBid = Math.max(0.05, entity.bid * 0.80);
          reason = 'TACoS' + (wTacos*100).toFixed(0) + '%超目标x1.6降20%';
          direction = 'down';
        }
      } else if (wTacos > targetTacos * ACOS_DOWN_MILD && !card.isSeasonal) {
        if (!hasCooldown(history, entity.id, 'down')) {
          newBid = Math.max(0.05, entity.bid * 0.90);
          reason = 'TACoS' + (wTacos*100).toFixed(0) + '%超目标x1.3降10%';
          direction = 'down';
        }
      } else if (!blockUp && s30.clicks >= MIN_CLICKS_UP && wOrders >= MIN_ORDERS_UP) {
        if (wTacos < targetTacos * ACOS_UP_STRONG) {
          if (!hasCooldown(history, entity.id, 'up')) {
            newBid = Math.min(entity.bid * 1.15, entity.bid + 0.20);
            reason = 'TACoS' + (wTacos*100).toFixed(0) + '%低于目标x0.5强势+15%';
            direction = 'up';
          }
        } else if (wTacos < targetTacos * ACOS_UP_MILD) {
          if (!hasCooldown(history, entity.id, 'up')) {
            newBid = Math.min(entity.bid * 1.08, entity.bid + 0.10);
            reason = 'TACoS' + (wTacos*100).toFixed(0) + '%低于目标x0.7稳健+8%';
            direction = 'up';
          }
        }
      }
    }

    if (newBid === null && (phase === 'warmup' || phase === 'peak') && !lowStock && !adRateOver) {
      if (wOrders >= MIN_ORDERS_UP && s30.clicks >= MIN_CLICKS_UP && wTacos > 0 && wTacos <= targetTacos) {
        if (!hasCooldown(history, entity.id, 'up')) {
          newBid = Math.min(entity.bid * 1.10, entity.bid + 0.15);
          reason = '节气' + phase + ' TACoS' + (wTacos*100).toFixed(0) + '%达标放量+10%';
          direction = 'up';
        }
      }
    }

    if (newBid !== null && Math.abs(newBid - entity.bid) > 0.01) {
      const tags = [
        adRateOver ? '广告占比' + (adRate*100).toFixed(0) + '%超' + (adCap*100).toFixed(0) + '%上限' : '',
        phase ? '[' + phase + ']' : '',
        isNew ? '[新品]' : '',
      ].filter(Boolean).join(' ');

      actions.push({
        entityType,
        id: entity.id,
        currentBid: entity.bid,
        suggestedBid: parseFloat(newBid.toFixed(2)),
        reason: reason + (tags ? ' ' + tags : ''),
        direction,
        snapshot: {
          wTacos: parseFloat((wTacos * 100).toFixed(1)),
          targetTacos: parseFloat((targetTacos * 100).toFixed(1)),
          clicks30,
          orders30: s30.orders,
          spend30: parseFloat(s30.spend.toFixed(2)),
          adRate: parseFloat((adRate * 100).toFixed(1)),
          windows: weighted.windows,
        },
      });
    }
  };

  for (const camp of card.campaigns) {
    camp.keywords.forEach(kw => process(kw, 'keyword'));
    camp.autoTargets.forEach(at => process(at, 'autoTarget'));
    (camp.sponsoredBrands || []).forEach(sb => process(sb, sb.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword'));
  }
  return actions;
}

module.exports = { log, loadHistory, saveHistory, analyzeCard, hasRecentOutcome, PANEL_ID, LOG_FILE, SNAPSHOTS_DIR, today, findPanelId, createPanelWs };
