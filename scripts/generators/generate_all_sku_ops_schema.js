const fs = require('fs');
const path = require('path');
const { analyzeAllowedOperationScope } = require('../../src/operation_scope');
const { assessAdOperatingContext } = require('../../src/inventory_economics');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundBid(value, min = 0.05) {
  return Number(Math.max(min, value).toFixed(2));
}

function isEnabled(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function isPaused(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '2' || text === 'paused' || text === 'disabled' || text === 'ended';
}

function isEffectivelyEnabled(row) {
  if (!isEnabled(row.state)) return false;
  if (row.campaignState !== undefined && row.campaignState !== '' && !isEnabled(row.campaignState)) return false;
  if (row.groupState !== undefined && row.groupState !== '' && !isEnabled(row.groupState)) return false;
  return true;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stats(row, key) {
  const s = row?.[`stats${key}`] || {};
  return {
    spend: num(s.spend ?? s.Spend),
    sales: num(s.sales ?? s.Sales),
    orders: num(s.orders ?? s.Orders),
    clicks: num(s.clicks ?? s.Clicks),
    impressions: num(s.impressions ?? s.Impressions),
    acos: num(s.acos ?? s.ACOS),
  };
}

function acosFor(s, price) {
  const sales = num(s.sales) || num(s.orders) * num(price);
  if (sales > 0) return num(s.spend) / sales;
  return num(s.spend) > 0 ? 99 : 0;
}

function entityLabel(row) {
  return normalizeText(row.text || row.keywordText || row.targetText || row.targetingExpression || row.asin || row.sku || row.label || '');
}

function entityName(entityType, row, campaignName, groupName) {
  const label = entityLabel(row);
  const typeText = {
    keyword: 'SP keyword',
    autoTarget: 'SP auto target',
    manualTarget: 'SP manual target',
    productAd: 'SP product ad',
    sbKeyword: 'SB keyword',
    sbTarget: 'SB target',
  }[entityType] || entityType;
  const parts = [];
  if (label) parts.push(`${typeText} "${label}"`);
  else parts.push(typeText);
  if (campaignName) parts.push(`campaign "${campaignName}"`);
  if (groupName && groupName !== campaignName) parts.push(`ad group "${groupName}"`);
  return parts.join(' in ');
}

function collectEntities(card) {
  const rows = [];
  for (const campaign of card.campaigns || []) {
    const campaignName = normalizeText(campaign.name || campaign.campaignName);
    const groupName = normalizeText(campaign.groupName || campaign.adGroupName);
    const base = {
      campaignId: String(campaign.campaignId || ''),
      adGroupId: String(campaign.adGroupId || ''),
      accountId: campaign.accountId || '',
      siteId: campaign.siteId || 4,
      campaignName,
      groupName,
      campaignState: campaign.campaignState || campaign.state || '',
      groupState: campaign.groupState || '',
    };
    rows.push({
      ...base,
      id: String(campaign.campaignId || ''),
      entityType: 'campaign',
      currentBudget: num(campaign.budget),
      budget: num(campaign.budget),
      placementTop: campaign.placementTop,
      placementProductPage: campaign.placementProductPage || campaign.placementPage,
      placementRestOfSearch: campaign.placementRestOfSearch,
      state: campaign.state || campaign.campaignState || '',
    });
    for (const row of campaign.keywords || []) rows.push({ ...row, ...base, id: String(row.id || ''), entityType: 'keyword' });
    for (const row of campaign.autoTargets || []) rows.push({ ...row, ...base, id: String(row.id || ''), entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget' });
    for (const row of campaign.productAds || []) rows.push({ ...row, ...base, id: String(row.id || ''), entityType: 'productAd' });
    for (const row of campaign.sponsoredBrands || []) rows.push({ ...row, ...base, id: String(row.id || ''), entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword' });
  }
  return rows.filter(row => row.id && row.entityType);
}

function minBid(row) {
  if ((row.entityType === 'sbKeyword' || row.entityType === 'sbTarget') && /sbv|video/i.test(row.campaignName || '')) return 0.25;
  return 0.05;
}

function makeBidAction(card, row, suggestedBid, reason, evidence, riskLevel) {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'bid',
    currentBid: num(row.bid),
    suggestedBid,
    text: entityLabel(row),
    label: entityLabel(row),
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: row.campaignId || '',
    adGroupId: row.adGroupId || '',
    reason,
    evidence,
    confidence: 0.82,
    riskLevel,
    actionSource: ['codex'],
  };
}

function makePauseAction(card, row, reason, evidence) {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'pause',
    text: entityLabel(row),
    label: entityLabel(row),
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: row.campaignId || '',
    adGroupId: row.adGroupId || '',
    reason,
    evidence,
    confidence: 0.78,
    riskLevel: 'waste_pause',
    actionSource: ['codex'],
  };
}

function makeEnableAction(card, row, reason, evidence, riskLevel) {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'enable',
    text: entityLabel(row),
    label: entityLabel(row),
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: row.campaignId || row.id || '',
    adGroupId: row.adGroupId || '',
    reason,
    evidence,
    confidence: 0.76,
    riskLevel,
    actionSource: ['codex'],
  };
}

function makeBudgetAction(card, row, suggestedBudget, reason, evidence, riskLevel) {
  return {
    id: String(row.id),
    entityType: 'campaign',
    actionType: 'budget',
    currentBudget: num(row.currentBudget ?? row.budget),
    suggestedBudget,
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: row.campaignId || row.id || '',
    adGroupId: row.adGroupId || '',
    reason,
    evidence,
    confidence: 0.8,
    riskLevel,
    actionSource: ['codex'],
  };
}

function makeCreateAction(card, mode, coreTerm, matchType, bid, keywords, dailyBudget, reason, evidence, riskLevel) {
  const ctx = card.createContext || {};
  return {
    id: `create::${card.sku}::${mode}::${matchType || 'auto'}::${coreTerm}`,
    entityType: 'skuCandidate',
    actionType: 'create',
    createInput: {
      advType: 'SP',
      mode,
      sku: card.sku,
      asin: card.asin,
      accountId: ctx.accountId,
      siteId: ctx.siteId || 4,
      dailyBudget,
      defaultBid: bid,
      coreTerm,
      matchType,
      keywords,
    },
    campaignName: `sp_${mode}_${coreTerm}_${String(card.sku || '').toLowerCase()}`,
    reason,
    evidence,
    confidence: 0.78,
    riskLevel,
    actionSource: ['codex'],
  };
}

function skuStats(card) {
  const ad30 = card.adStats?.['30d'] || {};
  const sb30 = card.sbStats?.['30d'] || {};
  const ad7 = card.adStats?.['7d'] || {};
  const sb7 = card.sbStats?.['7d'] || {};
  const ad3 = card.adStats?.['3d'] || {};
  const sb3 = card.sbStats?.['3d'] || {};
  return {
    spend30: num(ad30.spend) + num(sb30.spend),
    orders30: num(ad30.orders) + num(sb30.orders),
    clicks30: num(ad30.clicks) + num(sb30.clicks),
    impressions30: num(ad30.impressions) + num(sb30.impressions),
    spend7: num(ad7.spend) + num(sb7.spend),
    orders7: num(ad7.orders) + num(sb7.orders),
    spend3: num(ad3.spend) + num(sb3.spend),
    orders3: num(ad3.orders) + num(sb3.orders),
  };
}

function actionEvidence(card, row, s7, s30) {
  const name = entityName(row.entityType, row, row.campaignName, row.groupName);
  const sellable3 = num(card.sellableDays_3d);
  const sellable7 = num(card.sellableDays_7d);
  const sellable30 = num(card.sellableDays_30d || card.invDays);
  return [
    `SKU ${card.sku}: sellable days 3/7/30=${sellable3.toFixed(0)}/${sellable7.toFixed(0)}/${sellable30.toFixed(0)}, fulfillable ${num(card.fulFillable).toFixed(0)}, units 3/7/30=${num(card.unitsSold_3d).toFixed(0)}/${num(card.unitsSold_7d).toFixed(0)}/${num(card.unitsSold_30d).toFixed(0)}`,
    `${name}: 7d ${num(s7.impressions).toFixed(0)} impressions / ${num(s7.clicks).toFixed(0)} clicks / spend ${num(s7.spend).toFixed(2)} / ${num(s7.orders).toFixed(0)} orders`,
    `${name}: 30d ${num(s30.impressions).toFixed(0)} impressions / ${num(s30.clicks).toFixed(0)} clicks / spend ${num(s30.spend).toFixed(2)} / ${num(s30.orders).toFixed(0)} orders`,
  ];
}

function extractTermSeeds(card) {
  const profile = card.productProfile || {};
  const raw = [
    card.solrTerm,
    profile.productType,
    profile.positioning,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    card.listing?.title,
  ].filter(Boolean).join(' ');
  return [...new Set(String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s{2,}|[,;|]+/)
    .map(item => normalizeText(item))
    .filter(item => item.length >= 4 && item.length <= 70))]
    .slice(0, 12);
}

function hasAdType(entities, type) {
  return entities.some(row => row.entityType === type && isEnabled(row.state));
}

function campaignStatsFromChildren(campaignId, rows, price) {
  const total = { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
  for (const row of rows) {
    if (String(row.campaignId || '') !== String(campaignId || '') || row.entityType === 'campaign') continue;
    const s30 = stats(row, '30d');
    total.spend += s30.spend;
    total.sales += s30.sales;
    total.orders += s30.orders;
    total.clicks += s30.clicks;
    total.impressions += s30.impressions;
  }
  total.acos = acosFor(total, price);
  return total;
}

function campaignHasReopenValue(campaign, rows, price) {
  const c30 = campaignStatsFromChildren(campaign.id, rows, price);
  const c7 = { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
  for (const row of rows) {
    if (String(row.campaignId || '') !== String(campaign.id || '') || row.entityType === 'campaign') continue;
    const s7 = stats(row, '7d');
    c7.spend += s7.spend;
    c7.sales += s7.sales;
    c7.orders += s7.orders;
    c7.clicks += s7.clicks;
    c7.impressions += s7.impressions;
  }
  c7.acos = acosFor(c7, price);
  const lowAcos30 = c30.orders >= 1 && c30.acos > 0 && c30.acos <= 0.24;
  const lowAcos7 = c7.orders >= 1 && c7.acos > 0 && c7.acos <= 0.2;
  return { c30, c7, shouldReopen: lowAcos30 || lowAcos7 };
}

function generatePlans(snapshot, options = {}) {
  const limitRaw = options.limit ?? process.env.ALL_SKU_ACTION_LIMIT ?? 0;
  const maxActions = Number(limitRaw) > 0 ? Number(limitRaw) : Infinity;
  const perSkuRaw = options.maxPerSku ?? process.env.ALL_SKU_MAX_ACTIONS_PER_SKU ?? 0;
  const maxPerSku = Number(perSkuRaw) > 0 ? Number(perSkuRaw) : Infinity;
  const scope = analyzeAllowedOperationScope(snapshot);
  const allowed = scope.allowedSkuSet;
  const cards = (snapshot.productCards || []).filter(card => allowed.has(String(card.sku || '').toUpperCase()));
  const candidates = [];

  for (const card of cards) {
    const price = num(card.price);
    const sku = skuStats(card);
    const operating = assessAdOperatingContext(card, { currentDate: process.env.AD_OPS_CURRENT_DATE || '2026-04-29' });
    const entitiesAll = collectEntities(card);
    const entities = entitiesAll.filter(row => isEffectivelyEnabled(row) && !row.onCooldown);
    const rowCandidates = [];
    const sellableDays3 = num(card.sellableDays_3d);
    const sellableDays7 = num(card.sellableDays_7d);
    const invDays = num(card.sellableDays_30d || card.invDays);
    const fulfillable = num(card.fulFillable);
    const profitRate = num(card.profitRate);
    const sold3 = num(card.unitsSold_3d);
    const sold7 = num(card.unitsSold_7d);
    const sold30 = num(card.unitsSold_30d);
    const shortStockByVelocity = (sellableDays3 > 0 && sellableDays3 <= 7) || (sellableDays7 > 0 && sellableDays7 <= 10) || (invDays > 0 && invDays <= 21);
    const hasInventoryResponsibility = fulfillable >= 20 && invDays >= 45 && !shortStockByVelocity;
    const trafficShort = sku.impressions30 < 2500 || sku.clicks30 < 45;
    const conversionBad = sku.clicks30 >= 45 && sku.orders30 === 0;
    const canBuildOrPush = hasInventoryResponsibility && !operating.readiness?.disallowNewAds && !operating.readiness?.disallowScaleActions;

    for (const row of entities) {
      const s7 = stats(row, '7d');
      const s30 = stats(row, '30d');
      const bid = num(row.bid);
      const a30 = acosFor(s30, price);
      const a7 = acosFor(s7, price);
      const evidence = actionEvidence(card, row, s7, s30);
      const name = entityName(row.entityType, row, row.campaignName, row.groupName);

      if (['keyword', 'autoTarget', 'manualTarget', 'sbKeyword', 'sbTarget'].includes(row.entityType) && bid > 0) {
        const clearWaste = (s30.spend >= 4 && s30.orders === 0 && s30.clicks >= 8) || (s7.spend >= 2.5 && s7.orders === 0 && s7.clicks >= 5);
        if (clearWaste) {
          const next = roundBid(bid * 0.9, minBid(row));
          if (next < bid) {
            rowCandidates.push({
              score: 80 + s30.spend + s7.spend,
              action: makeBidAction(
                card,
                row,
                next,
                `This is not a SKU-level cut. ${name} has kept taking clicks without orders, so I am trimming this traffic source first and leaving the rest of the SKU structure to keep testing.`,
                evidence,
                'waste_control'
              ),
            });
          }
          continue;
        }

        const provenLowAcos = s30.orders >= 1 && a30 > 0 && a30 <= 0.18 && s30.clicks <= 35 && sku.impressions30 < 12000 && hasInventoryResponsibility;
        const recentLowAcos = s7.orders >= 1 && a7 > 0 && a7 <= 0.15 && s7.clicks <= 18 && hasInventoryResponsibility;
        if (provenLowAcos || recentLowAcos) {
          const next = roundBid(bid * 1.08, minBid(row));
          if (next > bid) {
            rowCandidates.push({
              score: 65 + s30.orders * 4 - a30 * 10,
              action: makeBidAction(
                card,
                row,
                next,
                `I am not opening broad spend on the whole SKU. ${name} has already shown it can convert at a controlled cost, and the SKU still has inventory, so this is a small traffic repair on the proven entry only.`,
                evidence,
                'controlled_traffic_repair'
              ),
            });
          }
        }
      }

      if (row.entityType === 'productAd') {
        const productAdWaste = s30.spend >= 7 && s30.orders === 0 && s30.clicks >= 12 && sku.orders30 > 0;
        if (productAdWaste) {
          rowCandidates.push({
            score: 70 + s30.spend,
            action: makePauseAction(
              card,
              row,
              `This product ad is spending without sales while the SKU still has other advertising paths. I am pausing this placement instead of cutting the full SKU, so budget can move back to traffic that has a better chance to convert.`,
              evidence
            ),
          });
        }
      }
    }

    if (canBuildOrPush && trafficShort && profitRate > 0 && (sold30 > 0 || invDays >= 120)) {
      const terms = extractTermSeeds(card);
      const evidence = [
        `SKU ${card.sku}: traffic is thin at 30d ${sku.impressions30.toFixed(0)} impressions / ${sku.clicks30.toFixed(0)} clicks, sellable days 3/7/30 ${sellableDays3.toFixed(0)}/${sellableDays7.toFixed(0)}/${invDays.toFixed(0)}, units 3/7/30 ${sold3.toFixed(0)}/${sold7.toFixed(0)}/${sold30.toFixed(0)}, fulfillable ${fulfillable.toFixed(0)}, profit rate ${(profitRate * 100).toFixed(1)}%`,
        `Operating judgement: ${operating.finalAction || 'unknown'}`,
      ];
      if (!hasAdType(entitiesAll, 'autoTarget') && card.createContext?.accountId) {
        rowCandidates.push({
          score: 95 + invDays / 10,
          action: makeCreateAction(
            card,
            'auto',
            `auto ${String(card.sku).toLowerCase()} coverage`,
            '',
            0.28,
            [],
            invDays >= 180 ? 2 : 1,
            'The SKU has inventory responsibility but not enough traffic coverage. I am adding a low-budget SP auto campaign to find whether Amazon can discover converting queries before we scale manual terms.',
            evidence,
            'coverage_build'
          ),
        });
      }
      if (terms.length >= 3 && !hasAdType(entitiesAll, 'keyword') && card.createContext?.accountId) {
        rowCandidates.push({
          score: 92 + invDays / 12,
          action: makeCreateAction(
            card,
            'keywordTarget',
            `kw ${String(card.sku).toLowerCase()} coverage`,
            'PHRASE',
            0.32,
            terms,
            invDays >= 180 ? 2 : 1,
            'The SKU has sell-through responsibility and almost no manual keyword coverage. I am opening a small phrase campaign from the product theme instead of waiting for organic traffic.',
            evidence,
            'coverage_build'
          ),
        });
      }
    }

    if (canBuildOrPush && !conversionBad) {
      const pausedCampaignRows = entitiesAll.filter(row =>
        row.entityType === 'campaign' &&
        isPaused(row.campaignState || row.state) &&
        num(row.currentBudget) > 0
      );
      for (const campaign of pausedCampaignRows) {
        const { c30, c7, shouldReopen } = campaignHasReopenValue(campaign, entitiesAll, price);
        if (shouldReopen && (trafficShort || sku.orders7 < sku.orders30 / 30 * 7 * 0.75)) {
          rowCandidates.push({
            score: 86 + c30.orders * 3 + c7.orders * 5,
            action: makeEnableAction(
              card,
              campaign,
              `The SKU needs traffic and this paused campaign used to convert. I am reopening the parent campaign first instead of changing bids inside a closed structure, so the test is measurable and the child rows can actually serve.`,
              [
                `SKU ${card.sku}: sellable days 3/7/30 ${sellableDays3.toFixed(0)}/${sellableDays7.toFixed(0)}/${invDays.toFixed(0)}, units 3/7/30 ${sold3.toFixed(0)}/${sold7.toFixed(0)}/${sold30.toFixed(0)}, profit rate ${(profitRate * 100).toFixed(1)}%`,
                `Campaign "${campaign.campaignName}" is paused; 30d ${c30.impressions.toFixed(0)} impressions / ${c30.clicks.toFixed(0)} clicks / ${c30.orders.toFixed(0)} orders / ACOS ${c30.acos.toFixed(4)}`,
                `Campaign "${campaign.campaignName}" 7d ${c7.impressions.toFixed(0)} impressions / ${c7.clicks.toFixed(0)} clicks / ${c7.orders.toFixed(0)} orders / ACOS ${c7.acos.toFixed(4)}`,
              ],
              'reopen_proven_campaign'
            ),
          });
        }
      }

      const campaignRows = entities.filter(row => row.entityType === 'campaign' && num(row.currentBudget) > 0);
      for (const campaign of campaignRows) {
        const c30 = campaignStatsFromChildren(campaign.id, entitiesAll, price);
        if (c30.orders >= 3 && c30.acos > 0 && c30.acos <= 0.2 && num(campaign.currentBudget) <= 5) {
          const nextBudget = Number(Math.min(8, num(campaign.currentBudget) * 1.25 + 0.5).toFixed(2));
          if (nextBudget > num(campaign.currentBudget)) {
            rowCandidates.push({
              score: 88 + c30.orders * 3,
              action: makeBudgetAction(
                card,
                campaign,
                nextBudget,
                `The campaign "${campaign.campaignName}" is converting at a controlled cost and budget is still small. I am increasing the daily budget moderately so the proven structure is not capped too early.`,
                [
                  `SKU ${card.sku}: campaign "${campaign.campaignName}" 30d spend ${c30.spend.toFixed(2)} / orders ${c30.orders.toFixed(0)} / ACOS ${c30.acos.toFixed(4)}`,
                  `Current daily budget ${num(campaign.currentBudget).toFixed(2)}, suggested ${nextBudget.toFixed(2)}`,
                ],
                'budget_scale'
              ),
            });
          }
        }
      }
    }

    rowCandidates.sort((a, b) => b.score - a.score);
    const actions = rowCandidates.slice(0, maxPerSku).map(item => item.action);
    if (actions.length) {
      candidates.push({
        score: rowCandidates.reduce((sum, item) => sum + item.score, 0),
        plan: {
          sku: card.sku,
          asin: card.asin || '',
          summary: `Reviewed all active ad forms for SKU ${card.sku}: SP keywords, SP auto/manual targets, SP product ads, and SB rows where present. The actions only touch clear waste or proven low-ACOS traffic; the SKU itself is not being blindly cut or pushed.`,
          actions,
        },
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const plans = [];
  let count = 0;
  for (const item of candidates) {
    if (count >= maxActions) break;
    const remaining = maxActions - count;
    const actions = item.plan.actions.slice(0, remaining);
    if (!actions.length) continue;
    plans.push({ ...item.plan, actions });
    count += actions.length;
  }
  return plans;
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', `all_sku_codex_action_schema_${new Date().toISOString().slice(0, 10)}.json`);
  const limit = Number(process.argv[4] || process.env.ALL_SKU_ACTION_LIMIT || 0);
  if (!snapshotFile) throw new Error('Usage: node scripts/generators/generate_all_sku_ops_schema.js <snapshot.json> [output.json] [limit]');
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const plans = generatePlans(snapshot, { limit });
  const flat = plans.flatMap(plan => plan.actions.map(action => ({ sku: plan.sku, entityType: action.entityType, actionType: action.actionType, riskLevel: action.riskLevel })));
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    plannedSkus: plans.length,
    plannedActions: flat.length,
    counts: flat.reduce((acc, item) => {
      acc[item.actionType] = (acc[item.actionType] || 0) + 1;
      acc[item.entityType] = (acc[item.entityType] || 0) + 1;
      acc[item.riskLevel] = (acc[item.riskLevel] || 0) + 1;
      return acc;
    }, {}),
    topSkus: plans.slice(0, 15).map(plan => ({ sku: plan.sku, actions: plan.actions.length, summary: plan.summary })),
  }, null, 2));
}

module.exports = { generatePlans };

if (require.main === module) main();
