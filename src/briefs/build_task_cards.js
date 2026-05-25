const fs = require('fs');
const path = require('path');
const { buildDailyTaskBoard } = require('../task_board');

const CARD_LAYERS = ['P0', 'P1', 'P2', 'Data Missing'];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniq(list = []) {
  return [...new Set((list || []).map(text).filter(Boolean))];
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function compactEvidence(task = {}) {
  const facts = task.facts || {};
  const sales = facts.sales || {};
  const ads = facts.ads || {};
  const inventory = facts.inventory || {};
  const structure = facts.productStructure || {};
  const d7 = ads.d7 || {};
  const d30 = ads.d30 || {};
  return {
    sales: {
      units7d: num(sales.units7d),
      units30d: num(sales.units30d),
      profitRate: num(sales.profitRate, null),
      netProfit: num(sales.netProfit, null),
      yoySalesPct: sales.yoySalesPct ?? null,
    },
    ads: {
      spend7d: num(d7.spend),
      orders7d: num(d7.orders),
      acos7d: num(d7.acos, null),
      spend30d: num(d30.spend),
      orders30d: num(d30.orders),
      acos30d: num(d30.acos, null),
      adDependency: num(ads.adDependency, null),
    },
    inventory: {
      ful: num(inventory.ful),
      res: num(inventory.res),
      local: num(inventory.local),
      sellableDays: num(inventory.sellableDays),
      staleRisk: inventory.staleRisk === true,
    },
    product: {
      productType: text(structure.productType),
      isSeasonal: structure.isSeasonal === true,
      isReservedPage: structure.isReservedPage === true,
      variantGroup: text(structure.variantGroup),
      seasonWindows: (facts.seasonWindows || []).slice(0, 5),
      operatingFinalAction: text(facts.operatingFinalAction),
    },
  };
}

function candidateActions(task = {}) {
  return uniq([
    task.suggestedAction,
    ...(task.possibleSignals || []).map(signal => signal.type),
  ]).slice(0, 8);
}

function buildTaskCard(task = {}, layer = '') {
  return {
    taskId: text(task.boardTaskId || task.contextId || `${task.sku || task.asin || 'task'}::${task.primaryTaskType || layer}`),
    layer: layer || text(task.priority || 'P2'),
    priority: text(task.priority || layer),
    sku: text(task.sku),
    asin: text(task.asin),
    site: text(task.site || 'Amazon.com'),
    primaryTaskType: text(task.primaryTaskType),
    decisionSummary: text(task.decisionSummary || task.priorityReason),
    priorityReason: text(task.priorityReason),
    keyEvidence: compactEvidence(task),
    evidenceNotes: uniq([
      ...(task.factsConsidered || []),
      ...(task.possibleSignals || []).map(signal => signal.reason),
    ]).slice(0, 8),
    candidateActions: candidateActions(task),
    risks: uniq([...(task.riskNotes || []), ...(task.guardrailBlocks || [])]).slice(0, 8),
    missingData: uniq(task.dataMissing || task.missingData || []),
    history: {
      lastAdjustedAt: task.lastAdjustedAt || null,
      cooldown: task.cooldown || null,
      sourceRunId: text(task.sourceRunId),
    },
    executableHint: task.boardExecutableHint === true || task.taskBoardSuggestedExecutable === true,
    reviewRequired: task.reviewRequired === true,
    confidence: num(task.confidence, 0),
    mergedSignals: uniq(task.mergedSignals || []).slice(0, 8),
    guardrailStatus: text(task.guardrailStatus),
  };
}

function ensureBoard(poolOrBoard = {}, options = {}) {
  if (poolOrBoard.layers && poolOrBoard.summary) return poolOrBoard;
  return buildDailyTaskBoard(poolOrBoard, options);
}

function summarizeLayer(cards = []) {
  return {
    count: cards.length,
    executable: cards.filter(card => card.executableHint).length,
    reviewRequired: cards.filter(card => card.reviewRequired).length,
    missingData: cards.filter(card => card.missingData.length).length,
    byTaskType: cards.reduce((acc, card) => {
      const key = card.primaryTaskType || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}

function buildTaskCards(poolOrBoard = {}, options = {}) {
  const board = ensureBoard(poolOrBoard, options);
  const layers = {};
  for (const layer of CARD_LAYERS) {
    layers[layer] = (board.layers?.[layer] || []).map(task => buildTaskCard(task, layer));
  }
  const summary = Object.fromEntries(CARD_LAYERS.map(layer => [layer, summarizeLayer(layers[layer])]));
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    time: board.time || poolOrBoard.time || null,
    source: {
      boardTaskCount: board.summary?.boardTaskCount || 0,
      fullContextCount: board.summary?.fullContextCount || poolOrBoard.summary?.total || 0,
      suppressedLowPriority: board.summary?.byLayer?.['Low Priority'] || 0,
    },
    summary,
    layers,
  };
}

function writeTaskCards(poolOrBoard, outFile, options = {}) {
  const taskCards = buildTaskCards(poolOrBoard, options);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(taskCards, null, 2), 'utf8');
  return taskCards;
}

module.exports = {
  CARD_LAYERS,
  buildTaskCard,
  buildTaskCards,
  writeTaskCards,
};
