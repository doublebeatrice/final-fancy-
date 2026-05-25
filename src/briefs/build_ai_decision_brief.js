const fs = require('fs');
const path = require('path');
const { buildTaskCards } = require('./build_task_cards');

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniq(list = []) {
  return [...new Set((list || []).map(text).filter(Boolean))];
}

function compactCard(card = {}) {
  return {
    taskId: card.taskId,
    priority: card.priority,
    sku: card.sku,
    asin: card.asin,
    primaryTaskType: card.primaryTaskType,
    decisionSummary: card.decisionSummary,
    keyEvidence: card.keyEvidence,
    candidateActions: card.candidateActions,
    risks: card.risks,
    missingData: card.missingData,
    historyActionSummary: {
      lastAdjustedAt: card.history?.lastAdjustedAt || null,
      cooldown: card.history?.cooldown || null,
    },
    executableHint: card.executableHint,
    reviewRequired: card.reviewRequired,
    confidence: card.confidence,
  };
}

function summarizeP2(cards = []) {
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
    topSignals: cards.reduce((acc, card) => {
      for (const signal of card.mergedSignals || []) acc[signal] = (acc[signal] || 0) + 1;
      return acc;
    }, {}),
  };
}

function buildAiDecisionBrief(taskCardsOrPool = {}, options = {}) {
  const taskCards = taskCardsOrPool.layers?.P0
    ? taskCardsOrPool
    : buildTaskCards(taskCardsOrPool, options);
  const p0Limit = Number(options.p0Limit || 10);
  const p1Limit = Number(options.p1Limit || 20);
  const p0 = (taskCards.layers.P0 || []).slice(0, p0Limit).map(compactCard);
  const p1 = (taskCards.layers.P1 || []).slice(0, p1Limit).map(compactCard);
  const dataMissing = (taskCards.layers['Data Missing'] || []).map(card => ({
    taskId: card.taskId,
    sku: card.sku,
    asin: card.asin,
    missingData: card.missingData,
    primaryTaskType: card.primaryTaskType,
    risks: uniq(card.risks),
  }));
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    time: taskCards.time || null,
    policy: {
      p0Limit,
      p1Limit,
      p2Mode: 'summary_only',
      forbiddenPayloads: ['raw snapshot payload', 'raw product card array', 'raw keyword row array'],
    },
    summary: {
      taskCards: taskCards.summary,
      included: {
        P0: p0.length,
        P1: p1.length,
        P2: 'summary_only',
        DataMissing: dataMissing.length,
      },
    },
    tasks: {
      P0: p0,
      P1: p1,
      P2: summarizeP2(taskCards.layers.P2 || []),
      DataMissing: dataMissing,
    },
  };
}

function writeAiDecisionBrief(taskCardsOrPool, outFile, options = {}) {
  const brief = buildAiDecisionBrief(taskCardsOrPool, options);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(brief, null, 2), 'utf8');
  return brief;
}

module.exports = {
  buildAiDecisionBrief,
  compactCard,
  writeAiDecisionBrief,
};
