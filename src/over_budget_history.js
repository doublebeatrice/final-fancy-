const fs = require('fs');
const path = require('path');

const DEFAULT_HISTORY_FILE = path.join('data', 'over_budget_history.json');

function readHistory(file = DEFAULT_HISTORY_FILE) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.campaigns) return parsed;
  } catch (_) {}
  return { campaigns: {}, updatedAt: '' };
}

function writeHistory(history, file = DEFAULT_HISTORY_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(history, null, 2));
}

function updateHistoryFromSnapshot(snapshot = {}, options = {}) {
  const file = options.file || DEFAULT_HISTORY_FILE;
  const observedAt = options.observedAt || snapshot.exportedAt || new Date().toISOString();
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) {
    throw new Error(`updateHistoryFromSnapshot: invalid observedAt ${observedAt}`);
  }
  // Anything we haven't seen in this many hours is considered "released" and the cap_since clock resets.
  const staleHours = Number(options.staleHours ?? 36);
  const staleMs = staleHours * 60 * 60 * 1000;

  const history = readHistory(file);
  const campaigns = history.campaigns || {};
  const currentRowCampaignIds = new Set();
  for (const row of snapshot.overBudgetRows || []) {
    if (row.__overBudgetSource && row.__overBudgetSource !== 'SP') continue;
    if (!row.campaignId) continue;
    currentRowCampaignIds.add(String(row.campaignId));
  }

  for (const cid of currentRowCampaignIds) {
    const existing = campaigns[cid];
    if (!existing) {
      campaigns[cid] = { firstSeenAt: observedAt, lastSeenAt: observedAt, capSince: observedAt };
      continue;
    }
    const lastSeenMs = Date.parse(existing.lastSeenAt || existing.firstSeenAt || '');
    if (!Number.isFinite(lastSeenMs) || observedMs - lastSeenMs > staleMs) {
      // gap longer than staleHours — treat as new cap event
      existing.capSince = observedAt;
    }
    existing.lastSeenAt = observedAt;
    if (!existing.firstSeenAt) existing.firstSeenAt = observedAt;
  }

  // optionally prune entries we haven't seen in a long time to keep file small
  const pruneAfterDays = Number(options.pruneAfterDays ?? 30);
  const pruneCutoffMs = observedMs - pruneAfterDays * 24 * 60 * 60 * 1000;
  for (const [cid, entry] of Object.entries(campaigns)) {
    const last = Date.parse(entry.lastSeenAt || '');
    if (Number.isFinite(last) && last < pruneCutoffMs) delete campaigns[cid];
  }

  history.campaigns = campaigns;
  history.updatedAt = observedAt;
  writeHistory(history, file);
  return history;
}

function annotateCapSince(snapshot = {}, options = {}) {
  const file = options.file || DEFAULT_HISTORY_FILE;
  const referenceTime = options.referenceTime || snapshot.exportedAt || new Date().toISOString();
  const referenceMs = Date.parse(referenceTime);
  const history = options.history || readHistory(file);
  const campaigns = history.campaigns || {};

  const annotations = new Map();
  for (const [cid, entry] of Object.entries(campaigns)) {
    const capSinceMs = Date.parse(entry.capSince || entry.firstSeenAt || '');
    if (!Number.isFinite(capSinceMs) || !Number.isFinite(referenceMs)) continue;
    const cappedHours = Math.max(0, (referenceMs - capSinceMs) / (60 * 60 * 1000));
    annotations.set(String(cid), {
      capSince: entry.capSince,
      cappedHours: Number(cappedHours.toFixed(1)),
    });
  }
  return annotations;
}

module.exports = {
  DEFAULT_HISTORY_FILE,
  readHistory,
  writeHistory,
  updateHistoryFromSnapshot,
  annotateCapSince,
};
