const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PANEL_ID = '4091B6ED260DB71319767EFD24A46F55';
const HISTORY_FILE = path.join(__dirname, 'adjustment_history.json');
const today = new Date().toISOString().slice(0, 10);
const LOG_FILE = path.join(__dirname, 'snapshots', 'auto_run_' + today + '.log');

const month = new Date().getMonth() + 1;
const isQ4 = month >= 10;

const SEASONAL_KEYWORDS = [
  'lab week', 'laboratory week', 'medical lab',
  'nurse', 'nursing', 'nurses week',
  'teacher appreciation', 'teacher week',
  'mother', 'mom',
  'prom', 'graduation',
  'dispatcher', 'telecommunicator',
  'memorial day', 'father', 'dad',
];

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

function getLastDir(history, entityId) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recent = history.filter(h => h.entityId === entityId && h.date >= cutoff);
  return recent.length > 0 ? recent[recent.length - 1].direction : null;
}

function isSeasonal(card) {
  const text = [
    card.note || '',
    ...card.campaigns.flatMap(c => c.keywords.map(k => k.text || '')),
    ...card.campaigns.map(c => c.name || '')
  ].join(' ').toLowerCase();
  return SEASONAL_KEYWORDS.some(kw => text.includes(kw));
}

function analyzeCard(card, history) {
  const baseTarget = isQ4
    ? (card.busyNetProfit > 0 ? card.busyNetProfit : card.netProfit)
    : (card.netProfit > 0 ? card.netProfit : 0);
  const effectiveTarget = baseTarget > 0 ? baseTarget : (card.seaProfitRate * 0.5);
  const seasonal = isSeasonal(card);
  const target = seasonal ? effectiveTarget * 1.3 : effectiveTarget;
  const lowStock = card.invDays > 0 && card.invDays <= 2;
  if (card.invDays === 0 && card.unitsSold_30d === 0 && card.adStats['30d'].orders === 0) return [];

  const actions = [];

  const process = (entity, entityType) => {
    if (!entity.id || entity.bid <= 0) return;
    const lastDir = getLastDir(history, entity.id);
    const { spend, orders, acos } = entity.stats30d;
    let newBid = null, reason = '';

    if (orders === 0 && spend > 3) {
      if (lastDir !== 'down') { newBid = Math.max(0.05, entity.bid * 0.5); reason = '0转化$' + spend.toFixed(2) + '降50%'; }
    } else if (orders === 0 && spend > 0.5) {
      if (lastDir !== 'down') { newBid = Math.max(0.05, entity.bid * 0.75); reason = '0转化$' + spend.toFixed(2) + '降25%'; }
    } else if (orders > 0 && acos > 0 && target > 0) {
      if (acos > target * 1.5 && !seasonal) {
        if (lastDir !== 'down') { newBid = Math.max(0.05, entity.bid * 0.8); reason = 'ACOS' + (acos*100).toFixed(0) + '%超目标降20%'; }
      } else if (acos < target * 0.6 && !lowStock) {
        if (lastDir !== 'up') { newBid = Math.min(entity.bid * 1.2, entity.bid + 0.15); reason = 'ACOS' + (acos*100).toFixed(0) + '%低于目标提20%'; }
      }
    }

    if (newBid && Math.abs(newBid - entity.bid) > 0.01) {
      actions.push({
        entityType, id: entity.id,
        currentBid: entity.bid,
        suggestedBid: parseFloat(newBid.toFixed(2)),
        reason: reason + (entity.onCooldown ? '(冷却期)' : ''),
        direction: newBid > entity.bid ? 'up' : 'down'
      });
    }
  };

  for (const camp of card.campaigns) {
    camp.keywords.forEach(kw => process(kw, 'keyword'));
    camp.autoTargets.forEach(at => process(at, 'autoTarget'));
  }
  return actions;
}

module.exports = { log, loadHistory, saveHistory, analyzeCard, PANEL_ID, LOG_FILE, today };
